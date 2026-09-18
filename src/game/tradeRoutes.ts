/**
 * Read-only recorded trade-route summary for the Markets destination (#77 slice).
 *
 * Every field is a verbatim copy of recorded engine state — nothing is quoted,
 * converted, or settled here:
 * - `tradeGrowth` reads `world.budgets[countryId].economicFactors.tradeGrowth`
 *   (the per-turn value the tradeGrowthPhase writes; null when no budget or no
 *   finite factor is recorded).
 * - `fx` reads the `world.exchangeRates[countryId]` row (rate/baseRate in local
 *   per 1 anchor, regime, updated turn). A missing row reads unavailable; the
 *   projection never substitutes another country's rate and never converts.
 * - Per-listing order flow (`MarketOrderFlow` in markets.ts) reads the
 *   corporation's recorded `orderFlowWindowBuyValue`/`orderFlowWindowSellValue`
 *   notionals plus the `orderFlowMultiplier`/`sentimentMultiplier` the market
 *   phase applies, and `insolventSinceTurn` for the default-lifecycle edge.
 *
 * Deliberately absent (engine records no such state, so there is nothing
 * honest to project): bid/ask books, dealer spreads, FX quotes/settlement,
 * bilateral route restrictions, corporate issuance actions, and
 * default/restructuring transitions.
 */
import type { WorldState } from "@ahdclient/engine";

export interface TradeFxState {
  /** False when the engine records no exchange-rate row for the country. */
  available: boolean;
  /** Recorded live rate in local currency per 1 anchor; null when unavailable. */
  rate: number | null;
  /** Recorded peg calibration in local per 1 anchor; null when unavailable. */
  baseRate: number | null;
  /** Recorded regime; null when unavailable. */
  regime: "pegged" | "floating" | null;
  /** Turn the rate was last updated; null when unavailable. */
  updatedTurn: number | null;
}

export interface TradeRouteSummary {
  countryId: string;
  countryName: string;
  currency: string;
  listingCount: number;
  /** Recorded annual trade-growth percent; null when no budget/factor is recorded. */
  tradeGrowth: number | null;
  fx: TradeFxState;
}

const UNAVAILABLE_FX: TradeFxState = {
  available: false,
  rate: null,
  baseRate: null,
  regime: null,
  updatedTurn: null,
};

function routeCurrency(world: WorldState, countryId: string): string {
  return world.budgets[countryId]?.currencyCode ?? world.exchangeRates[countryId]?.currencyCode ?? "XXX";
}

function routeFx(world: WorldState, countryId: string): TradeFxState {
  const row = world.exchangeRates[countryId];
  if (!row || !Number.isFinite(row.rate) || row.rate <= 0) return { ...UNAVAILABLE_FX };
  return {
    available: true,
    rate: row.rate,
    baseRate: Number.isFinite(row.baseRate) && row.baseRate > 0 ? row.baseRate : null,
    regime: row.regime === "pegged" || row.regime === "floating" ? row.regime : null,
    updatedTurn: Number.isSafeInteger(row.updatedTurn) ? row.updatedTurn : null,
  };
}

function routeTradeGrowth(world: WorldState, countryId: string): number | null {
  const growth = world.budgets[countryId]?.economicFactors.tradeGrowth;
  return typeof growth === "number" && Number.isFinite(growth) ? growth : null;
}

/**
 * One summary row per country that holds at least one listed corporation.
 * Sorted home-country first, then by country id — the same order the market
 * country list uses, so the two can never disagree on ranking.
 */
export function projectTradeRoutes(world: WorldState): TradeRouteSummary[] {
  const counts = new Map<string, number>();
  for (const corp of Object.values(world.corporations)) {
    counts.set(corp.countryId, (counts.get(corp.countryId) ?? 0) + 1);
  }
  const routes: TradeRouteSummary[] = [...counts.entries()].map(([countryId, listingCount]) => ({
    countryId,
    countryName: world.countries[countryId]?.name ?? countryId,
    currency: routeCurrency(world, countryId),
    listingCount,
    tradeGrowth: routeTradeGrowth(world, countryId),
    fx: routeFx(world, countryId),
  }));
  const home = world.player.countryId;
  routes.sort((a, b) => Number(b.countryId === home) - Number(a.countryId === home) || a.countryId.localeCompare(b.countryId));
  return routes;
}
