/**
 * Action fund-cost source of truth (#242).
 *
 * The reference splits fund cost across three dynamic curves, each with its own
 * stat hook (`src/lib/actions.ts` at e364c04954ed628beef73a993a8e9e156650a31e):
 * campaign and advertise scale on action tier, buildDonorBase on donor level,
 * then Intellect divides the campaign curve and Fundraising divides the donor
 * curve. Advertise has no stat hook in the reference.
 *
 * `executeAction` charges this function and the session quote renders it, so a
 * displayed cost cannot drift from the debit. The base tier curve mirrors the
 * reference at neutral GDP (getCampaignFundCost / getAdvertiseFundCost /
 * getBuildDonorBaseFundCost with gdpScalar 1.0), matching the existing engine
 * projection.
 */

import { NEUTRAL_STAT, statMultiplier } from "../stats/characterStats.js";
import { campaignAnchorToLocal } from "../campaigns/campaignCurrency.js";

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
}

/** The reference-dynamic base curve for one action, before any stat hook. */
function baseFundCost(actionId: string, actionCost: number, donorBaseLevel: number, catalogFundCost: number): number {
  if (actionId === "campaign") {
    // getCampaignFundCost: 20_000 x tier x (1 + (tier-1) * 0.2) at neutral GDP.
    const tier = actionCost;
    const mult = 1 + (tier - 1) * 0.2;
    return Math.round((20_000 * tier * mult) / 1_000) * 1_000;
  }
  if (actionId === "advertise") {
    // getAdvertiseFundCost: 100_000 x (1 + tierIndex * 0.2) at neutral GDP.
    const tierIdx = actionCost - 5;
    const mult = 1 + tierIdx * 0.2;
    return Math.round((100_000 * mult) / 1_000) * 1_000;
  }
  if (actionId === "buildDonorBase") {
    // getBuildDonorBaseFundCost: 3_000 + 1_500/level at neutral GDP.
    return Math.round((3_000 + donorBaseLevel * 1_500) / 1_000) * 1_000;
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
  let cost = baseFundCost(input.actionId, input.actionCost, input.donorBaseLevel, input.catalogFundCost);
  if (input.actionId === "campaign" || input.actionId === "poll" || input.actionId === "pollLarge") {
    const intellect = input.stats?.intellect ?? NEUTRAL_STAT;
    cost = Math.round(cost / statMultiplier(intellect));
  } else if (input.actionId === "buildDonorBase") {
    const fundraising = input.stats?.fundraising ?? NEUTRAL_STAT;
    cost = Math.round(cost / statMultiplier(fundraising));
  }
  if (input.actionId === "poll" || input.actionId === "pollLarge") {
    cost = campaignAnchorToLocal(cost, input.countryId ?? "US");
  }
  return cost;
}
