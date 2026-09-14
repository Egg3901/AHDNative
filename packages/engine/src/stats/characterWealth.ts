/**
 * Character starting wealth: ports AHDGame `src/lib/constants/characterWealth.ts`
 * at e364c04954ed628beef73a993a8e9e156650a31e.
 *
 * A wealth background grants a starting personal cash balance in internal anchor
 * units (₳, pegged 1:1 to USD in the US). The reference creation route credits
 * the same amount the UI previews, so the preview can never drift from the grant.
 *
 * Native note: the reference deflates the anchor by the era nominal scale and
 * then converts to the home currency at the frozen base rate. Native's engine
 * carries `getEraNominalScale` (commodity/constants.ts) and the same frozen
 * INITIAL_RATES table (campaigns/campaignCurrency.ts), so both legs are ported
 * here rather than invented.
 */

import { campaignLocalRate } from "../campaigns/campaignCurrency.js";
import { getEraNominalScale } from "../commodity/constants.js";

export type WealthLevel = "low" | "middle" | "high";

/**
 * Personal starting cash by wealth background, in internal anchor units (₳).
 * Source: WEALTH_BONUS. Low/middle/high = 1M/2.5M/5M.
 */
export const WEALTH_BONUS: Record<WealthLevel, number> = {
  low: 1_000_000,
  middle: 2_500_000,
  high: 5_000_000,
};

/** Display order + human label for each tier. Source: WEALTH_LEVELS. */
export const WEALTH_LEVELS: { value: WealthLevel; label: string }[] = [
  { value: "low", label: "Low Income" },
  { value: "middle", label: "Middle Income" },
  { value: "high", label: "High Income" },
];

/**
 * Starting cash for a wealth background, in the era's own money (still anchor).
 * Source: getWealthBonus (deflates by getEraNominalAmount, which is
 * getEraNominalScale applied to a nominal amount).
 */
export function getWealthBonus(level: WealthLevel, preset?: string): number {
  const base = WEALTH_BONUS[level] ?? 0;
  if (base <= 0) return 0;
  return Math.round(base * getEraNominalScale(preset));
}

/**
 * Convert an anchor-denominated starting amount to a country's home currency at
 * the frozen base rate. Source: convertStartingAnchorToLocal (campaignLocalRate).
 */
export function convertStartingAnchorToLocal(
  anchorAmount: number,
  countryId?: string | null,
): number {
  return Math.round(anchorAmount * campaignLocalRate((countryId ?? "US").toUpperCase()));
}

/**
 * The starting personal cash an era/country/wealth tier grants, in the player's
 * home currency. This is the single source of truth shared by the creation UI
 * preview and `createWorld`, so the preview cannot disagree with the grant.
 */
export function startingCashFor(
  level: WealthLevel | undefined,
  countryId: string,
  preset?: string,
): number | undefined {
  if (!level) return undefined;
  return convertStartingAnchorToLocal(getWealthBonus(level, preset), countryId);
}
