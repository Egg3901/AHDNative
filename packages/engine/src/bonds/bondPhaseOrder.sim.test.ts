import { describe, expect, it, beforeEach } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import {
  BOND_UNIT_FACE_VALUE,
  calculateBondMarketPrice,
  perTurnCouponPayment,
} from "./constants.js";
import { getTraceBonds, resetBondIdSequenceForTests } from "./bondTurn.js";
import { issueCorporateBond } from "./corporateBonds.js";
import type { Bond } from "./types.js";

/**
 * #309 — bond phase writer/consumer timing at the public turn seam.
 *
 * Pinned source: AHDGame e364c0495
 * `src/simulation/phases/turnPhaseNames.ts` —
 *   corporationTurn (5) < bondTurn (18) < recomputeSharePrices (22),
 * with bondTurn itself ordered coupons -> maturity -> price/marking ->
 * settlement (`src/lib/turn/bondTurn.ts` Phases 1-5).
 *
 * Every test below drives the PUBLIC seam (`advanceTurn`, which runs
 * TURN_PHASES in registry order) and derives expectations from the
 * published formulas plus observed turn inputs — never from the phase
 * implementation under test. Twin-world differencing isolates the bond
 * cash flow from every other same-turn writer (corporationTurn never
 * reads world.bonds, so the twin delta is exactly the servicing flow).
 */

const OPTS = { seed: "bond-phase-order", playerName: "Tester", countryId: "US", era: "1953" } as const;
const CORP_ID = "US-manufacturing";

beforeEach(() => resetBondIdSequenceForTests());

function twinWorlds() {
  const a = createWorld(OPTS);
  const b = createWorld(OPTS);
  return [a, b] as const;
}

/** Craft a private-issuer corporate bond in world A only; player holds `held` units. */
function craftCorporate(
  world: ReturnType<typeof createWorld>,
  opts: { units: number; couponRate: number; held: number; maturesNextTurn?: boolean },
) {
  const res = issueCorporateBond(world, CORP_ID, {
    totalUnits: opts.units,
    maturityTurns: 96,
    couponRate: opts.couponRate,
  });
  expect(res.ok).toBe(true);
  const bond = world.bonds[res.ok ? res.bondId : ""]!;
  bond.holders = [{ holderId: "player", units: opts.held }];
  bond.publicFloat = opts.units - opts.held;
  if (opts.maturesNextTurn) bond.maturityTurn = world.meta.turn + 1;
  return bond;
}

function craftSovereign(
  world: ReturnType<typeof createWorld>,
  opts: { couponRate: number; maturityTurns: number; held: number },
): Bond {
  const turn = world.meta.turn;
  const bond: Bond = {
    id: "phase-order-sov",
    issuerType: "sovereign",
    countryId: "US",
    issuerName: "US",
    faceValue: BOND_UNIT_FACE_VALUE,
    couponRate: opts.couponRate,
    maturityTurns: opts.maturityTurns as Bond["maturityTurns"],
    issuedAtTurn: turn,
    maturityTurn: turn + opts.maturityTurns,
    marketPrice: 1.0,
    totalIssued: 1_000_000,
    publicFloat: 1000 - opts.held,
    holders: [{ holderId: "player", units: opts.held }],
    matured: false,
    defaulted: false,
    defaultedAtTurn: null,
    currencyCode: "USD",
    createdAt: world.meta.date,
    updatedAt: world.meta.date,
  };
  world.bonds[bond.id] = bond;
  return bond;
}

describe("next-turn sovereign bond price at the public seam", () => {
  it("reprices off the turn's prime rate through the published price formula", () => {
    const world = createWorld(OPTS);
    craftSovereign(world, { couponRate: 3, maturityTurns: 240, held: 0 });
    world.centralBanks["US"]!.primeRate = 5.0;

    const beforeTurn = world.meta.turn;
    advanceTurn(world);

    // Oracle: published formula over the prime the bond phase actually read
    // (the central-bank cluster runs before the bond cluster, so this is the
    // post-turn prime — the documented one-turn-fresh adaptation vs the
    // source's one-turn-lag prime).
    const prime = world.centralBanks["US"]!.primeRate;
    const remaining = 240 + beforeTurn - world.meta.turn;
    const expected = calculateBondMarketPrice(3, prime, remaining, false);
    expect(world.bonds["phase-order-sov"]!.marketPrice).toBeCloseTo(expected, 10);
    expect(world.bonds["phase-order-sov"]!.marketPrice).toBeLessThan(1.0);
  });
});

describe("corporate coupon flows at the public seam (twin-world oracle)", () => {
  it("debits exactly coupon x outstanding from issuer liquidCapital and credits holders", () => {
    const [a, b] = twinWorlds();
    const UNITS = 1_000;
    const HELD = 10;
    const COUPON = 4.8;
    craftCorporate(a, { units: UNITS, couponRate: COUPON, held: HELD });

    const perUnit = perTurnCouponPayment(COUPON, BOND_UNIT_FACE_VALUE);
    const expectedCost = perUnit * UNITS;
    const expectedPay = perUnit * HELD;

    advanceTurn(a);
    advanceTurn(b);

    // Issuer budget: twin delta is exactly the coupon (all other writers
    // are bond-blind and deterministic).
    const liquidA = a.corporations[CORP_ID]!.liquidCapital;
    const liquidB = b.corporations[CORP_ID]!.liquidCapital;
    expect(liquidB - liquidA).toBeCloseTo(expectedCost, 6);
    // Holder balances: same-currency USD lands in player.cash.
    expect(a.player.cash - b.player.cash).toBeCloseTo(expectedPay, 6);
    // Coupon observation stamped; paper untouched otherwise.
    const bond = a.bonds[Object.keys(a.bonds).find((id) => id.startsWith("cbond-"))!]!;
    expect(bond.lastCouponTurn).toBe(a.meta.turn);
    expect(bond.matured).toBe(false);
    expect(bond.defaulted).toBe(false);
    expect(bond.marketPrice).toBe(1.0);
    expect(getTraceBonds(a).find((t) => t.id === bond.id)?.playerUnits).toBe(HELD);
  });

  it("accrues exactly once per turn over two turns", () => {
    const [a, b] = twinWorlds();
    craftCorporate(a, { units: 1_000, couponRate: 4.8, held: 10 });
    const perUnit = perTurnCouponPayment(4.8, BOND_UNIT_FACE_VALUE);

    advanceTurn(a);
    advanceTurn(b);
    advanceTurn(a);
    advanceTurn(b);

    expect(b.corporations[CORP_ID]!.liquidCapital - a.corporations[CORP_ID]!.liquidCapital).toBeCloseTo(
      2 * perUnit * 1_000,
      4,
    );
    expect(a.player.cash - b.player.cash).toBeCloseTo(2 * perUnit * 10, 6);
  });
});

describe("corporate maturity at the public seam", () => {
  it("settles face to holders, debits the issuer for every outstanding unit, clears the paper", () => {
    const [a, b] = twinWorlds();
    const UNITS = 1_000;
    const HELD = 10;
    const COUPON = 4.8;
    const bond = craftCorporate(a, { units: UNITS, couponRate: COUPON, held: HELD, maturesNextTurn: true });

    const perUnit = perTurnCouponPayment(COUPON, BOND_UNIT_FACE_VALUE);
    const expectedIssuerCost = perUnit * UNITS + BOND_UNIT_FACE_VALUE * UNITS;
    const expectedPay = perUnit * HELD + BOND_UNIT_FACE_VALUE * HELD;

    advanceTurn(a);
    advanceTurn(b);

    expect(a.bonds[bond.id]!.matured).toBe(true);
    expect(a.bonds[bond.id]!.holders).toEqual([]);
    expect(a.bonds[bond.id]!.publicFloat).toBe(0);
    expect(a.bonds[bond.id]!.marketPrice).toBe(1.0);
    expect(b.corporations[CORP_ID]!.liquidCapital - a.corporations[CORP_ID]!.liquidCapital).toBeCloseTo(
      expectedIssuerCost,
      4,
    );
    expect(a.player.cash - b.player.cash).toBeCloseTo(expectedPay, 6);
  });
});

describe("corporate default at the public seam", () => {
  it("freezes the paper with zero flows when the issuer cannot cover the turn", () => {
    const [a, b] = twinWorlds();
    // Coupon 4800%/yr => 1000/unit/turn; 200M units => 200B obligation,
    // far above the ~101B post-corporationTurn capital, so servicing defaults.
    const bond = craftCorporate(a, { units: 200_000_000, couponRate: 4800, held: 5 });

    advanceTurn(a);
    advanceTurn(b);

    const after = a.bonds[bond.id]!;
    expect(after.defaulted).toBe(true);
    expect(after.defaultedAtTurn).toBe(a.meta.turn);
    expect(after.marketPrice).toBe(0.1);
    expect(after.matured).toBe(false);
    // Atomic zero-flow default: no issuer debit, no holder credit.
    expect(a.corporations[CORP_ID]!.liquidCapital).toBe(b.corporations[CORP_ID]!.liquidCapital);
    expect(a.player.cash).toBe(b.player.cash);
    // Holdings frozen on the paper.
    expect(after.holders.find((h) => h.holderId === "player")?.units).toBe(5);
  });
});

describe("#309 edge: share repricing reads post-servicing issuer capital", () => {
  it("prices the coupon-paying issuer below its bond-free twin after one public turn", () => {
    const [a, b] = twinWorlds();
    // Settle the earnings-initialization transient first (turns 1-2 pin both
    // twins to the +35% rate-limiter clamp regardless of ordering). The bond
    // is crafted after the settle, so at the measured turn both twins enter
    // repricing with identical capital pre-#309 (equal prices) while #309
    // reprices A off post-coupon capital (A strictly below B).
    for (let i = 0; i < 6; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    // 10M units x (4.8% x 1000 / 48) = 10M/turn debit; ~1.0/share of book
    // value, visible past 2dp rounding with repricing moves unclamped.
    craftCorporate(a, { units: 10_000_000, couponRate: 4.8, held: 0 });

    advanceTurn(a);
    advanceTurn(b);

    const corpA = a.corporations[CORP_ID]!;
    const corpB = b.corporations[CORP_ID]!;
    // The servicing debit landed (twin oracle pins the size).
    expect(corpB.liquidCapital - corpA.liquidCapital).toBeCloseTo(10_000_000, 1);
    // And this turn's repricing already reflects it.
    expect(corpA.fundamentalSharePrice).toBeLessThan(corpB.fundamentalSharePrice);
    expect(corpA.sharePrice).toBeLessThan(corpB.sharePrice);
    expect(Number.isFinite(corpA.sharePrice)).toBe(true);
  });
});
