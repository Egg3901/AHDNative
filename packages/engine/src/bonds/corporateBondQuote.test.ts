import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { quoteCorporateBondIssuance } from "./corporateBondQuote.js";

describe("public corporate bond issuance quote", () => {
  it("matches the independently executed Game NPV, credit, coupon and issuance-window vector", () => {
    const world = createWorld({ seed: "corp-quote-source-vector", playerName: "CEO", countryId: "US", era: "1953" });
    const corp = world.corporations["US-media"]!;
    corp.ceoType = "player";
    corp.ceoId = "player";
    corp.ceoVacant = false;
    corp.liquidCapital = 100_000;
    corp.revenue = 10_000; // Native one-turn revenue
    corp.effectiveProfitMargin = 20;
    corp.currentGrowthCost = 0;
    world.centralBanks.US!.primeRate = 3;

    const quote = quoteCorporateBondIssuance(world, corp.id);
    // Game 01797b2708 independently executed:
    // sector revenue 240,000/day (= 10,000 Native per-turn × TURNS_PER_DAY 24),
    // effective margin 20%, growth 0 -> sector NPV 640,000 at 15%;
    // cash 100,000 -> equity 740,000. calculateCreditScore(100k,0,96k,0,740k)
    // -> AAA/96; getBondCouponRate(3,AAA,[96,240,336]) -> [4,5,5.75];
    // effectiveBondIssuanceWindow(500M,740k,0,740k) -> max 740k, available.
    expect(quote).toMatchObject({
      available: true,
      creditRating: "AAA",
      maximumFaceValue: 740_000,
      minimumFaceValue: 100_000,
      couponRates: { 96: 4, 240: 5, 336: 5.75 },
    });
  });

  it("keeps the quote unavailable under cooldown and with invalid balance-sheet inputs", () => {
    const world = createWorld({ seed: "corp-quote-unavailable", playerName: "CEO", countryId: "US", era: "1953" });
    const corp = world.corporations["US-media"]!;
    corp.ceoType = "player";
    corp.ceoId = "player";
    corp.ceoVacant = false;
    world.bonds["corp-existing"] = {
      id: "corp-existing", issuerType: "corporation", corporationId: corp.id,
      countryId: "US", issuerName: corp.name!, faceValue: 1_000, couponRate: 5,
      maturityTurns: 96, issuedAtTurn: world.meta.turn, maturityTurn: world.meta.turn + 96,
      marketPrice: 1, totalIssued: 100_000, publicFloat: 100, holders: [], matured: false,
      defaulted: false, defaultedAtTurn: null, currencyCode: "USD", createdAt: world.meta.date, updatedAt: world.meta.date,
    };
    expect(quoteCorporateBondIssuance(world, corp.id)).toMatchObject({ available: false, cooldownTurnsRemaining: 24 });
    delete world.bonds["corp-existing"];
    corp.liquidCapital = Number.NaN;
    expect(quoteCorporateBondIssuance(world, corp.id)).toMatchObject({ available: false, reason: expect.stringContaining("finite") });
  });
});
