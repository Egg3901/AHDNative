/**
 * Interbank lending and servicing tests — issue #326.
 *
 * Each case names its source rule (AHDGame at e364c0495): decide.ts
 * lend/repay gates, interbankServicing.ts interest/arrears/default math,
 * bankingTurn.ts servicing slot, bankSolvencyTurn.ts lender-side confidence
 * and failure write-off. Solo has one chartered bank per country
 * (npcBanks.ts), so every case charters a synthetic second bank in the same
 * country — the reachable analog of source's two-charter market.
 */
import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { deserializeSave, serializeSave } from "../save.js";
import { bankingTurnPhase } from "./bankingTurn.js";
import { bankSolvencyTurnPhase } from "./bankSolvencyTurn.js";
import type { Corporation } from "../corporation/types.js";
import {
  INTERBANK_MAX_SHARE_OF_LENDABLE,
  interbankHeadroom,
  lendInterbank,
  quoteInterbankMax,
  repayInterbank,
  serviceInterbankLoans,
  sumInterbankDefaultsLastTurn,
} from "./interbank.js";

const OPTS = { seed: "interbank-test", playerName: "P", countryId: "US", era: "1953" };
const RNG = rngFromSeed("interbank-rng");

type World = ReturnType<typeof createWorld>;

function lenderOf(world: World): Corporation {
  return world.corporations["US-financial"]!;
}

/** Charter a second same-country bank on a non-bank corp (synthetic market peer). */
function charterPeer(world: World): Corporation {
  const peer = Object.values(world.corporations).find((c) => c.countryId === "US" && c.id !== "US-financial" && !c.bankCharter)!;
  const base = lenderOf(world).bankCharter!;
  peer.bankCharter = {
    ...structuredClone(base),
    cashReserves: 500_000,
    npcDeposits: 0,
    totalLoans: 0,
    totalDeposits: 0,
    interbankDebt: 0,
    lastBankingTurn: null,
    lastSolvencyTurn: null,
  };
  return peer;
}

function fundLender(world: World, npcDeposits = 1_000_000, cash = 1_000_000): void {
  const charter = lenderOf(world).bankCharter!;
  charter.npcDeposits = npcDeposits;
  charter.cashReserves = cash;
  charter.totalLoans = 0;
}

function snapshot(world: World): string {
  return JSON.stringify({ corps: world.corporations, loans: world.interbankLoans });
}

describe("lendInterbank — origination", () => {
  it("moves lender cash to borrower cash, books the loan and borrower debt atomically", () => {
    const world = createWorld(OPTS);
    const peer = charterPeer(world);
    fundLender(world);
    const lenderCash = lenderOf(world).bankCharter!.cashReserves;
    const borrowerCash = peer.bankCharter!.cashReserves;
    const totalLoans = lenderOf(world).bankCharter!.totalLoans;

    const result = lendInterbank(world, "US-financial", peer.id, 100_000, 4.8);
    expect(result.ok).toBe(true);
    const loan = result.ok ? result.value : null!;
    expect(loan).toMatchObject({
      lenderCorpId: "US-financial",
      borrowerCorpId: peer.id,
      principal: 100_000,
      outstanding: 100_000,
      ratePercent: 4.8,
      status: "current",
      arrearsTurns: 0,
    });
    expect(lenderOf(world).bankCharter!.cashReserves).toBeCloseTo(lenderCash - 100_000, 6);
    expect(peer.bankCharter!.cashReserves).toBeCloseTo(borrowerCash + 100_000, 6);
    expect(peer.bankCharter!.interbankDebt).toBe(100_000);
    // Interbank loans are NOT part of retail totalLoans (source interbank.ts).
    expect(lenderOf(world).bankCharter!.totalLoans).toBe(totalLoans);
    expect(peer.bankCharter!.totalLoans).toBe(0);
  });

  it("quotes the enforced cap: max succeeds, a dollar more is refused", () => {
    const world = createWorld(OPTS);
    const peer = charterPeer(world);
    fundLender(world);
    const quote = quoteInterbankMax(world, "US-financial");
    expect(quote.maxByShare).toBeCloseTo(INTERBANK_MAX_SHARE_OF_LENDABLE * interbankHeadroom(lenderOf(world).bankCharter!), 6);
    expect(quote.max).toBe(Math.min(quote.maxByShare, quote.lenderCash));
    expect(quote.max).toBeGreaterThan(0);
    expect(lendInterbank(world, "US-financial", peer.id, quote.max, 3).ok).toBe(true);
    expect(lendInterbank(world, "US-financial", peer.id, quote.max + 1, 3)).toEqual({
      ok: false,
      error: "Amount exceeds interbank share of lendable headroom",
    });
  });

  it.each([
    ["self-lending", (w: World, peer: Corporation) => lendInterbank(w, "US-financial", "US-financial", 1_000, 3), "A bank cannot lend to itself on the interbank market"],
    ["inactive borrower charter", (w: World, peer: Corporation) => lendInterbank(w, "US-financial", peer.id, 1_000, 3), "Borrower must have an active bank charter"],
    ["unknown lender", (w: World) => lendInterbank(w, "nope", "US-financial", 1_000, 3), "Lender corporation not found"],
    ["unknown borrower", (w: World) => lendInterbank(w, "US-financial", "nope", 1_000, 3), "Borrower corporation not found"],
    ["non-positive amount", (w: World, peer: Corporation) => lendInterbank(w, "US-financial", peer.id, 0, 3), "Amount must be a positive number"],
    ["negative rate", (w: World, peer: Corporation) => lendInterbank(w, "US-financial", peer.id, 1_000, -1), "Rate must be a non-negative number"],
    ["over headroom share", (w: World, peer: Corporation) => lendInterbank(w, "US-financial", peer.id, 10_000_000, 3), "Amount exceeds interbank share of lendable headroom"],
    ["insufficient lender cash", (w: World, peer: Corporation) => lendInterbank(w, "US-financial", peer.id, 50_000, 3), "Lender has insufficient liquid capital"],
  ])("refuses %s with untouched state", (_name, run, message) => {
    const world = createWorld(OPTS);
    const peer = charterPeer(world);
    if (_name === "inactive borrower charter") peer.bankCharter!.status = "failed";
    if (_name === "insufficient lender cash") {
      // Headroom large, cash small: cash binds instead of the share cap.
      const charter = lenderOf(world).bankCharter!;
      charter.npcDeposits = 10_000_000;
      charter.cashReserves = 1_000;
      charter.totalLoans = 0;
    } else {
      fundLender(world);
    }
    if (_name === "over headroom share") {
      // Cross-country refusal would fire first for a foreign peer; use the
      // same-country peer so the share cap is what binds.
    }
    const before = snapshot(world);
    const result = run(world, peer);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBe(message);
    expect(snapshot(world)).toBe(before);
  });

  it("refuses cross-country lending (solo analog of the currency-match rule)", () => {
    const world = createWorld(OPTS);
    fundLender(world);
    const foreign = Object.values(world.corporations).find((c) => c.countryId !== "US" && c.bankCharter)!;
    const before = snapshot(world);
    const result = lendInterbank(world, "US-financial", foreign.id, 1_000, 3);
    expect(result).toEqual({ ok: false, error: "Lender and borrower must be chartered in the same country" });
    expect(snapshot(world)).toBe(before);
  });

  it("counts live exposure against the share cap across loans", () => {
    const world = createWorld(OPTS);
    const peer = charterPeer(world);
    fundLender(world);
    const quote = quoteInterbankMax(world, "US-financial");
    const first = quote.max / 2;
    expect(lendInterbank(world, "US-financial", peer.id, first, 3).ok).toBe(true);
    const second = quoteInterbankMax(world, "US-financial");
    expect(second.maxByShare).toBeCloseTo(quote.maxByShare - first, 6);
    const over = lendInterbank(world, "US-financial", peer.id, second.maxByShare + 1, 3);
    expect(over).toEqual({ ok: false, error: "Amount exceeds interbank share of lendable headroom" });
  });
});

describe("repayInterbank — principal return", () => {
  function originated(): { world: World; peer: Corporation; loanId: string } {
    const world = createWorld(OPTS);
    const peer = charterPeer(world);
    fundLender(world);
    const result = lendInterbank(world, "US-financial", peer.id, 100_000, 4.8);
    expect(result.ok).toBe(true);
    return { world, peer, loanId: result.ok ? result.value.id : "" };
  }

  it("repays partially: cash moves back, debt shrinks, arrears reset, stays current", () => {
    const { world, peer, loanId } = originated();
    world.interbankLoans[0]!.arrearsTurns = 2;
    const lenderCash = lenderOf(world).bankCharter!.cashReserves;
    const borrowerCash = peer.bankCharter!.cashReserves;
    const result = repayInterbank(world, loanId, 30_000);
    expect(result).toEqual({ ok: true, value: { repaid: 30_000, outstanding: 70_000 } });
    expect(peer.bankCharter!.cashReserves).toBeCloseTo(borrowerCash - 30_000, 6);
    expect(lenderOf(world).bankCharter!.cashReserves).toBeCloseTo(lenderCash + 30_000, 6);
    expect(peer.bankCharter!.interbankDebt).toBe(70_000);
    expect(world.interbankLoans[0]).toMatchObject({ outstanding: 70_000, status: "current", arrearsTurns: 0 });
  });

  it("repays in full and clamps overpayment to the outstanding balance", () => {
    const { world, peer, loanId } = originated();
    const result = repayInterbank(world, loanId, 500_000);
    expect(result).toEqual({ ok: true, value: { repaid: 100_000, outstanding: 0 } });
    expect(world.interbankLoans[0]!.status).toBe("repaid");
    expect(peer.bankCharter!.interbankDebt).toBe(0);
  });

  it.each([
    ["unknown loan", "no-such-loan", 1_000, "Interbank loan not found or not current"],
    ["nothing to repay", null, 0, "Nothing to repay"],
  ])("refuses %s with untouched state", (_name, loan, amount, message) => {
    const ctx = originated();
    const before = snapshot(ctx.world);
    const result = repayInterbank(ctx.world, loan ?? ctx.loanId, amount);
    expect(result).toEqual({ ok: false, error: message });
    expect(snapshot(ctx.world)).toBe(before);
  });

  it("refuses when the borrower cannot cover it, touching nothing", () => {
    const { world, peer, loanId } = originated();
    peer.bankCharter!.cashReserves = 10;
    const before = snapshot(world);
    expect(repayInterbank(world, loanId, 1_000)).toEqual({ ok: false, error: "Borrower has insufficient liquid capital" });
    expect(snapshot(world)).toBe(before);
  });

  it("refuses a repaid loan", () => {
    const { world, loanId } = originated();
    expect(repayInterbank(world, loanId, 100_000).ok).toBe(true);
    expect(repayInterbank(world, loanId, 1)).toEqual({ ok: false, error: "Interbank loan not found or not current" });
  });
});

describe("serviceInterbankLoans — interest, arrears, default", () => {
  function originated(rate = 4.8): { world: World; peer: Corporation } {
    const world = createWorld(OPTS);
    const peer = charterPeer(world);
    fundLender(world);
    expect(lendInterbank(world, "US-financial", peer.id, 96_000, rate).ok).toBe(true);
    return { world, peer };
  }

  it("collects one turn of simple interest borrower to lender and clears arrears", () => {
    const { world, peer } = originated();
    const loan = world.interbankLoans[0]!;
    loan.arrearsTurns = 1;
    const due = (96_000 * (4.8 / 100)) / 48;
    const lenderCash = lenderOf(world).bankCharter!.cashReserves;
    const borrowerCash = peer.bankCharter!.cashReserves;
    const summary = serviceInterbankLoans(world, 1);
    expect(summary).toMatchObject({ loansServiced: 1, defaults: 0 });
    expect(summary.interestPaid).toBeCloseTo(due, 6);
    expect(peer.bankCharter!.cashReserves).toBeCloseTo(borrowerCash - due, 6);
    expect(lenderOf(world).bankCharter!.cashReserves).toBeCloseTo(lenderCash + due, 6);
    expect(loan.arrearsTurns).toBe(0);
    expect(loan.status).toBe("current");
    expect(loan.lastProcessedTurn).toBe(1);
    // Interest-only: principal is untouched by servicing.
    expect(loan.outstanding).toBe(96_000);
  });

  it("counts a shortfall as arrears and stays current with partial cash moved", () => {
    const { world, peer } = originated();
    peer.bankCharter!.cashReserves = 1; // cannot cover ~96 of interest
    const summary = serviceInterbankLoans(world, 1);
    expect(summary).toMatchObject({ loansServiced: 1, defaults: 0 });
    expect(summary.interestPaid).toBe(1);
    const loan = world.interbankLoans[0]!;
    expect(loan.status).toBe("current");
    expect(loan.arrearsTurns).toBe(1);
    expect(loan.outstanding).toBe(96_000);
  });

  it("defaults on the 8th consecutive shortfall, clearing debt with no cash moving", () => {
    const { world, peer } = originated();
    for (let turn = 1; turn <= 7; turn += 1) {
      peer.bankCharter!.cashReserves = 0;
      serviceInterbankLoans(world, turn);
      expect(world.interbankLoans[0]!.status).toBe("current");
    }
    const lenderCash = lenderOf(world).bankCharter!.cashReserves;
    peer.bankCharter!.cashReserves = 0;
    const summary = serviceInterbankLoans(world, 8);
    expect(summary).toMatchObject({ loansServiced: 1, defaults: 1 });
    expect(summary.writtenOff).toBe(96_000);
    const loan = world.interbankLoans[0]!;
    expect(loan.status).toBe("defaulted");
    expect(loan.arrearsTurns).toBe(8);
    expect(peer.bankCharter!.interbankDebt).toBe(0);
    expect(lenderOf(world).bankCharter!.cashReserves).toBe(lenderCash);
  });

  it("closes a zero-outstanding loan as repaid", () => {
    const { world } = originated();
    world.interbankLoans[0]!.outstanding = 0;
    serviceInterbankLoans(world, 3);
    expect(world.interbankLoans[0]).toMatchObject({ status: "repaid", outstanding: 0, arrearsTurns: 0 });
  });

  it("is idempotent within one turn", () => {
    const { world, peer } = originated();
    serviceInterbankLoans(world, 5);
    const after = snapshot(world);
    serviceInterbankLoans(world, 5);
    expect(snapshot(world)).toBe(after);
    expect(peer.bankCharter!.cashReserves).toBeGreaterThanOrEqual(0);
  });

  it("compounds deterministically over repeated turns", () => {
    const first = originated();
    const second = originated();
    for (let turn = 1; turn <= 5; turn += 1) {
      serviceInterbankLoans(first.world, turn);
      serviceInterbankLoans(second.world, turn);
    }
    expect(JSON.stringify(first.world.interbankLoans)).toBe(JSON.stringify(second.world.interbankLoans));
    expect(JSON.stringify(first.world.corporations)).toBe(JSON.stringify(second.world.corporations));
  });
});

describe("phase ordering — bankingTurn runs interbank after bank passes, solvency consumes it", () => {
  it("services interbank interest inside bankingTurnPhase exactly once per turn", () => {
    const world = createWorld(OPTS);
    const peer = charterPeer(world);
    fundLender(world);
    // Freeze NPC flows so the assertion reads interest only.
    world.centralBanks["US"]!.externalBroadMoney = 0;
    expect(lendInterbank(world, "US-financial", peer.id, 96_000, 4.8).ok).toBe(true);
    world.meta.turn = 1;
    // Freeze both banks' NPC activity after origination (zero the lender's
    // deposit base and the household pool) so both vaults move by exactly
    // one turn of interbank interest — the headroom check already ran at
    // origination, and servicing never re-checks it.
    lenderOf(world).bankCharter!.npcDeposits = 0;
    world.centralBanks["US"]!.externalBroadMoney = 0;
    const due = (96_000 * (4.8 / 100)) / 48;
    const borrowerCash = peer.bankCharter!.cashReserves;
    const lenderCash = lenderOf(world).bankCharter!.cashReserves;
    bankingTurnPhase.run(world, RNG);
    const loan = world.interbankLoans[0]!;
    expect(loan.lastProcessedTurn).toBe(1);
    expect(loan.arrearsTurns).toBe(0);
    expect(loan.outstanding).toBe(96_000);
    expect(peer.bankCharter!.cashReserves).toBeCloseTo(borrowerCash - due, 6);
    expect(lenderOf(world).bankCharter!.cashReserves).toBeCloseTo(lenderCash + due, 6);
    const after = snapshot(world);
    bankingTurnPhase.run(world, RNG);
    expect(snapshot(world)).toBe(after);
  });

  it("still services interbank when no charter needs a pass (source runs the slot regardless)", () => {
    const world = createWorld(OPTS);
    const peer = charterPeer(world);
    fundLender(world);
    expect(lendInterbank(world, "US-financial", peer.id, 96_000, 4.8).ok).toBe(true);
    world.meta.turn = 1;
    for (const corp of Object.values(world.corporations)) {
      if (corp.bankCharter) corp.bankCharter.lastBankingTurn = 1;
    }
    bankingTurnPhase.run(world, RNG);
    expect(world.interbankLoans[0]!.lastProcessedTurn).toBe(1);
  });

  it("feeds lender-side defaults into solvency confidence and writes off on lender failure", () => {
    const world = createWorld(OPTS);
    const peer = charterPeer(world);
    fundLender(world);
    expect(lendInterbank(world, "US-financial", peer.id, 96_000, 4.8).ok).toBe(true);
    const loan = world.interbankLoans[0]!;
    loan.status = "defaulted";
    loan.lastProcessedTurn = 9;
    expect(sumInterbankDefaultsLastTurn(world, "US-financial", 9)).toBe(96_000);
    expect(sumInterbankDefaultsLastTurn(world, "US-financial", 8)).toBe(0);

    // A failed lender's live loans die with it; the borrower keeps the cash.
    const live = createWorld(OPTS);
    const livePeer = charterPeer(live);
    fundLender(live);
    expect(lendInterbank(live, "US-financial", livePeer.id, 50_000, 4.8).ok).toBe(true);
    const lender = lenderOf(live);
    // Force the lender into the failure branch: red band, no cash cover.
    lender.bankCharter!.npcDeposits = 1_000_000;
    lender.bankCharter!.cashReserves = 0;
    lender.bankCharter!.warningBand = "red";
    const borrowerCash = livePeer.bankCharter!.cashReserves;
    live.meta.turn = 9;
    bankSolvencyTurnPhase.run(live, RNG);
    expect(lender.bankCharter!.status).toBe("failed");
    expect(live.interbankLoans[0]!.status).toBe("defaulted");
    expect(livePeer.bankCharter!.cashReserves).toBe(borrowerCash);
  });

  it("orders discount-window-blind: interbank settles in bankingTurn before solvency evaluates", () => {
    // Native has no discount-window servicing turn (#327 owns it), so the
    // ordering assertion available here is bankingTurn < bankSolvencyTurn:
    // interest collected this turn is already in the lender's vault when
    // solvency reads its cash position.
    const world = createWorld(OPTS);
    const peer = charterPeer(world);
    fundLender(world);
    world.centralBanks["US"]!.externalBroadMoney = 0;
    expect(lendInterbank(world, "US-financial", peer.id, 96_000, 4.8).ok).toBe(true);
    world.meta.turn = 1;
    bankingTurnPhase.run(world, RNG);
    const cashAtSolvency = lenderOf(world).bankCharter!.cashReserves;
    bankSolvencyTurnPhase.run(world, RNG);
    expect(lenderOf(world).bankCharter!.lastSolvencyTurn).toBe(1);
    expect(cashAtSolvency).toBeGreaterThan(0);
  });
});

describe("save/reload — old saves and round-trips", () => {
  it("backfills an empty book on a pre-#326 save and bumps schema to current", () => {
    const world = structuredClone(createWorld(OPTS)) as unknown as Record<string, unknown>;
    (world["meta"] as Record<string, unknown>)["schemaVersion"] = 47;
    delete world["interbankLoans"];
    const raw = JSON.stringify({ format: "ahdsolo-save", schemaVersion: 47, savedAt: "2026-01-01T00:00:00Z", world });
    const loaded = deserializeSave(raw);
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(48);
    expect(loaded.interbankLoans).toEqual([]);
  });

  it("round-trips a live loan book byte-identically with deterministic reload", () => {
    const world = createWorld(OPTS);
    const peer = charterPeer(world);
    fundLender(world);
    expect(lendInterbank(world, "US-financial", peer.id, 96_000, 4.8).ok).toBe(true);
    world.meta.turn = 1;
    bankingTurnPhase.run(world, RNG);
    const raw = serializeSave(world, "2026-01-01T00:00:00Z");
    const first = deserializeSave(raw);
    const second = deserializeSave(serializeSave(first, "2026-01-01T00:00:00Z"));
    expect(JSON.stringify(first.interbankLoans)).toBe(JSON.stringify(world.interbankLoans));
    expect(JSON.stringify(second.interbankLoans)).toBe(JSON.stringify(first.interbankLoans));
    // Servicing continues after reload: the next turn advances the same loan.
    second.meta.turn = 2;
    bankingTurnPhase.run(second, rngFromSeed("interbank-rng"));
    expect(second.interbankLoans[0]!.lastProcessedTurn).toBe(2);
  });
});
