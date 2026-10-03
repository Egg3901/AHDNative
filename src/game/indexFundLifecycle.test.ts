import { describe, expect, it } from "vitest";
import { GameSession } from "./session";
import { advanceTurn, deserializeSave, projectSaveToV42 } from "@ahdclient/engine";
import { buildIndexFundTargetConstituents } from "/root/misc/archive/2026-10-03-ahdnative-index-funds-72/source-oracle/src/lib/indexFunds/constituents";
import { planFundTargetRebalance } from "/root/misc/archive/2026-10-03-ahdnative-index-funds-72/source-oracle/src/lib/indexFunds/fundTargetRebalance";

describe("source-seeded index fund player lifecycle", () => {
  it("subscribes to the source US Top 25 fund through the public session and preserves the position", () => {
    const session = new GameSession();
    session.create({
      seed: "source-index-fund-public-session",
      era: "1953",
      countryId: "US",
      playerName: "Alex",
      creation: {
        name: "Alex",
        homeRegionId: "AL",
        partyId: null,
        stats: { charisma: 4, debate: 4, energy: 4, fundraising: 4, businessAcumen: 4, statecraft: 4, intellect: 4 },
        policies: { economic: 0, social: 0 },
        demographics: { race: "white", gender: "male", education: "college", wealth: "middle" },
      },
    });

    const initial = JSON.parse(session.serialize("2026-10-03T14:00:00.000Z"));
    const cashBefore = initial.world.player.cash;
    const fundCashBefore = initial.world.indexFundBook.funds.us_top_25.cashAnchor;
    const beforeRefusal = session.serialize("2026-10-03T14:00:00.000Z");
    expect(session.act("subscribeIndexFund", { fundSlug: "us_top_25", units: 2_000_000 }).ok).toBe(false);
    expect(session.serialize("2026-10-03T14:00:00.000Z")).toBe(beforeRefusal);
    const result = session.act("subscribeIndexFund", { fundSlug: "us_top_25", units: 1 });
    expect(result.ok).toBe(true);

    const save = JSON.parse(session.serialize("2026-10-03T14:00:00.000Z"));
    expect(save.world.indexFundBook.funds.us_top_25).toMatchObject({ unitSupply: 500_001, cashAnchor: fundCashBefore + 100 });
    expect(save.world.player.cash).toBe(cashBefore - 100);
    expect(save.world.indexFundBook.positions).toContainEqual(expect.objectContaining({ fundSlug: "us_top_25", holderKind: "player", units: 1 }));
    expect(projectSaveToV42(session.serialize("2026-10-03T14:00:00.000Z")).ok).toBe(false);

    const raw = session.serialize("2026-10-03T14:01:00.000Z");
    const continued = new GameSession();
    continued.load(raw);
    expect(continued.act("redeemIndexFund", { fundSlug: "us_top_25", units: 1 }).ok).toBe(true);
    const afterRedeem = JSON.parse(continued.serialize("2026-10-03T14:02:00.000Z"));
    expect(afterRedeem.world.indexFundBook.funds.us_top_25).toMatchObject({ unitSupply: 500_000, cashAnchor: fundCashBefore });
    expect(afterRedeem.world.player.cash).toBe(cashBefore);

    const left = new GameSession();
    const right = new GameSession();
    left.load(raw);
    right.load(raw);
    left.advance();
    right.advance();
    const continuedRaw = left.serialize("2026-10-03T15:00:00.000Z");
    expect(continuedRaw).toBe(right.serialize("2026-10-03T15:00:00.000Z"));
    const next = JSON.parse(continuedRaw).world;
    expect(next.indexFundBook.funds.us_top_25.targetConstituents.length).toBeGreaterThan(0);
    const oracleWorld = deserializeSave(raw);
    let beforeFundPhase: typeof oracleWorld | undefined;
    advanceTurn(oracleWorld, {
      afterPhase(name, world) {
        if (name === "countryPolitics") beforeFundPhase = structuredClone(world) as typeof oracleWorld;
      },
    });
    expect(beforeFundPhase).toBeDefined();
    const sourceCandidates = Object.entries(beforeFundPhase!.corporations).map(([id, corp]: [string, any]) => ({
      _id: { toString: () => id },
      countryId: corp.countryId,
      type: corp.sectorType,
      secondaryType: corp.secondarySectorType,
      sharePrice: corp.sharePrice,
      totalShares: corp.totalShares,
      liquidCurrencyCode: corp.liquidCurrencyCode ?? "USD",
      countryOwnerId: corp.countryOwnerId,
      isPrivate: corp.isPrivate,
      hiddenFromExchange: corp.hiddenFromExchange,
      publicFloat: corp.publicFloat,
      liquidCapital: corp.liquidCapital,
    }));
    const sourceTargets = buildIndexFundTargetConstituents({
      corporations: sourceCandidates,
      definition: { scope: "country", kind: "broad", countryId: "US", topN: 25, anchorCurrencyCode: "USD" },
      exchangeRates: { USD: 1 },
    }).constituents.map(({ corporationId, marketCapAnchor, targetWeight, rank }) => ({
      corporationId: corporationId.toString(), marketCapAnchor, targetWeight, rank,
    }));
    const nativeTargets = next.indexFundBook.funds.us_top_25.targetConstituents;
    expect(nativeTargets.map(({ corporationId, rank }) => ({ corporationId, rank }))).toEqual(
      sourceTargets.map(({ corporationId, rank }) => ({ corporationId, rank })),
    );
    nativeTargets.forEach((target, index) => {
      expect(target.marketCapAnchor).toBeCloseTo(sourceTargets[index].marketCapAnchor, 7);
      expect(target.targetWeight).toBeCloseTo(sourceTargets[index].targetWeight, 14);
    });
    const fundBefore = beforeFundPhase!.indexFundBook.funds.us_top_25;
    const sourcePlan = planFundTargetRebalance({
      fund: {
        _id: { toString: () => "us_top_25" },
        anchorCurrencyCode: "USD",
        cashAnchor: fundBefore.cashAnchor,
        holdings: Object.entries(fundBefore.holdings).map(([corporationId, holding]) => ({
          corporationId: { toString: () => corporationId },
          shares: holding.shares,
          lastValueAnchor: holding.lastValueAnchor,
          avgCostPerShareAnchor: holding.averageCostPerShare,
        })),
        targetConstituents: sourceTargets.map((target) => ({
          corporationId: { toString: () => target.corporationId },
          marketCapAnchor: target.marketCapAnchor,
          targetWeight: target.targetWeight,
          rank: target.rank,
        })),
      },
      corps: Object.entries(beforeFundPhase!.corporations).map(([id, corp]: [string, any]) => ({
        _id: { toString: () => id },
        sharePrice: corp.sharePrice,
        fundamentalSharePrice: corp.fundamentalSharePrice,
        totalShares: corp.totalShares,
        publicFloat: corp.publicFloat,
        liquidCurrencyCode: corp.liquidCurrencyCode ?? "USD",
      })),
      exchangeRates: { USD: 1 },
      bondPrincipalAnchor: 0,
    });
    const actualPurchases = next.indexFundBook.transactions
      .filter((transaction) => transaction.turn === next.meta.turn && transaction.kind === "floatPurchase")
      .map(({ corporationId, units, cashAnchor }) => ({ corporationId, shares: units, valueAnchor: cashAnchor }))
      .sort((a, b) => a.corporationId!.localeCompare(b.corporationId!));
    const expectedPurchases = sourcePlan.buys
      .map((leg) => ({ corporationId: leg.corporationId.toString(), shares: leg.shares, valueAnchor: leg.valueAnchor }))
      .sort((a, b) => a.corporationId.localeCompare(b.corporationId));
    expect(actualPurchases).toEqual(expectedPurchases);
    const holdings = next.indexFundBook.funds.us_top_25.holdings as Record<string, { shares: number }>;
    expect(Object.values(holdings).reduce((sum: number, holding) => sum + holding.shares, 0)).toBeGreaterThan(0);
    for (const [corpId, holding] of Object.entries(holdings)) {
      expect(left.markets().listings.find((listing) => listing.id === corpId)?.shareholders).toContainEqual(
        expect.objectContaining({ holder: "fund", holderId: "us_top_25", shares: holding.shares }),
      );
    }

    const corrupt = JSON.parse(raw);
    corrupt.world.indexFundBook.funds.us_top_25.unitSupply += 1;
    const beforeRejectedLoad = left.serialize("2026-10-03T15:01:00.000Z");
    expect(() => left.load(JSON.stringify(corrupt))).toThrow(/invalid index fund custody state/);
    expect(left.serialize("2026-10-03T15:01:00.000Z")).toBe(beforeRejectedLoad);
  });
});
