import type { MarketActionHint, MarketListing, MarketsView } from "./markets";

type TradeSide = "buy" | "sell";

export type TradeListing = Pick<
  MarketListing,
  "ticker" | "sharePrice" | "publicFloat" | "liquidCapital" | "playerShares" | "cashCurrencyMatches"
>;


export const CROSS_CURRENCY_UNAVAILABLE = "Trading between different currencies is not available yet.";

export function shareNotional(sharePrice: number, shares: number): number {
  return Math.round(shares * sharePrice * 100) / 100;
}

/** Digit-only positive integer in the safe integer range. Rejects decimals and scientific notation. */
export function parseShareCount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER) return null;
  return n;
}

export function evaluateShareTrade(
  side: TradeSide,
  listing: TradeListing,
  shares: number,
  view: Pick<MarketsView, "playerCash">,
  catalog: MarketActionHint,
): { available: boolean; disabledReason?: string; notional: number } {
  if (!Number.isSafeInteger(shares) || shares < 1) {
    return { available: false, disabledReason: "Enter a positive whole number of shares.", notional: 0 };
  }
  const notional = shareNotional(listing.sharePrice, shares);
  if (!Number.isFinite(notional)) {
    return { available: false, disabledReason: "Enter a positive whole number of shares.", notional: 0 };
  }
  if (!catalog.available) {
    return { available: false, disabledReason: catalog.disabledReason, notional };
  }
  if (!listing.cashCurrencyMatches) {
    return { available: false, disabledReason: CROSS_CURRENCY_UNAVAILABLE, notional };
  }
  if (side === "buy") {
    if (listing.publicFloat < shares) {
      return {
        available: false,
        disabledReason: `Only ${listing.publicFloat} shares available in ${listing.ticker}'s public float`,
        notional,
      };
    }
    if (view.playerCash < notional) {
      return {
        available: false,
        disabledReason: `Not enough cash. Required: ${notional}, Available: ${view.playerCash}`,
        notional,
      };
    }
    return { available: true, notional };
  }
  if (listing.playerShares < shares) {
    return {
      available: false,
      disabledReason: `You only own ${listing.playerShares} shares of ${listing.ticker}`,
      notional,
    };
  }
  if (listing.liquidCapital < notional) {
    return {
      available: false,
      disabledReason: `${listing.ticker}'s treasury can't cover this sale (needs ${notional})`,
      notional,
    };
  }
  return { available: true, notional };
}

