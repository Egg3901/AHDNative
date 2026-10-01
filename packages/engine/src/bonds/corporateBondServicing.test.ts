import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { executeAction } from "../actions/execute.js";
import { deserializeSave, serializeSave } from "../save.js";
import { BOND_UNIT_FACE_VALUE, calculateBondMarketPrice, perTurnCouponPayment } from "./constants.js";
import { issueCorporateBond } from "./corporateBonds.js";
import {
  buybackCorporateBondUnits,
  corporateCouponPerUnit,
  processCorporateBondTurn,
  quoteCorporateBondBuyback,
} from "./corporateBondServicing.js";
import { nativeBondPoolForCurrency } from "./bondMarketPool.js";

const OPTS = {
  seed: "corp-bond-service",
  playerName: "Tester",
  countryId: "US",
  era: "1953",
} as const;

function usCorpId(world: ReturnType<typeof createWorld>): string {
  const id = Object.keys(world.corporations).find(
    (k) => world.corporations[k]!.countryId === "US",
  );
  expect(id).toBeDefined();
  return id!;
}

function issue(
  world: ReturnType<typeof createWorld>,
  corpId: string,
  totalUnits = 100,
) {
  const res = issueCorporateBond(world, corpId, {
    totalUnits,
    maturityTurns: 240,
  });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("issuance failed");
  return world.bonds[res.bondId]!;
}

function fund(
  world: ReturnType<typeof createWorld>,
  corpId: string,
  amount = 1_000_000_000,
) {
  world.corporations[corpId]!.liquidCapital = amount;
}

// ── Coupon success (source: bondTurn.ts Phase 1 + corpBondCashflows.ts) ──
describe("corporate coupon servicing", () => {
  it("debits the issuer for every outstanding unit and pays holders in the bond denomination", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId);
    fund(world, corpId);
    world.player.cash = 1_000_000;
    world.player.actions = 10;
    expect(
      executeAction(world, "player", "buyBond", { bondId: bond.id, units: 10 })
        .ok,
    ).toBe(true);

    const corpBefore = world.corporations[corpId]!.liquidCapital;
    const cashBefore = world.player.cash;
    const perUnit = corporateCouponPerUnit(bond);
    expect(perUnit).toBe(
      perTurnCouponPayment(bond.couponRate, BOND_UNIT_FACE_VALUE),
    );

    const res = processCorporateBondTurn(world);
    expect(res.couponsPaid).toBe(perUnit * 10);
    expect(world.corporations[corpId]!.liquidCapital).toBe(
      corpBefore - perUnit * 100,
    );
    expect(world.player.cash).toBe(cashBefore + perUnit * 10);
    expect(bond.lastCouponTurn).toBe(world.meta.turn);
    expect(bond.matured).toBe(false);
    expect(bond.defaulted).toBe(false);
    expect(bond.marketPrice).toBeGreaterThan(0.05);
    expect(bond.currencyCode).toBe(world.budgets[bond.countryId]!.currencyCode);
  });

  it("conserves cash: issuer debit equals holder credit plus the vanished float slice", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId);
    fund(world, corpId);
    world.player.cash = 1_000_000;
    world.player.actions = 10;
    expect(
      executeAction(world, "player", "buyBond", { bondId: bond.id, units: 10 })
        .ok,
    ).toBe(true);

    const corpBefore = world.corporations[corpId]!.liquidCapital;
    const cashBefore = world.player.cash;
    processCorporateBondTurn(world);
    const perUnit = corporateCouponPerUnit(bond);
    const issuerDelta = world.corporations[corpId]!.liquidCapital - corpBefore;
    const playerDelta = world.player.cash - cashBefore;
    // No pool in solo: the float slice is real issuer expense that vanishes.
    // Coupon flows are unrounded floats (same as the sovereign seam), so
    // conservation holds to float dust, not exact Object.is equality.
    expect(
      Math.abs(issuerDelta + playerDelta + perUnit * bond.publicFloat),
    ).toBeLessThan(1e-6);
  });

  it("waives coupon cost for a state-owned issuer but still pays holders and never defaults", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    world.corporations[corpId]!.ownershipState = "stateOwned";
    world.corporations[corpId]!.countryOwnerId = "US";
    const bond = issue(world, corpId);
    world.corporations[corpId]!.liquidCapital = 0;
    world.player.cash = 1_000_000;
    world.player.actions = 10;
    expect(
      executeAction(world, "player", "buyBond", { bondId: bond.id, units: 10 })
        .ok,
    ).toBe(true);

    const cashBefore = world.player.cash;
    const res = processCorporateBondTurn(world);
    expect(res.defaulted).toBe(0);
    expect(world.corporations[corpId]!.liquidCapital).toBe(0);
    expect(world.player.cash).toBe(
      cashBefore + corporateCouponPerUnit(bond) * 10,
    );
    expect(bond.defaulted).toBe(false);
  });
});

describe("corporate bond market pricing", () => {
  it("matches the independently executed Game 01797b2708 corporate-credit source vector", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const corp = world.corporations[corpId]!;
    corp.liquidCapital = 2_000_000;
    corp.totalShares = 1_000_000;
    corp.sharePrice = 30;
    const bond = issue(world, corpId, 1_000);
    bond.couponRate = 5;

    const price = processCorporateBondTurn(world);
    expect(price.defaulted).toBe(0);
    // Immutable Game src/lib/constants/bonds.ts independently executed with
    // calculateCreditScore(2M, 1M, 0, 50K, 5M) -> A (58),
    // getBondCouponRate(3, "A") -> 5.5%, and calculateBondMarketPrice(5,5.5,240,false) -> .9786.
    expect(bond.marketPrice).toBe(0.9786);
    expect(calculateBondMarketPrice(5, 5.5, 240, false)).toBe(0.9786);
  });
});

// ── Insufficient cash → default (source: bondTurn.ts Phase 3/4) ──────────
describe("corporate default", () => {
  it("marks the bond defaulted with zero flows and frozen holdings when the issuer cannot cover", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId);
    world.corporations[corpId]!.liquidCapital = 1;
    world.player.cash = 1_000_000;
    world.player.actions = 10;
    expect(
      executeAction(world, "player", "buyBond", { bondId: bond.id, units: 10 })
        .ok,
    ).toBe(true);

    const cashBefore = world.player.cash;
    const res = processCorporateBondTurn(world);
    expect(res.defaulted).toBe(1);
    expect(res.couponsPaid).toBe(0);
    expect(bond.defaulted).toBe(true);
    expect(bond.defaultedAtTurn).toBe(world.meta.turn);
    expect(bond.marketPrice).toBe(0.1);
    expect(world.corporations[corpId]!.liquidCapital).toBe(1);
    expect(world.player.cash).toBe(cashBefore);
    // Creditor consequence: the position freezes on defaulted paper.
    expect(bond.holders.find((h) => h.holderId === "player")?.units).toBe(10);
    expect(bond.matured).toBe(false);

    const resumed = deserializeSave(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    const resumedBond = resumed.bonds[bond.id]!;
    expect(resumedBond).toMatchObject({ defaulted: true, defaultedAtTurn: world.meta.turn, marketPrice: 0.1 });
    expect(resumedBond.holders.find((h) => h.holderId === "player")?.units).toBe(10);
    const resumedIssuerCash = resumed.corporations[corpId]!.liquidCapital;
    const resumedPlayerCash = resumed.player.cash;
    expect(processCorporateBondTurn(resumed)).toEqual({ couponsPaid: 0, matured: 0, defaulted: 0 });
    expect(resumed.corporations[corpId]!.liquidCapital).toBe(resumedIssuerCash);
    expect(resumed.player.cash).toBe(resumedPlayerCash);
  });

  it("a defaulted bond accrues nothing further and reprocessing is a no-op", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId);
    world.corporations[corpId]!.liquidCapital = 1;
    expect(processCorporateBondTurn(world).defaulted).toBe(1);
    const again = processCorporateBondTurn(world);
    expect(again).toEqual({ couponsPaid: 0, matured: 0, defaulted: 0 });
    // Blocked at the action seam too.
    world.player.cash = 1_000_000;
    world.player.actions = 10;
    expect(
      executeAction(world, "player", "buyBond", { bondId: bond.id, units: 1 })
        .ok,
    ).toBe(false);
  });
});

// ── Buyback (source: buyback/route.ts) ───────────────────────────────────
describe("corporate buyback", () => {
  it("uses the source pool ask and converts the bond denomination through the accounting anchor", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId, 10);
    bond.marketPrice = 0.9786;
    bond.currencyCode = "GBP"; // source preserves issue denomination across a later issuer-country move
    const gbpPool = nativeBondPoolForCurrency(world, "GBP");
    expect(gbpPool.cashLocal).toBe(gbpPool.targetCashLocal);
    const gbpRate = Object.values(world.exchangeRates).find((row) => row.currencyCode === "GBP")!.rate;
    const usdRate = 1;
    const quote = quoteCorporateBondBuyback(world, bond);
    // Game 01797b2708 marketPoolQuotes.ts: corporate half spread 2%; no cash
    // skew at the source opening pool; round(mid * 1.02, 4) -> .9982.
    // Game buyback route converts GBP local -> USD anchor -> issuer USD local.
    expect(quote).toMatchObject({ available: true, currencyCode: "GBP", issuerCurrencyCode: "USD", askPerUnit: 998.2 });
    expect(quote.issuerCostPerUnit).toBe(Math.round((998.2 / gbpRate * usdRate) * 100) / 100);
    world.corporations[corpId]!.liquidCapital = quote.issuerCostPerUnit * 10;
    const result = buybackCorporateBondUnits(world, bond.id, 10);
    expect(result).toMatchObject({ ok: true, cost: quote.issuerCostPerUnit * 10, currencyCode: "USD" });
    expect(world.bondMarketPools?.GBP?.cashLocal).toBe(gbpPool.cashLocal + 9_982);
    expect(world.bondMarketPools?.GBP?.lifetime.retiredIn).toBe(9_982);
  });

  it("retires float units at market price, shrinking float and outstanding face", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId);
    fund(world, corpId);
    const corpBefore = world.corporations[corpId]!.liquidCapital;

    const res = buybackCorporateBondUnits(world, bond.id, 20);
    expect(res).toEqual({
      ok: true,
      units: 20,
      cost: 20 * BOND_UNIT_FACE_VALUE * 1.02,
      currencyCode: "USD",
    });
    expect(bond.publicFloat).toBe(80);
    expect(bond.totalIssued).toBe(80 * BOND_UNIT_FACE_VALUE);
    expect(world.corporations[corpId]!.liquidCapital).toBe(
      corpBefore - 20 * BOND_UNIT_FACE_VALUE * 1.02,
    );
    expect(world.bondMarketPools?.USD?.lifetime.retiredIn).toBe(20 * BOND_UNIT_FACE_VALUE * 1.02);
    expect(bond.matured).toBe(false);
  });

  it("rejects over-float, non-positive, and unfunded buybacks without mutating anything", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId);
    fund(world, corpId);
    const capBefore = world.corporations[corpId]!.liquidCapital;

    expect(buybackCorporateBondUnits(world, bond.id, 101).ok).toBe(false);
    expect(buybackCorporateBondUnits(world, bond.id, 0).ok).toBe(false);
    expect(buybackCorporateBondUnits(world, "no-such-bond", 1).ok).toBe(false);
    expect(world.corporations[corpId]!.liquidCapital).toBe(capBefore);
    world.corporations[corpId]!.liquidCapital = 1;
    expect(buybackCorporateBondUnits(world, bond.id, 1).ok).toBe(false);
    // Every rejection commits nothing: float, face, and status are untouched.
    expect(bond.publicFloat).toBe(100);
    expect(bond.totalIssued).toBe(100 * BOND_UNIT_FACE_VALUE);
    expect(bond.matured).toBe(false);
  });

  it("buys defaulted float at face rather than the recovery mark", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId, 10);
    world.corporations[corpId]!.liquidCapital = 0;
    expect(processCorporateBondTurn(world).defaulted).toBe(1);
    expect(bond.marketPrice).toBe(0.1);
    world.corporations[corpId]!.liquidCapital = 50_000;
    const result = buybackCorporateBondUnits(world, bond.id, 2);
    expect(result).toEqual({ ok: true, units: 2, cost: 2 * bond.faceValue, currencyCode: "USD" });
    expect(bond.publicFloat).toBe(8);
    expect(bond.totalIssued).toBe(8 * bond.faceValue);
    expect(bond.defaulted).toBe(true);
  });

  it("rejects malformed cash or price state atomically", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId, 10);
    fund(world, corpId);
    const cash = world.corporations[corpId]!.liquidCapital;
    bond.marketPrice = Number.NaN;
    expect(buybackCorporateBondUnits(world, bond.id, 1).ok).toBe(false);
    expect(world.corporations[corpId]!.liquidCapital).toBe(cash);
    expect(bond.publicFloat).toBe(10);
    expect(bond.totalIssued).toBe(10 * bond.faceValue);
  });

  it("fully retiring an unheld series closes it at par", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId, 10);
    fund(world, corpId);
    const res = buybackCorporateBondUnits(world, bond.id, 10);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cost).toBe(10 * BOND_UNIT_FACE_VALUE * 1.02);
    expect(bond.publicFloat).toBe(0);
    expect(bond.totalIssued).toBe(0);
    expect(bond.matured).toBe(true);
    expect(bond.defaulted).toBe(false);
    expect(bond.marketPrice).toBe(1.0);
  });
});

// ── Maturity (source: bondTurn.ts Phase 5) ───────────────────────────────
describe("corporate maturity", () => {
  it("settles face to holders, debits the issuer for every outstanding unit, and clears ownership", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId);
    fund(world, corpId);
    world.player.cash = 1_000_000;
    world.player.actions = 10;
    expect(
      executeAction(world, "player", "buyBond", { bondId: bond.id, units: 5 })
        .ok,
    ).toBe(true);
    world.meta.turn = bond.maturityTurn;

    // Skip the coupon stamp so this turn settles coupon + principal together.
    const corpBefore = world.corporations[corpId]!.liquidCapital;
    const cashBefore = world.player.cash;
    const perUnit = corporateCouponPerUnit(bond);
    const res = processCorporateBondTurn(world);
    expect(res.matured).toBe(1);
    expect(world.corporations[corpId]!.liquidCapital).toBe(
      corpBefore - (perUnit * 100 + 100 * BOND_UNIT_FACE_VALUE),
    );
    expect(world.player.cash).toBe(
      cashBefore + perUnit * 5 + 5 * BOND_UNIT_FACE_VALUE,
    );
    expect(bond.matured).toBe(true);
    expect(bond.holders).toEqual([]);
    expect(bond.publicFloat).toBe(0);
  });

  it("defaults instead of settling when the issuer cannot cover face at maturity", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId);
    world.corporations[corpId]!.liquidCapital = 1;
    world.meta.turn = bond.maturityTurn;
    const res = processCorporateBondTurn(world);
    expect(res.matured).toBe(0);
    expect(res.defaulted).toBe(1);
    expect(bond.defaulted).toBe(true);
    expect(bond.matured).toBe(false);
    expect(world.corporations[corpId]!.liquidCapital).toBe(1);
  });

  it("maturity settlement is one-shot: reprocessing the same turn moves no cash", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId);
    fund(world, corpId);
    world.meta.turn = bond.maturityTurn;
    expect(processCorporateBondTurn(world).matured).toBe(1);
    const corpAfter = world.corporations[corpId]!.liquidCapital;
    const cashAfter = world.player.cash;
    expect(processCorporateBondTurn(world)).toEqual({
      couponsPaid: 0,
      matured: 0,
      defaulted: 0,
    });
    expect(world.corporations[corpId]!.liquidCapital).toBe(corpAfter);
    expect(world.player.cash).toBe(cashAfter);
  });
});

// ── Idempotency, reload, denomination, engine seams ──────────────────────
describe("servicing seams", () => {
  it("does not double-pay coupons when the same turn is processed twice", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId);
    fund(world, corpId);
    processCorporateBondTurn(world);
    const corpAfter = world.corporations[corpId]!.liquidCapital;
    const cashAfter = world.player.cash;
    const again = processCorporateBondTurn(world);
    expect(again).toEqual({ couponsPaid: 0, matured: 0, defaulted: 0 });
    expect(world.corporations[corpId]!.liquidCapital).toBe(corpAfter);
    expect(world.player.cash).toBe(cashAfter);
  });

  it("services identically after a save/reload round-trip", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId);
    fund(world, corpId);
    world.player.cash = 1_000_000;
    world.player.actions = 10;
    expect(
      executeAction(world, "player", "buyBond", { bondId: bond.id, units: 10 })
        .ok,
    ).toBe(true);

    const raw = serializeSave(world, "2026-09-01T00:00:00.000Z");
    const restored = deserializeSave(raw);
    const perUnit = corporateCouponPerUnit(restored.bonds[bond.id]!);
    const corpBefore = restored.corporations[corpId]!.liquidCapital;
    const cashBefore = restored.player.cash;
    const res = processCorporateBondTurn(restored);
    expect(res.couponsPaid).toBe(perUnit * 10);
    expect(restored.corporations[corpId]!.liquidCapital).toBe(
      corpBefore - perUnit * 100,
    );
    expect(restored.player.cash).toBe(cashBefore + perUnit * 10);
  });

  it("credits the bond denomination bucket when it differs from the player home currency", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId);
    fund(world, corpId);
    world.player.actions = 10;
    // Crafted doc: reached past the domestic-only trade seam to exercise the
    // denomination fallback (mirrors the sovereign seam's behavior).
    bond.currencyCode = "EUR";
    bond.holders.push({ holderId: "player", units: 10 });
    bond.publicFloat -= 10;
    const cashBefore = world.player.cash;
    processCorporateBondTurn(world);
    expect(world.player.cash).toBe(cashBefore);
    expect(world.player.currencyBalances?.personal["EUR"]).toBe(
      corporateCouponPerUnit(bond) * 10,
    );
  });

  it("runs inside advanceTurn through the bond coupon/maturity phase", () => {
    const world = createWorld(OPTS);
    const corpId = usCorpId(world);
    const bond = issue(world, corpId);
    fund(world, corpId);
    advanceTurn(world);
    expect(bond.lastCouponTurn).toBe(world.meta.turn);
    expect(bond.matured).toBe(false);
    expect(bond.defaulted).toBe(false);
  });
});
