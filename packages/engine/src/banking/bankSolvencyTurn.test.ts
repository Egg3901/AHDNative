import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { deserializeSave, serializeSave } from "../save.js";
import { bankSolvencyTurnPhase } from "./bankSolvencyTurn.js";
import type { InterbankLoan } from "./interbank.js";
import { CONTAGION_PANIC_TURNS, FLIGHT_RATE_BY_BAND, RUN_FAILURE_COVER_FRACTION } from "./constants.js";

const STAMP = "2026-09-18T00:00:00.000Z";

const OPTS = { seed: "solvency-test", playerName: "P", countryId: "US", era: "1953" };
const RNG = rngFromSeed("solvency-rng");

function run(world: ReturnType<typeof createWorld>): void {
  bankSolvencyTurnPhase.run(world, RNG);
}

describe("bankSolvencyTurnPhase — confidence scoring", () => {
  it("a healthy, fully-reserved bank scores green", () => {
    const world = createWorld(OPTS);
    const charter = world.corporations["US-financial"]!.bankCharter!;
    charter.npcDeposits = 100_000;
    charter.cashReserves = 100_000; // well above the 20% requirement
    world.meta.turn = 1;
    run(world);
    expect(charter.warningBand).toBe("green");
    expect(charter.confidence).toBeGreaterThanOrEqual(0.7);
    expect(charter.lastSolvencyTurn).toBe(1);
  });

  it("a thinly-reserved bank with arrears scores lower", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.npcDeposits = 1_000_000;
    charter.cashReserves = 10_000; // far below the reserve requirement
    charter.totalLoans = 500_000;
    world.bankLoans.push({
      id: "arrears-1",
      bankCorpId: corp.id,
      borrowerType: "corporation",
      borrowerId: "X",
      principal: 200_000,
      outstanding: 200_000,
      ratePercent: 8,
      originatedTurn: 0,
      termTurns: 48,
      status: "arrears",
      arrearsTurns: 3,
      lastProcessedTurn: null,
    });
    world.meta.turn = 1;
    run(world);
    expect(charter.confidence).toBeLessThan(0.7);
  });
});

describe("bankSolvencyTurnPhase — deposit flight", () => {
  it("amber band leaks 10% of NPC deposits back to the household pool", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.warningBand = "amber"; // prior band drives THIS turn's flight
    charter.npcDeposits = 100_000;
    charter.cashReserves = 100_000;
    const bank = world.centralBanks["US"]!;
    const poolBefore = bank.externalBroadMoney;
    world.meta.turn = 1;
    run(world);
    expect(charter.npcDeposits).toBeCloseTo(100_000 * (1 - FLIGHT_RATE_BY_BAND.amber), 2);
    expect(bank.externalBroadMoney).toBeCloseTo(poolBefore + 100_000 * FLIGHT_RATE_BY_BAND.amber, 2);
  });

  it("red band leaks 30%, capped at available cash — and a full drain also fails the run-failure test in the same pass", () => {
    // A red-banded bank whose cash cannot even cover the capped flight (let
    // alone RUN_FAILURE_COVER_FRACTION of what is left) fails in the SAME
    // evaluateOneBank call — flight and failure are not separable turns here,
    // exactly mirroring mainline's evaluateOneBank ordering (flight, then the
    // failure test, in one pass). This test asserts what actually happens:
    // the pool recovers exactly the capped flight amount, and the rest of
    // the (now-uninsured, no fund seeded) NPC book is written off on failure.
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.warningBand = "red";
    charter.npcDeposits = 100_000;
    charter.cashReserves = 5_000; // far less than 30,000 the full flight rate implies
    charter.postedCapital = 5_000;
    const bank = world.centralBanks["US"]!;
    const poolBefore = bank.externalBroadMoney;
    world.meta.turn = 1;
    run(world);
    // Flight capped at the 5,000 cash on hand (not the uncapped 30,000).
    expect(bank.externalBroadMoney).toBeCloseTo(poolBefore + 5_000, 2);
    // Cash fully drained by the capped flight, which then fails the bank
    // (RUN_FAILURE_COVER_FRACTION test: 0 cash < 50% of required liquidity).
    expect(charter.status).toBe("failed");
    expect(charter.npcDeposits).toBe(0);
    expect(charter.cashReserves).toBe(0);
  });

  it("isolated flight (no failure) when post-flight cash still clears the run-failure bar", () => {
    // Small npcDeposits base keeps required liquidity tiny, so even the
    // reduced post-flight cash comfortably clears RUN_FAILURE_COVER_FRACTION.
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.warningBand = "red";
    charter.npcDeposits = 100;
    charter.cashReserves = 1_000_000; // far more than the uncapped 30 flight amount
    world.meta.turn = 1;
    run(world);
    expect(charter.npcDeposits).toBeCloseTo(100 * (1 - FLIGHT_RATE_BY_BAND.red), 6);
    expect(charter.cashReserves).toBeCloseTo(1_000_000 - 100 * FLIGHT_RATE_BY_BAND.red, 6);
    expect(charter.status).toBe("active");
  });
});

describe("bankSolvencyTurnPhase — run failure and depositor resolution", () => {
  it("fails a red-banded bank whose cash falls below RUN_FAILURE_COVER_FRACTION of required liquidity", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.warningBand = "red";
    charter.npcDeposits = 1_000_000;
    // required liquidity = 0.2*1,000,000 = 200,000; failure needs cash < 0.5*200,000 = 100,000.
    // Flight already drains 30% (300,000) before the failure check, so seed
    // cash well below the post-flight threshold.
    charter.cashReserves = 10_000;
    charter.postedCapital = 50_000;
    world.meta.turn = 1;
    run(world);
    expect(charter.status).toBe("failed");
    expect(charter.failedTurn).toBe(1);
    expect(charter.depositorsResolvedTurn).toBe(1);
    expect(RUN_FAILURE_COVER_FRACTION).toBe(0.5);
  });

  it("player savings survive a bank failure as a pointer flip, not a principal haircut", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.warningBand = "red";
    charter.npcDeposits = 1_000_000;
    charter.cashReserves = 10_000;
    charter.postedCapital = 50_000;
    world.player.savings = 5_000;
    world.player.savingsHolder = corp.id;
    world.meta.turn = 1;
    run(world);
    expect(charter.status).toBe("failed");
    expect(world.player.savingsHolder).toBe("centralBank");
    expect(world.player.savings).toBe(5_000); // principal untouched
  });

  it("insured NPC deposits are paid from bank cash then the insurance fund", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.warningBand = "red";
    charter.npcDeposits = 1_000_000;
    charter.cashReserves = 10_000;
    charter.postedCapital = 50_000;
    world.depositInsurance["US"] = {
      countryId: "US",
      balance: 2_000_000,
      insuredCap: 1_000_000,
      premiumsCollectedLifetime: 0,
      payoutsLifetime: 0,
    };
    const bank = world.centralBanks["US"]!;
    const poolBefore = bank.externalBroadMoney;
    world.meta.turn = 1;
    run(world);
    expect(charter.npcDeposits).toBe(0);
    expect(charter.cashReserves).toBe(0);
    expect(bank.externalBroadMoney).toBeGreaterThan(poolBefore); // pool got the recovered cash back
    expect(world.depositInsurance["US"]!.payoutsLifetime).toBeGreaterThan(0);
  });

  it("is idempotent: does not re-resolve depositors on a second pass", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const charter = corp.bankCharter!;
    charter.warningBand = "red";
    charter.npcDeposits = 1_000_000;
    charter.cashReserves = 10_000;
    charter.postedCapital = 50_000;
    world.meta.turn = 1;
    run(world);
    const resolvedTurn = charter.depositorsResolvedTurn;
    world.meta.turn = 2;
    run(world); // failed charters are excluded from candidates going forward
    expect(charter.depositorsResolvedTurn).toBe(resolvedTurn);
  });
});

describe("bankSolvencyTurnPhase — contagion", () => {
  it("bumps panicTurns on a same-country peer when a bank fails this turn", () => {
    const world = createWorld(OPTS);
    const failing = world.corporations["US-financial"]!;
    // Synthetic second US bank to exercise contagion (solo seeds one bank per
    // country — see npcBanks.ts file doc — so this is a test-only scenario).
    const peer = { ...failing, id: "US-peer-bank", bankCharter: { ...failing.bankCharter! } };
    world.corporations["US-peer-bank"] = peer;
    failing.bankCharter!.warningBand = "red";
    failing.bankCharter!.npcDeposits = 1_000_000;
    failing.bankCharter!.cashReserves = 10_000;
    failing.bankCharter!.postedCapital = 50_000;
    peer.bankCharter!.warningBand = "green";
    peer.bankCharter!.npcDeposits = 50_000;
    peer.bankCharter!.cashReserves = 50_000;
    peer.bankCharter!.panicTurns = 0;
    world.meta.turn = 1;
    run(world);
    expect(peer.bankCharter!.panicTurns).toBe(CONTAGION_PANIC_TURNS);
  });
});

describe("bankSolvencyTurnPhase — failed-estate interbank recovery (#329)", () => {
  function failingInvestmentBorrower(
    world: ReturnType<typeof createWorld>,
    opts: { cash: number; markUnits: number; interbankDebt: number },
  ): { borrowerId: string; targetId: string } {
    const borrower = world.corporations["US-financial"]!;
    const charter = borrower.bankCharter!;
    charter.charterType = "investment";
    charter.cashReserves = opts.cash;
    charter.npcDeposits = 0;
    charter.totalDeposits = 0;
    charter.totalLoans = 0;
    charter.postedCapital = 0;
    charter.interbankDebt = opts.interbankDebt;
    charter.warningBand = "red";
    charter.panicTurns = 4;
    const target = Object.values(world.corporations).find(
      (c) => c.id !== borrower.id && c.sharePrice > 0,
    )!;
    target.sharePrice = 100;
    charter.propBook = [
      { asset: "equity", ref: target.id, units: opts.markUnits, costBasis: opts.markUnits * 100 },
    ];
    charter.propBookMarkValue = 0; // stale cache; the turn re-marks first
    return { borrowerId: borrower.id, targetId: target.id };
  }

  function liveLender(
    world: ReturnType<typeof createWorld>,
    id: string,
    cash: number,
  ): void {
    const seed = world.corporations["US-financial"]!;
    world.corporations[id] = {
      ...seed,
      id,
      bankCharter: { ...seed.bankCharter!, cashReserves: cash },
    };
  }

  function estateLoan(
    world: ReturnType<typeof createWorld>,
    lenderCorpId: string,
    borrowerCorpId: string,
    outstanding: number,
  ): void {
    const loan: InterbankLoan = {
      id: `ib-${lenderCorpId}-${borrowerCorpId}-0`,
      lenderCorpId,
      borrowerCorpId,
      principal: outstanding,
      outstanding,
      ratePercent: 5,
      originatedTurn: 0,
      status: "current",
      arrearsTurns: 0,
      lastProcessedTurn: null,
    };
    world.interbankLoans.push(loan);
  }

  it("pays live interbank lenders pro rata from the estate cash left after depositors", () => {
    const world = createWorld(OPTS);
    // Cash 100k + 20k of marks liquidates to exactly the 120k owed, so the
    // red/no-equity failure test fires and the estate covers every lender.
    liveLender(world, "US-lender-a", 10_000);
    liveLender(world, "US-lender-b", 10_000);
    const { borrowerId } = failingInvestmentBorrower(world, {
      cash: 100_000,
      markUnits: 200,
      interbankDebt: 120_000,
    });
    estateLoan(world, "US-lender-a", borrowerId, 70_000);
    estateLoan(world, "US-lender-b", borrowerId, 50_000);
    world.meta.turn = 1;
    run(world);

    const charter = world.corporations[borrowerId]!.bankCharter!;
    expect(charter.status).toBe("failed");
    // Source tier 3 (depositBookReturn.ts): every lender paid in full, the
    // estate cash retired, the borrower-side debt extinguished.
    expect(world.corporations["US-lender-a"]!.bankCharter!.cashReserves).toBe(80_000);
    expect(world.corporations["US-lender-b"]!.bankCharter!.cashReserves).toBe(60_000);
    for (const loan of world.interbankLoans) {
      expect(loan.status).toBe("repaid");
      expect(loan.outstanding).toBe(0);
      expect(loan.lastProcessedTurn).toBe(1);
    }
    expect(charter.interbankDebt).toBe(0);
    expect(charter.cashReserves).toBe(0);

    // Reload boundary: the settled loans and cleared debt survive the save
    // envelope through the existing interbankLoans persistence.
    const loaded = deserializeSave(serializeSave(world, STAMP));
    expect(loaded.interbankLoans.map((l) => l.status)).toEqual(["repaid", "repaid"]);
    expect(loaded.corporations[borrowerId]!.bankCharter!.interbankDebt).toBe(0);
    expect(loaded.corporations["US-lender-a"]!.bankCharter!.cashReserves).toBe(80_000);
  });

  it("records the unpaid remainder as a lender loss and still clears the estate claim on shortfall", () => {
    const world = createWorld(OPTS);
    // Cash 0 + 100k of marks liquidates to 100k against 200k owed: half paid.
    liveLender(world, "US-lender-a", 10_000);
    liveLender(world, "US-lender-b", 10_000);
    const { borrowerId } = failingInvestmentBorrower(world, {
      cash: 0,
      markUnits: 1000,
      interbankDebt: 200_000,
    });
    estateLoan(world, "US-lender-a", borrowerId, 120_000);
    estateLoan(world, "US-lender-b", borrowerId, 80_000);
    world.meta.turn = 1;
    run(world);

    const charter = world.corporations[borrowerId]!.bankCharter!;
    expect(charter.status).toBe("failed");
    expect(world.corporations["US-lender-a"]!.bankCharter!.cashReserves).toBe(70_000);
    expect(world.corporations["US-lender-b"]!.bankCharter!.cashReserves).toBe(50_000);
    const byLender = new Map(world.interbankLoans.map((l) => [l.lenderCorpId, l]));
    expect(byLender.get("US-lender-a")!.outstanding).toBe(60_000);
    expect(byLender.get("US-lender-b")!.outstanding).toBe(40_000);
    for (const loan of world.interbankLoans) {
      expect(loan.status).toBe("defaulted");
      expect(loan.lastProcessedTurn).toBe(1);
    }
    // Source creditorClaimProjections: the claim cannot outlive the estate.
    expect(charter.interbankDebt).toBe(0);
  });

  it("routes a resolved lender's share to the insurance fund standing behind it", () => {
    const world = createWorld(OPTS);
    liveLender(world, "US-lender-a", 10_000);
    liveLender(world, "US-lender-dead", 0);
    const { borrowerId } = failingInvestmentBorrower(world, {
      cash: 100_000,
      markUnits: 200,
      interbankDebt: 120_000,
    });
    // Failed AND resolved: its estate is closed, so recovery belongs to the
    // insurer that stood behind it (source interbankRecoveryTarget).
    world.corporations["US-lender-dead"]!.bankCharter!.status = "failed";
    world.corporations["US-lender-dead"]!.bankCharter!.depositorsResolvedTurn = 0;
    estateLoan(world, "US-lender-a", borrowerId, 70_000);
    estateLoan(world, "US-lender-dead", borrowerId, 50_000);
    world.depositInsurance["US"] = {
      countryId: "US",
      balance: 5_000,
      insuredCap: 1_000_000,
      premiumsCollectedLifetime: 0,
      payoutsLifetime: 0,
    };
    world.meta.turn = 1;
    run(world);

    expect(world.corporations[borrowerId]!.bankCharter!.status).toBe("failed");
    expect(world.corporations["US-lender-a"]!.bankCharter!.cashReserves).toBe(80_000);
    expect(world.corporations["US-lender-dead"]!.bankCharter!.cashReserves).toBe(0);
    expect(world.depositInsurance["US"]!.balance).toBe(55_000);
    expect(world.corporations[borrowerId]!.bankCharter!.interbankDebt).toBe(0);
  });
});

describe("bankSolvencyTurnPhase — deposit aggregates follow the cash (#329)", () => {
  it("deposit flight reduces totalDeposits with npcDeposits", () => {
    const world = createWorld(OPTS);
    const charter = world.corporations["US-financial"]!.bankCharter!;
    charter.warningBand = "red";
    charter.npcDeposits = 100;
    charter.totalDeposits = 100;
    charter.cashReserves = 1_000_000;
    world.meta.turn = 1;
    run(world);
    // Source flight projection decrements both aggregates, never the NPC leg
    // alone (depositBookReturn/bankSolvencyTurn $inc pair).
    expect(charter.npcDeposits).toBeCloseTo(100 * (1 - FLIGHT_RATE_BY_BAND.red), 6);
    expect(charter.totalDeposits).toBeCloseTo(100 * (1 - FLIGHT_RATE_BY_BAND.red), 6);
    expect(charter.status).toBe("active");
  });

  it("failure resolution clears totalDeposits with npcDeposits", () => {
    const world = createWorld(OPTS);
    const charter = world.corporations["US-financial"]!.bankCharter!;
    charter.warningBand = "red";
    charter.npcDeposits = 1_000_000;
    charter.totalDeposits = 1_000_000;
    charter.cashReserves = 10_000;
    charter.postedCapital = 50_000;
    world.meta.turn = 1;
    run(world);
    expect(charter.status).toBe("failed");
    expect(charter.npcDeposits).toBe(0);
    expect(charter.totalDeposits).toBe(0);
  });
});

describe("bankSolvencyTurnPhase — determinism", () => {
  it("same seed and mutations produce byte-identical results", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (const world of [a, b]) {
      world.corporations["US-financial"]!.bankCharter!.npcDeposits = 500_000;
      world.corporations["US-financial"]!.bankCharter!.cashReserves = 60_000;
    }
    for (let i = 1; i <= 10; i++) {
      a.meta.turn = i;
      b.meta.turn = i;
      run(a);
      run(b);
    }
    expect(JSON.stringify(a.corporations)).toBe(JSON.stringify(b.corporations));
  });
});
