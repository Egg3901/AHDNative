/**
 * Detached stock-market query. projectMarkets(WorldState) returns a typed
 * DTO with no WorldState attached.
 *
 * Layout and fields follow the public AHDGame stock market list-to-detail
 * flow (src/app/country/[code]/stockmarket StockList search + corporation
 * share purchase) using only recorded engine corporation fields.
 *
 * Share notional matches packages/engine/src/actions/execute.ts
 * buyShares/sellShares: Math.round(shares * corp.sharePrice * 100) / 100
 * with no brokerage fee (market/constants.ts).
 */
import {
  ACTION_CATALOG,
  getActionCost,
  type WorldState,
} from "@ahdclient/engine";

const EARNINGS_HISTORY_BOUND = 52;

import { CROSS_CURRENCY_UNAVAILABLE, evaluateShareTrade, type TradeListing } from "./shareTrade";
export { CROSS_CURRENCY_UNAVAILABLE, shareNotional, parseShareCount, evaluateShareTrade } from "./shareTrade";

export interface MarketActionHint {
  id: "buyShares" | "sellShares";
  name: string;
  cost: number;
  available: boolean;
  disabledReason?: string;
}

export interface MarketPricePoint {
  turn: number;
  price: number;
}

export interface MarketCountry {
  id: string;
  name: string;
  currency: string;
  listingCount: number;
}

export interface MarketListing {
  id: string;
  ticker: string;
  name: string;
  countryId: string;
  countryName: string;
  sectorType: string;
  sectorLabel: string;
  currency: string;
  cashCurrencyMatches: boolean;
  sharePrice: number;
  fundamentalSharePrice: number;
  totalShares: number;
  publicFloat: number;
  liquidCapital: number;
  revenue: number;
  currentGrowthRate: number;
  profitMargin: number;
  effectiveProfitMargin: number;
  insolvent: boolean;
  foundedAtTurn: number;
  isBank: boolean;
  playerShares: number;
  playerAvgCostPerShare: number | null;
  npcShares: number;
  earningsHistory: number[];
  /** Per-turn live share-price series recorded by the engine. */
  priceHistory: MarketPricePoint[];
  buy: MarketActionHint;
  sell: MarketActionHint;
}

export interface MarketsView {
  playerCountryId: string;
  playerCash: number;
  playerCurrency: string;
  playerActions: number;
  turn: number;
  /** Feature flags skip turn phases only. executeAction does not read them. */
  marketsPhaseEnabled: boolean;
  economyPhaseEnabled: boolean;
  corporationsPhaseEnabled: boolean;
  countries: MarketCountry[];
  listings: MarketListing[];
}

function homeCurrency(world: WorldState, countryId: string): string {
  return world.budgets[countryId]?.currencyCode ?? world.exchangeRates[countryId]?.currencyCode ?? "XXX";
}

function sectorLabel(sectorType: string): string {
  return sectorType.replaceAll("_", " ");
}


function catalogHint(
  id: "buyShares" | "sellShares",
  world: WorldState,
): { cost: number; blocked?: string } {
  const entry = ACTION_CATALOG[id];
  if (entry.status === "unavailable") {
    return { cost: entry.baseCost, blocked: "Unavailable." };
  }
  const player = world.player;
  const cost = getActionCost(entry, player.donorBaseLevel, player.politicalInfluence, player.favorability);
  const remaining = (player.actionCooldowns[id] ?? 0) - world.meta.turn;
  if (remaining > 0) {
    return { cost, blocked: `Available in ${remaining} ${remaining === 1 ? "turn" : "turns"}.` };
  }
  if ((player.actions ?? 0) < cost) {
    return { cost, blocked: "Not enough action points." };
  }
  return { cost };
}

/**
 * Availability for a concrete share count. A unit-share hint with
 * available false blocks every positive integer size (action cost,
 * cooldown, or cannot cover even 1 share). cashCurrencyMatches false is
 * a panel-held missing-capability gate, not an FX conversion.
 * Feature flags are not a gate: executeAction does not read them here.
 */
function listingTrade(
  id: "buyShares" | "sellShares",
  world: WorldState,
  listing: TradeListing,
): MarketActionHint {
  const entry = ACTION_CATALOG[id];
  const blocked = catalogHint(id, world);
  const base: Omit<MarketActionHint, "available"> = {
    id,
    name: entry.name,
    cost: blocked.cost,
  };
  if (blocked.blocked) {
    return { ...base, available: false, disabledReason: blocked.blocked };
  }
  const unit = evaluateShareTrade(
    id === "buyShares" ? "buy" : "sell",
    listing,
    1,
    { playerCash: world.player.cash },
    { ...base, available: true },
  );
  if (unit.available) return { ...base, available: true };
  return { ...base, available: false, disabledReason: unit.disabledReason };
}

export function projectMarkets(world: WorldState): MarketsView {
  const player = world.player;
  const playerCurrency = homeCurrency(world, player.countryId);
  const listings: MarketListing[] = Object.values(world.corporations).map((corp) => {
    const country = world.countries[corp.countryId];
    const currency = homeCurrency(world, corp.countryId);
    const playerHolding = corp.shareholders.find((s) => s.holder === "player");
    const npcHolding = corp.shareholders.find((s) => s.holder === "npc");
    const playerShares = playerHolding && playerHolding.shares > 0 ? playerHolding.shares : 0;
    const npcShares = npcHolding && npcHolding.shares > 0 ? npcHolding.shares : 0;
    const ticker = corp.tickerSymbol;
    const trade: TradeListing = {
      ticker,
      sharePrice: corp.sharePrice,
      publicFloat: corp.publicFloat,
      liquidCapital: corp.liquidCapital,
      playerShares,
      cashCurrencyMatches: currency === playerCurrency,
    };
    const priceHistory: MarketPricePoint[] = (corp.priceHistory ?? []).map(({ turn, price }) => ({ turn, price }));
    return {
      id: corp.id,
      ticker,
      name: corp.id,
      countryId: corp.countryId,
      countryName: country?.name ?? corp.countryId,
      sectorType: corp.sectorType,
      sectorLabel: sectorLabel(corp.sectorType),
      currency,
      cashCurrencyMatches: trade.cashCurrencyMatches,
      sharePrice: corp.sharePrice,
      fundamentalSharePrice: corp.fundamentalSharePrice,
      totalShares: corp.totalShares,
      publicFloat: corp.publicFloat,
      liquidCapital: corp.liquidCapital,
      revenue: corp.revenue,
      currentGrowthRate: corp.currentGrowthRate,
      profitMargin: corp.profitMargin,
      effectiveProfitMargin: corp.effectiveProfitMargin,
      insolvent: corp.insolventSinceTurn != null,
      foundedAtTurn: corp.foundedAtTurn,
      isBank: corp.bankCharter != null,
      playerShares,
      playerAvgCostPerShare: playerShares > 0 ? (playerHolding?.avgCostPerShare ?? null) : null,
      npcShares,
      earningsHistory: corp.earningsHistory.slice(-EARNINGS_HISTORY_BOUND),
      priceHistory,
      buy: listingTrade("buyShares", world, trade),
      sell: listingTrade("sellShares", world, trade),
    };
  });

  listings.sort((a, b) => {
    const aHome = Number(a.countryId === player.countryId);
    const bHome = Number(b.countryId === player.countryId);
    return bHome - aHome || a.countryId.localeCompare(b.countryId) || a.ticker.localeCompare(b.ticker);
  });

  const countryMap = new Map<string, MarketCountry>();
  for (const listing of listings) {
    const existing = countryMap.get(listing.countryId);
    if (existing) existing.listingCount += 1;
    else {
      countryMap.set(listing.countryId, {
        id: listing.countryId,
        name: listing.countryName,
        currency: listing.currency,
        listingCount: 1,
      });
    }
  }
  const countries = [...countryMap.values()].sort((a, b) => {
    const aHome = Number(a.id === player.countryId);
    const bHome = Number(b.id === player.countryId);
    return bHome - aHome || a.id.localeCompare(b.id);
  });

  return {
    playerCountryId: player.countryId,
    playerCash: player.cash,
    playerCurrency,
    playerActions: player.actions,
    turn: world.meta.turn,
    marketsPhaseEnabled: world.featureFlags.markets,
    economyPhaseEnabled: world.featureFlags.economy,
    corporationsPhaseEnabled: world.featureFlags.corporations,
    countries,
    listings,
  };
}
