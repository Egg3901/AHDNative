import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_STRENGTH_MAX_BATCH_CLICKS,
  CAMPAIGN_STRENGTH_POINTS_PER_ACTION,
  CAMPAIGN_STRENGTH_PRICE_PER_POINT,
  CAMPAIGN_STRENGTH_TAU,
  calculateCampaignStrengthLeaderPullbacks,
  campaignStrengthBatchQuote,
  campaignStrengthBoostPercent,
  campaignStrengthContributionActions,
  campaignStrengthContributionCost,
  campaignStrengthVoteMultiplier,
  maxAffordableCampaignStrengthClicks,
} from "./campaignStrength.js";

/**
 * #68: hand-derived reference vectors for the campaign-strength port. Values
 * are computed from the AHDGame formulas by hand (TAU = 50_000,
 * PRICE_PER_POINT = 83) so the port is pinned digit-for-digit, not just
 * self-consistent.
 */

const TAU2 = CAMPAIGN_STRENGTH_TAU * CAMPAIGN_STRENGTH_TAU;
const THIRD = 3 * TAU2;

describe("campaignStrengthContributionCost", () => {
  it("charges nothing for a zero or negative contribution", () => {
    expect(campaignStrengthContributionCost(1000, 0)).toBe(0);
    expect(campaignStrengthContributionCost(1000, -50)).toBe(0);
  });

  it("matches the exact-integral hand vector from a standing start", () => {
    // end = 300; cubic = 300^3 / (3 * 50000^2) = 27_000_000 / 7_500_000_000 = 0.0036
    // cost = 83 * (300 + 0.0036) = 24900.2988
    expect(campaignStrengthContributionCost(0, 300)).toBeCloseTo(24900.2988, 6);
  });

  it("matches the exact-integral hand vector mid-saturation", () => {
    // current = 50_000, end = 50_300:
    // cubic = (50_300^3 - 50_000^3) / 7_500_000_000 = 2_263_527_000_000 / 7_500_000_000 = 301.8036
    // cost = 83 * (300 + 301.8036) = 49949.6988
    expect(campaignStrengthContributionCost(50_000, 300)).toBeCloseTo(49949.6988, 6);
  });

  it("is the exact integral of the quadratic marginal price", () => {
    const added = 3000;
    const current = 50_000;
    const end = current + added;
    const expected =
      CAMPAIGN_STRENGTH_PRICE_PER_POINT * (added + (end ** 3 - current ** 3) / THIRD);
    expect(campaignStrengthContributionCost(current, added)).toBeCloseTo(expected, 6);
  });

  it("treats null / undefined current strength as zero", () => {
    expect(campaignStrengthContributionCost(null, 1000)).toBeCloseTo(
      campaignStrengthContributionCost(0, 1000),
      6,
    );
    expect(campaignStrengthContributionCost(undefined, 1000)).toBeCloseTo(
      campaignStrengthContributionCost(0, 1000),
      6,
    );
  });
});

describe("campaignStrengthContributionActions", () => {
  it("charges nothing for a zero or negative contribution", () => {
    expect(campaignStrengthContributionActions(0)).toBe(0);
    expect(campaignStrengthContributionActions(-10)).toBe(0);
  });

  it("charges at least one action for any positive contribution", () => {
    expect(campaignStrengthContributionActions(1)).toBe(1);
    expect(campaignStrengthContributionActions(75)).toBe(1);
  });

  it("ceil-scales with the strength bought by hand vector", () => {
    expect(campaignStrengthContributionActions(CAMPAIGN_STRENGTH_POINTS_PER_ACTION)).toBe(1);
    expect(campaignStrengthContributionActions(CAMPAIGN_STRENGTH_POINTS_PER_ACTION + 1)).toBe(2);
    expect(campaignStrengthContributionActions(3000)).toBe(10);
    expect(campaignStrengthContributionActions(30_000)).toBe(100);
  });
});

describe("campaignStrengthVoteMultiplier", () => {
  it("returns EXACTLY 1 at zero strength (the no-op invariant)", () => {
    expect(campaignStrengthVoteMultiplier(0)).toBe(1);
    expect(campaignStrengthVoteMultiplier(null)).toBe(1);
    expect(campaignStrengthVoteMultiplier(undefined)).toBe(1);
    expect(campaignStrengthVoteMultiplier(-12345)).toBe(1);
  });

  it("follows 1 + MAX_BONUS * (1 - exp(-CS/TAU)) by hand vector", () => {
    // At CS = TAU: 2 - e^-1 = 1.6321205588...
    expect(campaignStrengthVoteMultiplier(CAMPAIGN_STRENGTH_TAU)).toBeCloseTo(1.6321205588285577, 10);
  });

  it("honours a supplied asymptotic bonus cap", () => {
    // 1 + 0.5 * (1 - e^-1) = 1.3160602794142789
    expect(campaignStrengthVoteMultiplier(CAMPAIGN_STRENGTH_TAU, 0.5)).toBeCloseTo(
      1.3160602794142789,
      10,
    );
  });

  it("asymptotes to 1 + MAX_BONUS (never exceeds it)", () => {
    const huge = campaignStrengthVoteMultiplier(5_000_000);
    expect(huge).toBeGreaterThan(1.9999);
    expect(huge).toBeLessThanOrEqual(2);
  });

  it("is monotonically increasing in strength", () => {
    expect(campaignStrengthVoteMultiplier(1000)).toBeGreaterThan(campaignStrengthVoteMultiplier(100));
    expect(campaignStrengthVoteMultiplier(50_000)).toBeGreaterThan(
      campaignStrengthVoteMultiplier(1000),
    );
  });
});

describe("campaignStrengthBoostPercent", () => {
  it("is 0 at zero strength", () => {
    expect(campaignStrengthBoostPercent(0)).toBe(0);
    expect(campaignStrengthBoostPercent(undefined)).toBe(0);
  });

  it("is (multiplier - 1) * 100 by hand vector", () => {
    // (2 - e^-1 - 1) * 100 = 63.21205588285577
    expect(campaignStrengthBoostPercent(CAMPAIGN_STRENGTH_TAU)).toBeCloseTo(63.21205588285577, 8);
  });
});

describe("campaignStrengthBatchQuote / maxAffordableCampaignStrengthClicks", () => {
  it("prices a batch as the exact run of single clicks", () => {
    const quote = campaignStrengthBatchQuote(0, 300, 3);
    expect(quote.clicks).toBe(3);
    expect(quote.strengthAdded).toBe(900);
    // cost(0, 900) = 83 * (900 + 900^3 / 7.5e9) = 83 * 900.0972 = 74708.0676
    expect(quote.costFunds).toBeCloseTo(74708.0676, 6);
    expect(quote.costActions).toBe(3);
  });

  it("finds the largest affordable click count for both gates", () => {
    const perClick = 75;
    const max = maxAffordableCampaignStrengthClicks({
      currentStrength: 0,
      strengthPerClick: perClick,
      availableFunds: 1_000_000,
      availableActions: 40,
    });
    const at = campaignStrengthBatchQuote(0, perClick, max);
    const over = campaignStrengthBatchQuote(0, perClick, max + 1);
    expect(at.costFunds).toBeLessThanOrEqual(1_000_000);
    expect(at.costActions).toBeLessThanOrEqual(40);
    expect(over.costFunds > 1_000_000 || over.costActions > 40).toBe(true);
  });

  it("never exceeds the hard batch ceiling", () => {
    expect(
      maxAffordableCampaignStrengthClicks({
        currentStrength: 0,
        strengthPerClick: 75,
        availableFunds: Number.MAX_SAFE_INTEGER,
        availableActions: Number.MAX_SAFE_INTEGER,
      }),
    ).toBe(CAMPAIGN_STRENGTH_MAX_BATCH_CLICKS);
  });
});

describe("calculateCampaignStrengthLeaderPullbacks", () => {
  it("pullbacks the leader toward the election average", () => {
    const pb = calculateCampaignStrengthLeaderPullbacks([
      { id: "a", electionId: "e1", campaignStrength: 200 },
      { id: "b", electionId: "e1", campaignStrength: 0 },
    ]);
    // total 200, avg 100, aboveAverage 100 -> min(175, 100) = 100
    expect(pb.get("a")).toBe(100);
    expect(pb.size).toBe(1);
  });

  it("caps the pullback and skips ties / single-campaign elections", () => {
    const capped = calculateCampaignStrengthLeaderPullbacks([
      { id: "a", electionId: "e1", campaignStrength: 400 },
      { id: "b", electionId: "e1", campaignStrength: 0 },
    ]);
    expect(capped.get("a")).toBe(175); // min(175, 200)

    const tied = calculateCampaignStrengthLeaderPullbacks([
      { id: "a", electionId: "e1", campaignStrength: 100 },
      { id: "b", electionId: "e1", campaignStrength: 100 },
    ]);
    expect(tied.size).toBe(0);

    const alone = calculateCampaignStrengthLeaderPullbacks([
      { id: "a", electionId: "e1", campaignStrength: 500 },
    ]);
    expect(alone.size).toBe(0);
  });

  it("ignores archived campaigns", () => {
    const pb = calculateCampaignStrengthLeaderPullbacks([
      { id: "a", electionId: "e1", campaignStrength: 400, status: "archived" },
      { id: "b", electionId: "e1", campaignStrength: 0, status: "active" },
    ]);
    expect(pb.size).toBe(0);
  });
});
