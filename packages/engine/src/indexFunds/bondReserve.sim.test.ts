import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { indexFundTurnPhase } from "./turn.js";
import { BOND_UNIT_FACE_VALUE } from "../bonds/constants.js";
import { perTurnCouponPayment } from "../bonds/constants.js";
import { payCouponsAndUpdatePrices, settleMaturedBonds } from "../bonds/bondTurn.js";
import { deserializeSave, serializeSave } from "../save.js";

describe("index fund sovereign bond reserve", () => {
  it("buys real home sovereign units from public float at the pool ask and records custody", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "fund-bond-reserve", playerName: "Alex" });
    const fund = world.indexFundBook!.funds.us_sovereign_bonds!;
    const bondId = "source-us-sovereign";
    world.bonds[bondId] = {
      id: bondId, issuerType: "sovereign", countryId: "US", issuerName: "US", faceValue: BOND_UNIT_FACE_VALUE,
      couponRate: 5, maturityTurns: 48, issuedAtTurn: 0, maturityTurn: 48, marketPrice: 1,
      totalIssued: 100_000, publicFloat: 100, holders: [], matured: false, defaulted: false,
      defaultedAtTurn: null, currencyCode: "USD", createdAt: world.meta.date, updatedAt: world.meta.date,
    };

    indexFundTurnPhase.run(world, rngFromSeed("fund-bond-reserve"));

    expect(world.bonds[bondId]!.holders).toContainEqual({ holderId: "index-fund:us_sovereign_bonds", units: 25 });
    expect(world.bonds[bondId]!.publicFloat).toBe(50);
    expect(world.bonds[bondId]!.holders).toContainEqual({ holderId: "index-fund:global_emerging_sovereign", units: 25 });
    expect(fund.bondHoldings?.[bondId]).toEqual(expect.objectContaining({ units: 25 }));
    expect(fund.cashAnchor).toBeLessThan(INITIAL_CASH);
    expect(world.bondMarketPools?.USD?.cashLocal).toBeGreaterThan(0);
    expect(world.indexFundBook!.transactions).toContainEqual(expect.objectContaining({
      fundSlug: fund.slug, kind: "bondPurchase", bondId, units: 25,
    }));
    const restored = deserializeSave(serializeSave(world, "2026-10-03T15:00:00.000Z"));
    expect(restored.indexFundBook!.funds.us_sovereign_bonds!.bondHoldings).toEqual(fund.bondHoldings);
    expect(restored.bonds[bondId]!.holders).toEqual(world.bonds[bondId]!.holders);
  });

  it("receives per-turn coupons and maturity principal into fund anchor cash, then saves continuation", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "fund-bond-servicing", playerName: "Alex" });
    const fund = world.indexFundBook!.funds.us_sovereign_bonds!;
    const bondId = "source-us-sovereign";
    world.bonds[bondId] = {
      id: bondId, issuerType: "sovereign", countryId: "US", issuerName: "US", faceValue: BOND_UNIT_FACE_VALUE,
      couponRate: 5, maturityTurns: 48, issuedAtTurn: 0, maturityTurn: 48, marketPrice: 1,
      totalIssued: 100_000, publicFloat: 100, holders: [], matured: false, defaulted: false,
      defaultedAtTurn: null, currencyCode: "USD", createdAt: world.meta.date, updatedAt: world.meta.date,
    };
    indexFundTurnPhase.run(world, rngFromSeed("fund-bond-servicing"));
    const acquired = fund.bondHoldings?.[bondId]?.units ?? 0;
    expect(acquired).toBe(25);
    const cashAfterPurchase = fund.cashAnchor;

    world.meta.turn = 1;
    payCouponsAndUpdatePrices(world);
    expect(fund.cashAnchor).toBeCloseTo(cashAfterPurchase + acquired * perTurnCouponPayment(5, BOND_UNIT_FACE_VALUE), 6);
    expect(world.indexFundBook!.transactions).toContainEqual(expect.objectContaining({ fundSlug: fund.slug, kind: "bondCoupon", bondId, units: acquired }));

    world.meta.turn = 48;
    settleMaturedBonds(world);
    expect(fund.cashAnchor).toBeCloseTo(cashAfterPurchase + acquired * perTurnCouponPayment(5, BOND_UNIT_FACE_VALUE) + acquired * BOND_UNIT_FACE_VALUE, 6);
    expect(fund.bondHoldings?.[bondId]).toBeUndefined();
    expect(world.indexFundBook!.transactions).toContainEqual(expect.objectContaining({ fundSlug: fund.slug, kind: "bondMaturity", bondId, units: acquired }));
    indexFundTurnPhase.run(world, rngFromSeed("fund-bond-matured"));
    const restored = deserializeSave(serializeSave(world, "2026-10-03T15:00:00.000Z"));
    expect(restored.indexFundBook!.funds.us_sovereign_bonds!.bondHoldings).toEqual(fund.bondHoldings);
    expect(restored.indexFundBook!.transactions).toEqual(world.indexFundBook!.transactions);
  });
});

const INITIAL_CASH = 50_000_000;
