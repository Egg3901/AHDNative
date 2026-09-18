/**
 * Finance phase ordering and next-turn balances — #317 integration slice.
 *
 * Source-backed writer/consumer matrix (AHDGame pinned e364c0495, Native
 * owners as registered in phases/registry.ts):
 *
 * | Writer (action or phase)                 | Writes                                          | Consumer (same or next turn)                          |
 * |------------------------------------------|-------------------------------------------------|-------------------------------------------------------|
 * | depositToSavings / withdrawFromSavings   | player.cash <-> player.savings                  | playerSavingsInterestPhase, playerLineOfCreditPhase,  |
 * | (finance/savingsActions.ts, action time)|                                                 | bankingTurnPhase (bank-held leg)                      |
 * | playerSavingsInterestPhase               | pendingSavingsInterest, savings +               | recordWorldHistoryPhase (terminal snapshot only);     |
 * | ("playerSavingsInterest", RNG-free)      | savingsInterestEarnedLifetime (central-bank     | bankingTurnPhase never double-pays (holder gate)      |
 * |                                          | holder only)                                    |                                                       |
 * | bankingTurnPhase ("bankingTurn",         | bank-held savings interest, NPC flows, named    | playerLineOfCreditPhase reads the settled wallet;     |
 * | RNG-free)                                | loan service, insurance premium, interbank leg  | bankSolvencyTurnPhase scores resulting cash           |
 * | discountWindowTurnPhase                  | discount-window interest/arrears                | bankSolvencyTurnPhase (reference bankingTurn tail)    |
 * | ("discountWindowTurn", RNG-free)         |                                                 |                                                       |
 * | playerLineOfCreditPhase                  | LOC balance/arrears/drawFrozen + wallet         | bankSolvencyTurnPhase; next-turn scheduled payment    |
 * | ("playerLineOfCredit", RNG-free)         | (cash, savings slice, personal pocket)          | reads the resulting obligation                        |
 * | pensionTurnPhase ("pensionTurn",         | corp liquidCapital debits, pensionSchemes       | macroCountryTurnPhase reads post-charge capital via   |
 * | RNG-free)                                | assets/liabilities, pensionLedger legs          | laborForces; next-turn accrual reads the scheme       |
 * | wireTransfer (finance/wireTransfer.ts,   | cash / currencyBalances.personal,               | No turn phase consumes it (immediate settlement).     |
 * | action time)                             | wireQuotaUsedAnchor, news                       | Next-turn contract: balances persist unchanged.       |
 * | recomputeSharePricesPhase (RNG-free)     | share prices from post-bond issuer capital      | bankSolvencyTurnPhase prop-book mark                  |
 * | bankSolvencyTurnPhase (RNG-free)         | bank cash/confidence/failure state              | recordWorldHistoryPhase                               |
 *
 * Required edges asserted below (registry index order):
 * corporationTurn < unionsTurn < nppUnionBehavior < pensionTurn <
 * macroCountryTurn < playerSavingsInterest < bankingTurn <
 * discountWindowTurn < sovereignIssuance < bondCouponMaturity <
 * npcBondHolder < playerLineOfCredit < recomputeSharePrices <
 * bankSolvencyTurn.
 *
 * The bond < line edge is the #317 restoration: the reference runs bondTurn
 * coupons/maturities (player-wallet credits) BEFORE lineOfCreditTurn sizes
 * the scheduled payment (turnPhaseRegistry.ts at e364c0495: bondTurn ...
 * contractSettlement ... lineOfCreditTurn ... recomputeSharePrices), so
 * coupon cash is spendable on the obligation the same turn.
 *
 * Every behavioral expectation is derived from the published rules plus
 * twin-world differencing, never from the implementation under test. No
 * RNG is consumed or re-golden: all asserted phases are RNG-free and the
 * test pins no absolute simulation golden.
 */
import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { TURN_PHASES } from "../phases/registry.js";
import { depositToSavings } from "./savingsActions.js";
import { wireTransfer } from "./wireTransfer.js";
import { BOND_UNIT_FACE_VALUE, perTurnCouponPayment } from "../bonds/constants.js";
import type { Bond } from "../bonds/types.js";

const OPTS = {
  seed: "finance-reconcile-317",
  playerName: "Auditor",
  countryId: "US",
  era: "1953",
} as const;
const STAMP = "2026-09-18T00:00:00.000Z";

type World = ReturnType<typeof createWorld>;

function phaseIndex(name: string): number {
  const index = TURN_PHASES.findIndex((phase) => phase.name === name);
  if (index < 0) throw new Error(`phase not registered: ${name}`);
  return index;
}

function firstUsUnion(world: World): string {
  const id = Object.keys(world.unions)
    .filter((key) => key.startsWith("US-"))
    .sort()[0];
  if (!id) throw new Error("fixture requires at least one US union");
  return id;
}

function corpCash(world: World): number {
  let total = 0;
  for (const corp of Object.values(world.corporations)) total += corp.liquidCapital;
  return Math.round(total * 100) / 100;
}

/**
 * Representative finance world: central-bank savings funded by a deposit,
 * a serviced USD line of credit, one pension-rated union, and one domestic
 * plus one cross-border wire. The twin skips only the LOC and the pension
 * rate, so twin deltas isolate exactly those two writers (disjoint wallets:
 * player cash vs corporate liquidCapital).
 */
function financeWorld(withCreditAndPension: boolean): {
  world: World;
  unionId: string;
  domesticId: string;
  foreignId: string;
  domesticBefore: number;
  foreignUsdBefore: number;
} {
  const world = createWorld(OPTS);
  world.player.cash = 100_000;
  expect(depositToSavings(world, 48_000)).toEqual({ ok: true });
  world.centralBanks.US!.primeRate = 5;
  world.countries.US!.economy.inflationRate = 0.02;

  const unionId = firstUsUnion(world);
  if (withCreditAndPension) {
    world.player.lineOfCredit = {
      balance: 1000,
      denomination: "USD",
      arrears: 0,
      drawFrozen: false,
    };
    world.unions[unionId]!.pensionContributionRate = 0.1;
  }

  const domestic = world.politicians.find((p) => p.countryId === world.player.countryId);
  if (!domestic) throw new Error("fixture requires at least one same-country politician");
  const foreign = world.politicians.find((p) => p.countryId !== world.player.countryId);
  if (!foreign) throw new Error("fixture requires at least one foreign politician");
  const domesticBefore = domestic.cash;
  const foreignUsdBefore = foreign.currencyBalances?.personal?.["USD"] ?? 0;

  expect(wireTransfer(world, domestic.id, 1000)).toMatchObject({ ok: true });
  const cross = wireTransfer(world, foreign.id, 1000);
  expect(cross).toEqual({ ok: true, recipientName: foreign.name, currency: "USD", amount: 1000 });

  return { world, unionId, domesticId: domestic.id, foreignId: foreign.id, domesticBefore, foreignUsdBefore };
}

describe("finance phase reconcile #317", () => {
  it("preserves the required finance writer/consumer order in the registry", () => {
    const order = [
      "corporationTurn",
      "unionsTurn",
      "nppUnionBehavior",
      "pensionTurn",
      "macroCountryTurn",
      "playerSavingsInterest",
      "bankingTurn",
      "discountWindowTurn",
      "sovereignIssuance",
      "bondCouponMaturity",
      "npcBondHolder",
      "playerLineOfCredit",
      "recomputeSharePrices",
      "bankSolvencyTurn",
    ];
    const indices = order.map(phaseIndex);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it("settles deposit/interest, credit, pension, and wires into next-turn balances", () => {
    const a = financeWorld(true);
    const b = financeWorld(false);
    const turnCashBefore = a.world.player.cash;
    expect(turnCashBefore).toBe(100_000 - 48_000 - 1000 - 1000);

    advanceTurn(a.world);
    advanceTurn(b.world);
    expect(a.world.meta.turn).toBe(1);

    // Savings: pre-boundary turn accrues but does not credit. Hand math
    // from the shared rule (real = max(0.5, 5 - 2) = 3, APY = 1.5%,
    // per-turn = 48000 x 0.015 / 48): exactly 15 pending.
    expect(a.world.player.savings).toBe(48_000);
    expect(a.world.player.pendingSavingsInterest).toBe(15);
    expect(a.world.player.savingsInterestEarnedLifetime ?? 0).toBe(0);
    // The savings leg is blind to the credit/pension setup: twins agree.
    expect(b.world.player.savings).toBe(a.world.player.savings);
    expect(b.world.player.pendingSavingsInterest).toBe(a.world.player.pendingSavingsInterest);

    // Line of credit: no other writer touches the line, so the obligation
    // is fully serviced (arrears 0, unfrozen) and the balance drops by the
    // principal slice of the scheduled payment. Exact interest depends on
    // the wallet-driven borrower spread (this funded fixture carries
    // 48k savings, unlike the zero-savings unit fixture), so the turn is
    // pinned by accounting identities instead of fixture-specific numbers:
    // the twin cash delta IS the payment, and payment minus principal
    // reduction IS the one-turn interest at prime 5 plus spread.
    expect(a.world.player.lineOfCredit!.arrears).toBe(0);
    expect(a.world.player.lineOfCredit!.drawFrozen).toBe(false);
    expect(a.world.player.lineOfCredit!.balance).toBeGreaterThan(990);
    expect(a.world.player.lineOfCredit!.balance).toBeLessThan(1000);
    const payment = Math.round((b.world.player.cash - a.world.player.cash) * 100) / 100;
    expect(payment).toBeGreaterThan(0);
    const principalReduction = 1000 - a.world.player.lineOfCredit!.balance;
    const interest = Math.round((payment - principalReduction) * 100) / 100;
    expect(interest).toBeGreaterThan(0);
    expect(interest).toBeLessThan(10);

    // Pension: scheme funded, employer cash conserved across the twin delta
    // (the twin earns identical corporation revenue, so B minus A is exactly
    // what the scheme took).
    const scheme = a.world.pensionSchemes?.[a.unionId];
    expect(scheme).toBeDefined();
    expect(scheme!.assets).toBeGreaterThan(0);
    expect(scheme!.liabilities).toBeGreaterThan(0);
    expect(scheme!.lastChargedTurn).toBe(1);
    expect(b.world.pensionSchemes?.[b.unionId]).toBeUndefined();
    const moved = scheme!.totalContributions + scheme!.totalTopUps;
    expect(Math.round((corpCash(b.world) - corpCash(a.world)) * 100) / 100).toBeCloseTo(moved, 2);

    // Wires: immediate settlement persists through the turn untouched. No
    // turn phase consumes wire state, so recipients and quota read exactly
    // the action-time values.
    const domestic = a.world.politicians.find((p) => p.id === a.domesticId)!;
    const foreign = a.world.politicians.find((p) => p.id === a.foreignId)!;
    expect(domestic.cash).toBe(a.domesticBefore + 1000);
    expect(foreign.currencyBalances?.personal?.["USD"] ?? 0).toBe(a.foreignUsdBefore + 1000);
    expect(a.world.player.wireQuotaUsedAnchor).toBe(2000);
    expect(a.world.player.wireQuotaWindowStartTurn).toBe(0);
  });
});

/**
 * Player-held sovereign bond funding the line payment. Crafted directly
 * (same shape as the #309 craftSovereign fixture): 10 units of a 5% USD
 * sovereign, far from maturity, so the only same-turn writer touching the
 * player wallet besides the line is the coupon credit.
 */
function craftCouponBond(world: World): void {
  const turn = world.meta.turn;
  world.bonds["loc-coupon-sov"] = {
    id: "loc-coupon-sov",
    issuerType: "sovereign",
    countryId: "US",
    issuerName: "US",
    faceValue: BOND_UNIT_FACE_VALUE,
    couponRate: 5,
    maturityTurns: 240 as Bond["maturityTurns"],
    issuedAtTurn: turn,
    maturityTurn: turn + 240,
    marketPrice: 1.0,
    totalIssued: 1_000_000,
    publicFloat: 990,
    holders: [{ holderId: "player", units: 10 }],
    matured: false,
    defaulted: false,
    defaultedAtTurn: null,
    currencyCode: "USD",
    createdAt: world.meta.date,
    updatedAt: world.meta.date,
  };
}

describe("bond coupon funds the line payment #317", () => {
  it("services the line from post-coupon cash (bondTurn < lineOfCreditTurn)", () => {
    // Reference edge (turnPhaseRegistry.ts at e364c0495): bondTurn credits
    // coupons/maturities to the player wallet BEFORE lineOfCreditTurn sizes
    // the scheduled payment. The wallet starts empty, so a pre-coupon line
    // shortfalls and freezes while a post-coupon line pays in full.
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (const world of [a, b]) {
      world.player.cash = 0;
      world.player.savings = 0;
      world.centralBanks.US!.primeRate = 5;
      craftCouponBond(world);
    }
    a.player.lineOfCredit = {
      balance: 1000,
      denomination: "USD",
      arrears: 0,
      drawFrozen: false,
    };

    advanceTurn(a);
    advanceTurn(b);

    // Published coupon rule: 10 units x (5% of face)/48.
    const coupon = perTurnCouponPayment(5, BOND_UNIT_FACE_VALUE) * 10;
    // The twin cash delta IS the payment (no other writer diverges: the
    // line phase is RNG-free and no pre-line phase reads the line).
    const payment = Math.round((b.player.cash - a.player.cash) * 100) / 100;
    expect(payment).toBeGreaterThan(0);
    expect(payment).toBeLessThanOrEqual(Math.round(coupon * 100) / 100);
    // Paid in full from the coupon wallet: unfrozen and balance down.
    expect(a.player.lineOfCredit!.drawFrozen).toBe(false);
    expect(a.player.lineOfCredit!.balance).toBeLessThan(1000);
    expect(a.player.lineOfCredit!.arrears).toBe(0);
  });
});

describe("finance reconcile save determinism #317", () => {
  it("keeps the reconciled turn deterministic across save and resume", () => {
    const live = financeWorld(true).world;
    advanceTurn(live);
    const resumed = deserializeSave(serializeSave(live, STAMP));

    advanceTurn(live);
    advanceTurn(resumed);

    expect(JSON.stringify(resumed)).toBe(JSON.stringify(live));
  });
});
