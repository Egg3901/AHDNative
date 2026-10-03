import { describe, expect, it } from "vitest";
import { sourceCampaignCells1953, sourceCampaignUnits1953 } from "./sourceCampaignElectorate.js";
import { targetedAdBonuses, type TargetedAd } from "./targetedAds.js";

describe("current source 1953 US campaign electorate", () => {
  it("derives PA's joint cells from raw source marginals and coalesces counted units", () => {
    const cells = sourceCampaignCells1953("PA")!;
    const units = sourceCampaignUnits1953("PA")!;
    expect(cells).toHaveLength(40);
    expect(cells[0]).toMatchObject({
      id: "white|mid|no_college|middle",
      stateId: "PA",
      buckets: { race: "white", age: "mid", education: "no_college", wealth: "middle" },
      share: 0.1268940434910296,
      economicLean: 0.1,
      socialLean: -0.4,
      turnout: 58.3,
      identities: {
        race: { economicLean: 0.8, socialLean: -1.2 },
        age: { economicLean: 0.5, socialLean: 0.3 },
        education: { economicLean: -2.4, socialLean: 0.1 },
        wealth: { economicLean: 1.5, socialLean: -0.7 },
      },
    });
    expect(units).toHaveLength(28);
    expect(units[0]).toMatchObject({
      id: "gcell_0",
      share: 0.25698680936272017,
      economicLean: 0.14813294558468204,
      socialLean: -0.35186705441531807,
      turnout: 59.55186705441532,
    });
    const ad: TargetedAd = { stateId: "PA", dimension: "race", bucket: "white", bonus: 0.01, lastPurchaseTurn: 10 };
    const cellBonuses = targetedAdBonuses(cells, { economicLean: -2, socialLean: -1 }, [ad], "PA", 10);
    const firstUnit = units[0]!;
    const unitWeight = firstUnit.campaignCells.reduce((sum, cell) => sum + cell.share * cell.turnout, 0);
    const unitBonus = firstUnit.campaignCells.reduce((sum, cell) => sum + cell.share * cell.turnout * (cellBonuses[cell.id] ?? 0), 0) / unitWeight;
    // Captured independently from AHDGame's buildGranularElectorateSubstrate
    // and campaignTargeting/rules.ts at the source head documented above.
    expect(unitBonus).toBeCloseTo(0.006312350447829809, 12);
    expect(sourceCampaignCells1953("AK")).not.toBeNull();
    expect(sourceCampaignCells1953("not-a-source-region")).toBeNull();
  });
});
