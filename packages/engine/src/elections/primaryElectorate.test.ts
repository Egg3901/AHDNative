import { describe, expect, it } from "vitest";
import { applyPrimaryTurnoutRetention, computeTurnoutPoolFromRates, primaryTurnoutRetention } from "./primaryElectorate.js";

describe("source primary electorate math", () => {
  it("uses directional alignment, a 5% floor, and the source neutral-party guard", () => {
    const party = { economicPosition: -2, socialPosition: -2 };
    expect(primaryTurnoutRetention(-4, -4, party)).toBe(1);
    expect(primaryTurnoutRetention(-1, -1, party)).toBe(0.75);
    expect(primaryTurnoutRetention(2, 2, party)).toBe(0.05);
    expect(primaryTurnoutRetention(4, -3, { economicPosition: 0, socialPosition: 0 })).toBe(0.5);
  });

  it("applies retention to live turnout rates and recomputes the source-weighted pool", () => {
    // Independent source arithmetic: 50% of a 40%-pop group and 100% of a
    // 60%-pop group turn out; category weights partition
    // the same electorate and each source weight is divided by 100.
    const demographics = {
      _id: "IA",
      countryId: "US",
      categoryWeights: { voter: 70, age: 30 },
      groups: {
        urban: { population: 40, economicLean: 2, socialLean: 2, turnout: 50 },
        rural: { population: 60, economicLean: -2, socialLean: -2, turnout: 50 },
      },
      lastUpdated: "2026-01-01",
    };
    const categories = [
      { _id: "voter", name: "Voter", defaultWeight: 70, groups: [{ id: "urban", name: "Urban", defaultEconomicLean: 2, defaultSocialLean: 2 }, { id: "rural", name: "Rural", defaultEconomicLean: -2, defaultSocialLean: -2 }] },
      { _id: "age", name: "Age", defaultWeight: 30, groups: [{ id: "urban", name: "Urban", defaultEconomicLean: 2, defaultSocialLean: 2 }, { id: "rural", name: "Rural", defaultEconomicLean: -2, defaultSocialLean: -2 }] },
    ];
    const retained = applyPrimaryTurnoutRetention(
      { urban: 80, rural: 60 }, demographics,
      { economicPosition: -2, socialPosition: -2 },
    );
    expect(retained).toEqual({ urban: 4, rural: 60 });
    expect(computeTurnoutPoolFromRates(100_000, demographics, categories, { urban: 50, rural: 100 })).toBe(80_000);
    expect(computeTurnoutPoolFromRates(
      100_000,
      { ...demographics, categoryWeights: { voter: 35, age: 15 } },
      categories,
      { urban: 50, rural: 100 },
    )).toBe(40_000);
  });
});
