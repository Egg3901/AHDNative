import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { deserializeSave, serializeSave } from "../save.js";
import { advanceTurn } from "../engine.js";
import { TURN_PHASES } from "../phases/registry.js";
import { computeConfidence } from "./constants.js";
import {
  DISCOUNT_WINDOW_CAP_FRACTION,
  DISCOUNT_WINDOW_SPREAD_PP,
  DISCOUNT_WINDOW_STIGMA,
  canDraw,
  discountWindowRatePercent,
  discountWindowStigma,
  discountWindowTurnPhase,
  drawDiscountWindow,
  quoteDiscountWindow,
  repayDiscountWindow,
  serviceDiscountWindowInterest,
} from "./discountWindow.js";
import { bankSolvencyTurnPhase } from "./bankSolvencyTurn.js";

const OPTS = { seed: "discount-window-test", playerName: "P", countryId: "US", era: "1953" };
const STAMP = "2026-09-10T00:00:00.000Z";

function fundedWorld() {
  const world = createWorld(OPTS);
  world.centralBanks["US"]!.primeRate = 5;
  world.centralBanks["US"]!.externalBroadMoney = 0;
  const corp = world.corporations["US-financial"]!;
  corp.bankCharter!.npcDeposits = 1_000_000;
  corp.bankCharter!.cashReserves = 1_000_000;
  world.meta.turn = 1;
  return { world, corp, charter: corp.bankCharter! };
}

describe("discount-window pricing and quote (#327)", () => {
  it("charges prime plus the penalty spread, floored at zero", () => {
    expect(DISCOUNT_WINDOW_SPREAD_PP).toBe(3);
    expect(discountWindowRatePercent(5)).toBe(8);
    expect(discountWindowRatePercent(-10)).toBe(0);
  });

  it("sizes the cap against the deposit base and reports headroom net of debt", () => {
    const quote = quoteDiscountWindow({ npcDeposits: 1_000_000, discountWindowDebt: 100_000 }, 5);
    expect(quote.capAnchor).toBe(1_000_000 * DISCOUNT_WINDOW_CAP_FRACTION);
    expect(quote.headroomAnchor).toBe(quote.capAnchor - 100_000);
    expect(quote.ratePercent).toBe(8);
  });

  it("never reports negative headroom for a bank whose deposits shrank", () => {
    const quote = quoteDiscountWindow({ npcDeposits: 100_000, discountWindowDebt: 900_000 }, 5);
    expect(quote.headroomAnchor).toBe(0);
  });
});

describe("discount-window eligibility (#327)", () => {
  it("allows a deposit-taker inside its cap, including exactly the headroom", () => {
    const charter = { status: "active" as const, npcDeposits: 1_000_000, discountWindowDebt: 0 };
    expect(canDraw(charter, 100_000, 5).ok).toBe(true);
    expect(canDraw(charter, 1_000_000 * DISCOUNT_WINDOW_CAP_FRACTION, 5).ok).toBe(true);
  });

  it("refuses an inactive or missing charter", () => {
    const charter = { status: "failed" as const, npcDeposits: 1_000_000, discountWindowDebt: 0 };
    expect(canDraw(charter, 100, 5)).toEqual({ ok: false, reason: "charter_inactive" });
    expect(canDraw(null, 100, 5)).toEqual({ ok: false, reason: "charter_inactive" });
  });

  it("refuses a bank with no deposit base, a draw past the cap, and malformed amounts", () => {
    const noBase = { status: "active" as const, npcDeposits: 0, discountWindowDebt: 0 };
    expect(canDraw(noBase, 1, 5)).toEqual({ ok: false, reason: "no_deposits" });
    const charter = { status: "active" as const, npcDeposits: 1_000_000, discountWindowDebt: 0 };
    expect(canDraw(charter, 1_000_000, 5)).toEqual({ ok: false, reason: "cap_exhausted" });
    expect(canDraw(charter, 0, 5)).toEqual({ ok: false, reason: "invalid_amount" });
    expect(canDraw(charter, Number.NaN, 5)).toEqual({ ok: false, reason: "invalid_amount" });
  });
});

describe("discount-window draw (#327)", () => {
  it("moves cash and debt atomically and prices at the borrowing bank's own central bank", () => {
    const { world, corp, charter } = fundedWorld();
    const cashBefore = charter.cashReserves;
    const result = drawDiscountWindow(world, corp.id, 100_000);
    expect(result).toEqual({ outstanding: 100_000, ratePercent: 8 });
    expect(charter.cashReserves).toBe(cashBefore + 100_000);
    expect(charter.discountWindowDebt).toBe(100_000);
  });

  it("leaves state untouched on every refusal", () => {
    const { world, corp, charter } = fundedWorld();
    const overCap = charter.npcDeposits * DISCOUNT_WINDOW_CAP_FRACTION + 1;
    for (const amount of [overCap, 0, Number.NaN, -50]) {
      const before = JSON.stringify({ charter, cash: charter.cashReserves });
      expect(() => drawDiscountWindow(world, corp.id, amount)).toThrow();
      expect(JSON.stringify({ charter, cash: charter.cashReserves })).toBe(before);
    }
    // Unknown bank and missing central bank refuse without touching the world.
    const worldBefore = JSON.stringify(world);
    expect(() => drawDiscountWindow(world, "no-such-corp", 100)).toThrow();
    expect(JSON.stringify(world)).toBe(worldBefore);
  });

  it("refuses a draw when the borrowing bank's central bank is missing", () => {
    const { world, corp } = fundedWorld();
    delete (world.centralBanks as Record<string, unknown>)["US"];
    const before = JSON.stringify(world);
    expect(() => drawDiscountWindow(world, corp.id, 100)).toThrow(/central bank/i);
    expect(JSON.stringify(world)).toBe(before);
  });

  it("gates the unrounded amount like canDraw before the rounded re-gate", () => {
    const { world, corp, charter } = fundedWorld();
    const headroom = charter.npcDeposits * DISCOUNT_WINDOW_CAP_FRACTION;
    const amount = headroom + 0.4;
    expect(Math.round(amount)).toBe(headroom);
    expect(
      canDraw(
        { status: "active", npcDeposits: charter.npcDeposits, discountWindowDebt: 0 },
        amount,
        5,
      ),
    ).toEqual({ ok: false, reason: "cap_exhausted" });
    const before = JSON.stringify(world);
    expect(() => drawDiscountWindow(world, corp.id, amount)).toThrow();
    expect(JSON.stringify(world)).toBe(before);
  });
});

describe("discount-window repayment (#327)", () => {
  it("repays partially and in full, clamping an overpayment to outstanding", () => {
    const { world, corp, charter } = fundedWorld();
    drawDiscountWindow(world, corp.id, 100_000);
    const cashAfterDraw = charter.cashReserves;
    expect(repayDiscountWindow(world, corp.id, 40_000)).toEqual({
      repaid: 40_000,
      outstandingAfter: 60_000,
    });
    expect(charter.cashReserves).toBe(cashAfterDraw - 40_000);
    expect(repayDiscountWindow(world, corp.id, 999_999)).toEqual({
      repaid: 60_000,
      outstandingAfter: 0,
    });
    expect(charter.discountWindowDebt).toBe(0);
  });

  it("refuses repayment past available cash and with nothing outstanding, untouched", () => {
    const { world, corp, charter } = fundedWorld();
    drawDiscountWindow(world, corp.id, 100_000);
    charter.cashReserves = 10;
    const before = JSON.stringify(charter);
    expect(() => repayDiscountWindow(world, corp.id, 50_000)).toThrow("Insufficient cash");
    expect(JSON.stringify(charter)).toBe(before);

    charter.discountWindowDebt = 0;
    expect(() => repayDiscountWindow(world, corp.id, 100)).toThrow("Nothing is outstanding");
  });
});

describe("discount-window servicing (#327)", () => {
  it("collects interest from cash without touching principal and stamps idempotency", () => {
    const { world, charter } = fundedWorld();
    charter.discountWindowDebt = 100_000;
    const cashBefore = charter.cashReserves;
    serviceDiscountWindowInterest(world, 1);
    expect(charter.cashReserves).toBeCloseTo(cashBefore - (100_000 * 0.08) / 48, 2);
    expect(charter.discountWindowDebt).toBe(100_000);
    expect(charter.discountWindowArrears ?? 0).toBe(0);
    expect(charter.lastDiscountWindowTurn).toBe(1);
  });

  it("accrues the shortfall as arrears when cash cannot cover interest", () => {
    const { world, charter } = fundedWorld();
    charter.discountWindowDebt = 100_000;
    charter.cashReserves = 5;
    serviceDiscountWindowInterest(world, 1);
    const due = (100_000 * 0.08) / 48;
    expect(charter.cashReserves).toBe(0);
    expect(charter.discountWindowArrears ?? 0).toBeCloseTo(due - 5, 2);
    expect(charter.discountWindowDebt).toBe(100_000);
  });

  it("is idempotent within one turn and services again next turn", () => {
    const { world, charter } = fundedWorld();
    charter.discountWindowDebt = 100_000;
    serviceDiscountWindowInterest(world, 1);
    const afterFirst = JSON.stringify(charter);
    serviceDiscountWindowInterest(world, 1);
    expect(JSON.stringify(charter)).toBe(afterFirst);
    serviceDiscountWindowInterest(world, 2);
    expect(charter.lastDiscountWindowTurn).toBe(2);
    expect(charter.cashReserves).toBeLessThan(JSON.parse(afterFirst).cashReserves);
  });

  it("skips banks with no window debt and failed charters", () => {
    const { world, charter } = fundedWorld();
    const before = JSON.stringify(charter);
    serviceDiscountWindowInterest(world, 1);
    expect(JSON.stringify(charter)).toBe(before);

    charter.status = "failed";
    charter.discountWindowDebt = 10_000;
    serviceDiscountWindowInterest(world, 1);
    expect(charter.cashReserves).toBe(1_000_000);
    expect(charter.lastDiscountWindowTurn).not.toBe(1);
  });

  it("services pre-#327 saves that lack the window fields", () => {
    const { world, charter } = fundedWorld();
    const saved = JSON.parse(serializeSave(world, STAMP)) as {
      world: { corporations: Record<string, { bankCharter: Record<string, unknown> }> };
    };
    const savedCharter = saved.world.corporations["US-financial"]!.bankCharter;
    delete savedCharter["discountWindowDebt"];
    delete savedCharter["discountWindowArrears"];
    delete savedCharter["lastDiscountWindowTurn"];
    const loaded = deserializeSave(JSON.stringify(saved));
    const loadedCharter = loaded.corporations["US-financial"]!.bankCharter!;
    // Old shape loads clean and draws/servicing materialize the new fields.
    drawDiscountWindow(loaded, "US-financial", 50_000);
    loaded.meta.turn = 2;
    discountWindowTurnPhase.run(loaded, rngFromSeed("old-save-window"));
    expect(loadedCharter.discountWindowDebt).toBe(50_000);
    expect(loadedCharter.cashReserves).toBeLessThan(1_050_000);
    expect(loadedCharter.lastDiscountWindowTurn).toBe(2);
  });
});

describe("discount-window stigma (#327)", () => {
  it("is zero for a bank that never drew and scales with cap usage", () => {
    expect(discountWindowStigma({ npcDeposits: 1_000_000, discountWindowDebt: 0 })).toBe(0);
    expect(discountWindowStigma({ npcDeposits: 1_000_000, discountWindowDebt: undefined })).toBe(0);
    const small = discountWindowStigma({ npcDeposits: 400_000, discountWindowDebt: 100_000 });
    const large = discountWindowStigma({ npcDeposits: 40_000_000, discountWindowDebt: 100_000 });
    expect(small).toBeGreaterThan(large);
    expect(small).toBe(DISCOUNT_WINDOW_STIGMA);
  });

  it("caps at the full penalty past the cap and repaying clears it", () => {
    expect(
      discountWindowStigma({ npcDeposits: 100_000, discountWindowDebt: 900_000 }),
    ).toBe(DISCOUNT_WINDOW_STIGMA);
    const { world, corp, charter } = fundedWorld();
    drawDiscountWindow(world, corp.id, 100_000);
    expect(discountWindowStigma(charter)).toBeGreaterThan(0);
    repayDiscountWindow(world, corp.id, 100_000);
    expect(discountWindowStigma(charter)).toBe(0);
  });

  it("lowers solvency confidence without changing clean-bank scoring", () => {
    const base = {
      cashReserves: 500_000,
      cashBackedDeposits: 1_000_000,
      totalLoans: 200_000,
      reserveRatioRequired: 0.2,
      arrearsOutstanding: 0,
      defaultsLastTurn: 0,
      panicTurns: 0,
    };
    const clean = computeConfidence(base);
    const stained = computeConfidence({ ...base, discountWindowStigma: 0.05 });
    expect(stained.confidence).toBeCloseTo(clean.confidence - 0.05, 10);
    expect(computeConfidence({ ...base, discountWindowStigma: undefined }).confidence).toBe(
      clean.confidence,
    );
  });
});

describe("discount-window solvency integration (#327)", () => {
  it("settles the senior window claim before depositors on failure", () => {
    const { world, charter } = fundedWorld();
    charter.npcDeposits = 1_000_000;
    charter.cashReserves = 350_000;
    charter.discountWindowDebt = 4_000;
    charter.discountWindowArrears = 1_000;
    charter.warningBand = "red";
    charter.confidence = 0.1;
    world.meta.turn = 7;
    bankSolvencyTurnPhase.run(world, rngFromSeed("window-waterfall"));
    expect(charter.status).toBe("failed");
    expect(charter.discountWindowDebt).toBe(0);
    expect(charter.discountWindowArrears).toBe(0);
    // Flight took 300k, the 5k senior claim came next, depositors got the rest.
    expect(world.centralBanks["US"]!.externalBroadMoney).toBe(300_000 + 45_000);
    expect(charter.npcDeposits).toBe(0);
    expect(charter.cashReserves).toBe(0);
  });

  it("extinguishes an unpaid window claim the cash cannot cover", () => {
    const { world, charter } = fundedWorld();
    charter.npcDeposits = 1_000_000;
    charter.cashReserves = 0;
    charter.discountWindowDebt = 4_000;
    charter.warningBand = "red";
    charter.confidence = 0.1;
    world.meta.turn = 7;
    bankSolvencyTurnPhase.run(world, rngFromSeed("window-waterfall-short"));
    expect(charter.status).toBe("failed");
    expect(charter.discountWindowDebt).toBe(0);
  });
});

describe("discount-window phase ordering (#327)", () => {
  it("runs after bankingTurn and before lineOfCredit and solvency", () => {
    const names = TURN_PHASES.map((phase) => phase.name);
    const banking = names.indexOf("bankingTurn");
    const window = names.indexOf("discountWindowTurn");
    const loc = names.indexOf("playerLineOfCredit");
    const solvency = names.indexOf("bankSolvencyTurn");
    expect(banking).toBeGreaterThanOrEqual(0);
    expect(window).toBeGreaterThan(banking);
    expect(loc).toBeGreaterThan(window);
    expect(solvency).toBeGreaterThan(window);
  });

  it("services window interest the same turn before solvency scores", () => {
    const world = createWorld(OPTS);
    world.centralBanks["US"]!.primeRate = 5;
    world.centralBanks["US"]!.externalBroadMoney = 0;
    const charter = world.corporations["US-financial"]!.bankCharter!;
    charter.npcDeposits = 1_000_000;
    charter.cashReserves = 1_000_000;
    charter.discountWindowDebt = 100_000;
    const seen: Record<string, { cash: number; arrears: number }> = {};
    advanceTurn(world, {
      afterPhase(name, observed) {
        if (name === "discountWindowTurn" || name === "bankSolvencyTurn") {
          const c = observed.corporations["US-financial"]!.bankCharter!;
          seen[name] = { cash: c.cashReserves, arrears: c.discountWindowArrears ?? 0 };
        }
      },
    });
    expect(seen["discountWindowTurn"]).toBeDefined();
    expect(seen["bankSolvencyTurn"]).toBeDefined();
    // Solvency observed the post-servicing cash position (interest left the vault).
    expect(seen["bankSolvencyTurn"]!.cash).toBe(seen["discountWindowTurn"]!.cash);
    expect(seen["discountWindowTurn"]!.cash).toBeLessThan(1_000_000);
  });
});
