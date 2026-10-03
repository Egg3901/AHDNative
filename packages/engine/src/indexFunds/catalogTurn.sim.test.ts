import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { indexFundTurnPhase } from "./turn.js";
import { rngFromSeed } from "../rng.js";

describe("46-fund catalog market participation", () => {
  it("uses the recorded GBP wallet and public issuer float, then saves the real book", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "fund-catalog-source-flow", playerName: "Alex" });
    const ukFund = world.indexFundBook!.funds.uk_top_25!;
    const exchange = executeAction(world, "player", "exchangeCurrency", {
      fromCurrency: "USD", toCurrency: "GBP", amount: 200,
    });
    expect(exchange.ok).toBe(true);
    const beforeSubscription = world.player.currencyBalances?.personal.GBP ?? 0;
    expect(beforeSubscription).toBeGreaterThan(0);
    const subscription = executeAction(world, "player", "subscribeIndexFund", {
      fundSlug: ukFund.slug, units: 1,
    });
    expect(subscription.ok).toBe(true);
    expect(world.indexFundBook!.positions).toContainEqual(expect.objectContaining({
      fundSlug: "uk_top_25", holderKind: "player", holderId: "player", units: 1,
    }));

    const seedCash = ukFund.cashAnchor;
    indexFundTurnPhase.run(world, rngFromSeed("fund-catalog-turn"));
    expect(ukFund.targetConstituents.length).toBeGreaterThan(0);
    expect(ukFund.targetConstituents.every((row) => world.corporations[row.corporationId]?.countryId === "UK")).toBe(true);
    expect(Object.keys(ukFund.holdings).length).toBeGreaterThan(0);
    for (const [corpId, holding] of Object.entries(ukFund.holdings)) {
      const corporation = world.corporations[corpId]!;
      expect(corporation.shareholders).toContainEqual(expect.objectContaining({ holder: "fund", fundSlug: ukFund.slug, shares: holding.shares }));
      expect(corporation.shareholders.reduce((sum, row) => sum + row.shares, 0) + corporation.publicFloat).toBe(corporation.totalShares);
    }
    expect(ukFund.cashAnchor).toBeLessThan(seedCash);
    expect(world.indexFundBook!.transactions.some((row) => row.fundSlug === "uk_top_25" && row.kind === "floatPurchase")).toBe(true);
    const sectorFund = world.indexFundBook!.funds.global_sector_manufacturing!;
    expect(sectorFund.targetConstituents.length).toBeGreaterThan(0);
    expect(sectorFund.targetConstituents.every((row) => {
      const corporation = world.corporations[row.corporationId];
      return corporation?.sectorType === "manufacturing" || corporation?.secondarySectorType === "manufacturing";
    })).toBe(true);
    expect(Object.keys(sectorFund.holdings).length).toBeGreaterThan(0);
    expect(world.indexFundBook!.funds.global_top_50!.targetConstituents.some((row) => world.corporations[row.corporationId]?.countryId !== "US")).toBe(true);

    const restored = deserializeSave(serializeSave(world, "2026-10-03T15:00:00.000Z"));
    expect(restored.indexFundBook!.funds.uk_top_25).toEqual(ukFund);
    expect(restored.indexFundBook!.positions).toEqual(world.indexFundBook!.positions);
  });
});
