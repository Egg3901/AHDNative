import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { computeSovereignMarketDemand, sourceSovereignCreditRating, sovereignDemandForCountry } from "./sovereignAppetite.js";

describe("AHDGame sovereign demand source equations", () => {
  it("combines the exact macro, trust, yield and capped holder-demand terms", () => {
    const demand = computeSovereignMarketDemand({
      debtToGdp: 1.5,
      inflationRate: 0.08,
      trust: 0.25,
      sovereignCouponRate: 5,
      fxDepreciationRate10t: 0.1,
      turnsSinceLastDefault: null,
      entityHoldings: 200,
      requiredIssuance: 1_000,
    });
    // Pinned Game marketDemand.ts: 1.2 - .27 - .06 - .15 - .1 + .05 + .1.
    expect(demand).toBeCloseTo(0.77, 12);
  });

  it("uses the source 100-turn default scar and the sovereign debt rating thresholds", () => {
    const demand = computeSovereignMarketDemand({
      debtToGdp: 2.4,
      inflationRate: 0.05,
      trust: 0.5,
      sovereignCouponRate: 4,
      fxDepreciationRate10t: 0,
      turnsSinceLastDefault: 0,
      entityHoldings: 0,
      requiredIssuance: 0,
    });
    // 1.2 - .54 - .16 - 1.0 = 0; max(0, sum) is source behavior.
    expect(demand).toBe(0);
    expect(sourceSovereignCreditRating(0.6)).toBe("AAA");
    expect(sourceSovereignCreditRating(0.8)).toBe("AA");
    expect(sourceSovereignCreditRating(1.01)).toBe("BBB");
    expect(sourceSovereignCreditRating(2.6)).toBe("CCC");
  });

  it("reads trust from seeded political-board integrity, not the separate regional policy cache", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "sovereign-trust-input", playerName: "Alex" });
    const boards = Object.values(world.regionalPoliticalMetrics ?? {}).filter((board) => board.countryId === "US");
    expect(boards.length).toBeGreaterThan(0);
    const seededTrust = boards.reduce((sum, board) => sum + (board.values["governance.integrity"] ?? 50), 0) / boards.length / 100;
    const before = sovereignDemandForCountry(world, "US")!;
    // Deliberately poison the policy cache. It is not the source PoliticalMetricsDoc values input.
    for (const region of Object.values(world.regions).filter((row) => row.countryId === "US")) {
      world.regionalMetrics[region.id] = { "governance.integrity": { value: 0 } };
      if (world.regionalPoliticalMetrics?.[region.id]) {
        world.regionalPoliticalMetrics[region.id]!.values["governance.integrity"] = 100;
      }
    }
    const after = sovereignDemandForCountry(world, "US")!;
    expect(after - before).toBeCloseTo((1 - seededTrust) * 0.4, 12);
  });
});
