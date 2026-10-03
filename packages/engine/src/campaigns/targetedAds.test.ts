import { describe, expect, it } from "vitest";
import { adExposure, campaignPrimaryScore, meanAdBonus, targetedAdBonuses, type CampaignCell, type TargetedAd } from "./targetedAds.js";

describe("targeted ad source rules", () => {
  /** Oracle: AHDGame 0538f4264354eeb837dc1b0b47639e74591fca17, src/lib/campaignTargeting/rules.ts.
   * Source inputs: NY shares/turnout .35/60 progressive and .65/40 moderate;
   * one .12 progressive flight bought at turn 10, candidate (-1,.2), evaluated at turn 16.
   * Source targetedAdBonuses + meanAdBonus + campaignPrimaryScore return the exact values below.
   */
  it("matches the immutable Game 0538 regional primary fixture", () => {
    const cells: CampaignCell[] = [
      {
        id: "NY:progressive", stateId: "NY", economicLean: -2, socialLean: 0, share: 0.35, turnout: 60,
        buckets: { voterGroups: "progressive" }, identities: { voterGroups: { economicLean: -2, socialLean: 0 } },
      },
      {
        id: "NY:moderate", stateId: "NY", economicLean: 2, socialLean: 1, share: 0.65, turnout: 40,
        buckets: { voterGroups: "moderate" }, identities: { voterGroups: { economicLean: 2, socialLean: 1 } },
      },
    ];
    const ads: TargetedAd[] = [{ stateId: "NY", dimension: "voterGroups", bucket: "progressive", bonus: 0.12, lastPurchaseTurn: 10 }];
    const bonuses = targetedAdBonuses(cells, { economicLean: -1, socialLean: 0.2 }, ads, "NY", 16);
    expect(bonuses).toEqual({ "NY:progressive": 0.09636249097584279, "NY:moderate": 0 });
    const mean = meanAdBonus(cells, bonuses);
    expect(mean).toBe(0.04305558107431274);
    expect(campaignPrimaryScore(52.4, mean, 8)).toBe(52.73723571375536);
  });

  it("keeps source legacy prepaid-flight exposure semantics", () => {
    const flight: TargetedAd = {
      stateId: "NY", dimension: "voterGroups", bucket: "progressive", exposure: 0.002,
      lastPurchaseTurn: 10, throughTurn: 12,
    };
    expect(adExposure(flight, 16)).toBeCloseTo((0.002 + 2) * 5 * 0.01 * 2 ** (-6 / 24), 12);
  });
});
