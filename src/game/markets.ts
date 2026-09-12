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
  /**
   * Recorded shareholder blocks, mapped 1:1 from Corporation.shareholders.
   * The engine stores only a holder KIND plus a raw share count — there is no
   * per-owner id, name, or character/CEO reference in world state, so no owner
   * page can be linked. Nothing here is derived beyond copying recorded fields.
   */
  shareholders: MarketShareholder[];
  /** Recorded holder with the largest block, or null when none is recorded or the top is tied. */
  controllingHolder: ShareholderKind | null;
}

/**
 * Recorded holder kind. Mirrors the engine's Corporation ShareholderKind —
 * the only owner identity AHDClient actually stores ("npc" founder block, or
 * the single "player"). cross-corp / fund / state owner kinds are not ported,
 * so they are deliberately absent rather than invented.
 */
export type ShareholderKind = "npc" | "player";

/** One recorded shareholder block (holder kind + raw share count). */
export interface MarketShareholder {
  holder: ShareholderKind;
  shares: number;
  /** Recorded weighted-average cost per share; null for the founding NPC block (no purchase event). */
  avgCostPerShare: number | null;
}

/** One sector's recorded value in a single currency — never summed across currencies. */
export interface SectorValue {
  currency: string;
  companyCount: number;
  /** Σ recorded (sharePrice × totalShares) for this sector's companies in this currency. */
  marketValue: number;
}

/** Sector directory entry, grouped from the same listings projection the route uses. */
export interface SectorSummary {
  sectorType: string;
  sectorLabel: string;
  companyCount: number;
  /** Per-currency values, one entry per currency present in the sector. */
  values: SectorValue[];
  /** Listing ids in this sector, for opening the existing company detail from the directory. */
  companyIds: string[];
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
  /** Sector directory derived from the same listings projection (sorted by label). */
  sectors: SectorSummary[];
}

function homeCurrency(world: WorldState, countryId: string): string {
  return world.budgets[countryId]?.currencyCode ?? world.exchangeRates[countryId]?.currencyCode ?? "XXX";
}

function sectorLabel(sectorType: string): string {
  return sectorType.replaceAll("_", " ");
}

/**
 * Recorded holder with the largest number of shares, or null when no positive
 * block is recorded or the largest block is tied. Control is read straight
 * from the recorded share counts — no threshold or percentage is invented.
 */
function controllingHolder(
  shareholders: readonly { holder: ShareholderKind; shares: number }[],
): ShareholderKind | null {
  const positive = shareholders.filter((shareholder) => shareholder.shares > 0);
  if (positive.length === 0) return null;
  const largest = Math.max(...positive.map((shareholder) => shareholder.shares));
  const top = positive.filter((shareholder) => shareholder.shares === largest);
  return top.length === 1 ? top[0]!.holder : null;
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
      shareholders: corp.shareholders.map((shareholder) => ({
        holder: shareholder.holder,
        shares: shareholder.shares,
        avgCostPerShare: shareholder.avgCostPerShare ?? null,
      })),
      controllingHolder: controllingHolder(corp.shareholders),
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

  // Sector directory: grouped from the SAME listings projection above, so it
  // can never drift from what the company list/detail shows. Values are kept
  // per currency (each corp is priced in its own home currency) and never
  // summed across currencies — matching the no-FX rule the listings follow.
  const sectorMap = new Map<
    string,
    { sectorType: string; sectorLabel: string; companyIds: string[]; values: Map<string, SectorValue> }
  >();
  for (const listing of listings) {
    let sector = sectorMap.get(listing.sectorType);
    if (!sector) {
      sector = { sectorType: listing.sectorType, sectorLabel: listing.sectorLabel, companyIds: [], values: new Map() };
      sectorMap.set(listing.sectorType, sector);
    }
    sector.companyIds.push(listing.id);
    const marketValue = Math.round(listing.sharePrice * listing.totalShares * 100) / 100;
    const value = sector.values.get(listing.currency);
    if (value) {
      value.companyCount += 1;
      value.marketValue = Math.round((value.marketValue + marketValue) * 100) / 100;
    } else {
      sector.values.set(listing.currency, { currency: listing.currency, companyCount: 1, marketValue });
    }
  }
  const sectors: SectorSummary[] = [...sectorMap.values()]
    .map((sector) => ({
      sectorType: sector.sectorType,
      sectorLabel: sector.sectorLabel,
      companyCount: sector.companyIds.length,
      values: [...sector.values.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
      companyIds: sector.companyIds,
    }))
    .sort((a, b) => a.sectorLabel.localeCompare(b.sectorLabel) || a.sectorType.localeCompare(b.sectorType));

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
    sectors,
  };
}
