/**
 * Action fund-cost source of truth (#242).
 *
 * AHDGame actions/rules.ts at 08820d1 splits fund cost across three dynamic
 * curves with home-state GDP, country/era baselines and action-specific stats:
 * campaign and advertise scale on action tier, buildDonorBase on donor level,
 * then Intellect divides the campaign curve and Fundraising divides the donor
 * curve. Advertise has no stat hook in the reference.
 *
 * `executeAction` charges this function and the session quote renders it, so a
 * displayed cost cannot drift from the debit. The default source price-level
 * feature flag is off, so these quotes retain priceLevel 1.
 */

import { NEUTRAL_STAT, statMultiplier } from "../stats/characterStats.js";
import { campaignAnchorToLocal } from "../campaigns/campaignCurrency.js";
import { ACTION_GDP_BASELINES } from "./gdpBaselines.generated.js";

export interface FundCostInput {
  actionId: string;
  /** Resolved action-point cost; equals the campaign/advertise tier. */
  actionCost: number;
  donorBaseLevel: number;
  /** Catalog flat fund cost, used for every action without a dynamic curve. */
  catalogFundCost: number;
  /** Actor stat block; a missing stat resolves at the neutral 1.0x multiplier. */
  stats?: { intellect?: number; fundraising?: number };
  /** Actor country, used for frozen campaign-currency conversion. */
  countryId?: string;
  /** Region GDP and population in the authored country's denomination. */
  gdpMillions?: number | undefined;
  population?: number | undefined;
  era?: string;
}

/** The reference-dynamic base curve for one action, before any stat hook. */
function baseFundCost(actionId: string, actionCost: number, donorBaseLevel: number, catalogFundCost: number, gdpScalar: number): number {
  if (actionId === "campaign") {
    // getCampaignFundCost: 20_000 x tier x (1 + (tier-1) * 0.2) x GDP scalar.
    const tier = actionCost;
    const mult = 1 + (tier - 1) * 0.2;
    return Math.round((20_000 * tier * mult * gdpScalar) / 1_000) * 1_000;
  }
  if (actionId === "advertise") {
    // getAdvertiseFundCost: 100_000 x (1 + tierIndex * 0.2) x GDP scalar.
    const tierIdx = actionCost - 5;
    const mult = 1 + tierIdx * 0.2;
    return Math.round((100_000 * mult * gdpScalar) / 1_000) * 1_000;
  }
  if (actionId === "buildDonorBase") {
    // getBuildDonorBaseFundCost: (3_000 + 1_500/level) x GDP scalar.
    return Math.round(((3_000 + donorBaseLevel * 1_500) * gdpScalar) / 1_000) * 1_000;
  }
  return catalogFundCost;
}

/**
 * The fund cost `executeAction` charges and every UI quote must render. Intellect
 * softens the campaign curve (never advertise), Fundraising softens
 * buildDonorBase, exactly as the reference effects divide their raw cost by the
 * stat multiplier.
 */
export function actionFundCost(input: FundCostInput): number {
  const baseline = ACTION_GDP_BASELINES[input.countryId ?? "US"]?.[input.era ?? "2019"];
  const gdpScalar = input.gdpMillions !== undefined && input.population !== undefined && input.population > 0 && baseline
    ? Math.max(0.85, Math.min(2, input.gdpMillions * 1_000_000 / input.population / baseline))
    : 1;
  let cost = baseFundCost(input.actionId, input.actionCost, input.donorBaseLevel, input.catalogFundCost, gdpScalar);
  if (input.actionId === "campaign" || input.actionId === "poll" || input.actionId === "pollLarge") {
    const intellect = input.stats?.intellect ?? NEUTRAL_STAT;
    cost = Math.round(cost / statMultiplier(intellect));
  } else if (input.actionId === "buildDonorBase") {
    const fundraising = input.stats?.fundraising ?? NEUTRAL_STAT;
    cost = Math.round(cost / statMultiplier(fundraising));
  }
  // Reference boundary (AHDGame src/lib/actions/commands/executeAction.ts):
  // All character campaign-fund costs convert from anchor at the frozen base
  // rate after the stat discount. The executor converts fundraiser yield too.
  if (["campaign", "advertise", "poll", "pollLarge", "buildDonorBase", "canvass"].includes(input.actionId)) {
    cost = campaignAnchorToLocal(cost, input.countryId ?? "US");
  }
  return cost;
}
