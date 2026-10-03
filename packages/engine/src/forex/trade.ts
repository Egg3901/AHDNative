import type { WorldState } from "../types.js";
import { isCommandEconomy, scheduledMarketizationLevel } from "../commandEconomy/constants.js";
import { getCountryIdForCurrency } from "../finance/savingsInterest.js";
import {
  FOREX_LIQUIDITY_FEE_MAX,
  FOREX_LIQUIDITY_FEE_MIN,
  FOREX_LIQUIDITY_REFERENCE_VOLUME,
  FOREX_MAX_TRADE_FEE,
  FOREX_SIZE_FEE_HALF_ANCHOR,
  FOREX_SIZE_FEE_MAX,
  MARKET_MAKER_SPREAD,
  ORGANIC_FULL_BREADTH_TRADERS,
  ORGANIC_VOLUME_DIRECTION_WEIGHT,
  ORGANIC_VOLUME_HALF_PRESSURE_ANCHOR,
  SPREAD_FEE_FOREX_REVENUE_RATIO,
  SPREAD_FEE_RESERVE_RATIO,
  VOLUME_DIRECTION_WEIGHT,
  VOLUME_LOOKBACK_TURNS,
  VOLUME_PRESSURE_CAP,
  VOLUME_PRESSURE_SENSITIVITY,
} from "./constants.js";
import type { ForexTradeRecord } from "./types.js";

export interface ForexTradeQuote {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  crossRate: number;
  anchorAmount: number;
  feeRate: number;
  spreadFee: number;
}

export type ForexTradeQuoteResult =
  | { ok: true; quote: ForexTradeQuote }
  | { ok: false; error: string };

export interface CurrencyVolume {
  buyVolume24: number;
  sellVolume24: number;
  effectiveTraders?: number;
}

const volumeLookbackStart = (turn: number): number => Math.max(1, turn - VOLUME_LOOKBACK_TURNS);

export function sizeFeeRate(tradeAnchor: number, priorAnchor = 0): number {
  if (!(tradeAnchor > 0) || !Number.isFinite(tradeAnchor)) return 0;
  const prior = Number.isFinite(priorAnchor) && priorAnchor > 0 ? priorAnchor : 0;
  const half = FOREX_SIZE_FEE_HALF_ANCHOR;
  const integral = tradeAnchor - half * Math.log1p(tradeAnchor / (prior + half));
  return FOREX_SIZE_FEE_MAX * (Math.max(0, integral) / tradeAnchor);
}

export function liquidityFeeMultiplier(recentVolumeAnchor: number | null | undefined): number {
  if (recentVolumeAnchor == null || !Number.isFinite(recentVolumeAnchor)) return 1;
  const ratio = FOREX_LIQUIDITY_REFERENCE_VOLUME / Math.max(recentVolumeAnchor, 1);
  return Math.min(FOREX_LIQUIDITY_FEE_MAX, Math.max(FOREX_LIQUIDITY_FEE_MIN, Math.sqrt(ratio)));
}

export function effectiveTraderCount(traderNets: Iterable<number>): number | undefined {
  const nets = [...traderNets].filter((net) => Number.isFinite(net) && net !== 0);
  const total = nets.reduce((sum, net) => sum + net, 0);
  if (total === 0) return undefined;
  const aligned = nets.filter((net) => Math.sign(net) === Math.sign(total)).map(Math.abs);
  const alignedTotal = aligned.reduce((sum, net) => sum + net, 0);
  const squares = aligned.reduce((sum, net) => sum + net * net, 0);
  return squares > 0 ? (alignedTotal * alignedTotal) / squares : undefined;
}

function rateForCurrency(world: WorldState, currency: string) {
  const countryId = getCountryIdForCurrency(currency);
  const row = world.exchangeRates[countryId];
  return row?.currencyCode === currency ? row : undefined;
}

function anchorAmountOf(world: WorldState, trade: ForexTradeRecord): number {
  if (Number.isFinite(trade.anchorAmount) && trade.anchorAmount > 0) return trade.anchorAmount;
  const rate = rateForCurrency(world, trade.fromCurrency)?.rate ?? 1;
  return rate > 0 ? trade.amount / rate : trade.amount;
}

export function currencyVolumesForLookback(world: WorldState, turn = world.meta.turn): Record<string, CurrencyVolume> {
  const start = volumeLookbackStart(turn);
  const rates = new Map(Object.values(world.exchangeRates).map((row) => [row.currencyCode, row.rate]));
  const byCurrency = new Map<string, Map<string, number>>();
  const volumes: Record<string, CurrencyVolume> = {};
  for (const row of Object.values(world.exchangeRates)) {
    volumes[row.currencyCode] ??= { buyVolume24: 0, sellVolume24: 0 };
  }
  for (const trade of world.forexTradeHistory ?? []) {
    if (trade.turn < start || trade.fromCurrency === trade.toCurrency) continue;
    const fromRate = rates.get(trade.fromCurrency) ?? 1;
    const internal = fromRate > 0 ? trade.amount / fromRate : trade.amount;
    const from = volumes[trade.fromCurrency];
    const to = volumes[trade.toCurrency];
    if (from) from.sellVolume24 += internal;
    if (to) to.buyVolume24 += internal;
    for (const [currency, delta] of [[trade.fromCurrency, -internal], [trade.toCurrency, internal]] as const) {
      const traderNets = byCurrency.get(currency) ?? new Map<string, number>();
      traderNets.set(trade.traderId, (traderNets.get(trade.traderId) ?? 0) + delta);
      byCurrency.set(currency, traderNets);
    }
  }
  for (const [currency, traderNets] of byCurrency) {
    const breadth = effectiveTraderCount(traderNets.values());
    if (breadth !== undefined && volumes[currency]) volumes[currency]!.effectiveTraders = breadth;
  }
  return volumes;
}

export function computeVolumePressure(input: CurrencyVolume & { syntheticNet?: number }): number {
  const net = input.buyVolume24 - input.sellVolume24;
  const rawBreadth = input.effectiveTraders;
  const floor = 1 / ORGANIC_FULL_BREADTH_TRADERS;
  const breadth = rawBreadth == null || !Number.isFinite(rawBreadth)
    ? 1
    : Math.min(1, Math.max(floor, rawBreadth / ORGANIC_FULL_BREADTH_TRADERS));
  const organic = Number.isFinite(net) && net !== 0
    ? VOLUME_PRESSURE_CAP * (net / (Math.abs(net) + ORGANIC_VOLUME_HALF_PRESSURE_ANCHOR)) * breadth
    : 0;
  const synthetic = input.syntheticNet != null && Number.isFinite(input.syntheticNet)
    ? Math.max(-VOLUME_PRESSURE_CAP, Math.min(VOLUME_PRESSURE_CAP, input.syntheticNet * VOLUME_PRESSURE_SENSITIVITY))
    : 0;
  const combined = organic * ORGANIC_VOLUME_DIRECTION_WEIGHT + synthetic * VOLUME_DIRECTION_WEIGHT;
  return Math.max(-VOLUME_PRESSURE_CAP * VOLUME_DIRECTION_WEIGHT, Math.min(VOLUME_PRESSURE_CAP * VOLUME_DIRECTION_WEIGHT, combined));
}

function priorTraderAnchor(world: WorldState, turn: number): number {
  const start = volumeLookbackStart(turn);
  return (world.forexTradeHistory ?? [])
    .filter((trade) => trade.traderId === "player" && trade.turn >= start)
    .reduce((sum, trade) => sum + anchorAmountOf(world, trade), 0);
}

function recentVolume(world: WorldState, currency: string): number | null {
  const row = rateForCurrency(world, currency);
  if (!row || (row.buyVolume24 === undefined && row.sellVolume24 === undefined)) return null;
  const buy = Number.isFinite(row.buyVolume24) ? row.buyVolume24! : 0;
  const sell = Number.isFinite(row.sellVolume24) ? row.sellVolume24! : 0;
  return buy + sell;
}

function playerBalance(world: WorldState, currency: string, homeCurrency: string): number {
  if (currency === homeCurrency) return world.player.cash;
  return world.player.currencyBalances?.personal?.[currency] ?? 0;
}

export function quoteForexTrade(world: WorldState, fromCurrency: string, toCurrency: string, requested: number): ForexTradeQuoteResult {
  if (world.featureFlags?.foreignExchange === false) return { ok: false, error: "Currency exchange is not enabled" };
  if (fromCurrency === toCurrency) return { ok: false, error: "Cannot trade a currency for itself" };
  if (!fromCurrency || !toCurrency) return { ok: false, error: "Invalid currency code" };
  const fromCountryId = getCountryIdForCurrency(fromCurrency);
  const toCountryId = getCountryIdForCurrency(toCurrency);
  const fromRow = rateForCurrency(world, fromCurrency);
  const toRow = rateForCurrency(world, toCurrency);
  if (!fromRow || !toRow || !fromCountryId || !toCountryId) return { ok: false, error: "Invalid currency code" };
  const year = Number(world.meta.date.slice(0, 4));
  for (const countryId of [fromCountryId, toCountryId]) {
    const level = world.commandEconomy[countryId]?.marketizationLevel ?? scheduledMarketizationLevel(countryId, year);
    if (isCommandEconomy(level)) {
      return { ok: false, error: `${countryId} currency is non-convertible under the current command economy` };
    }
  }
  if (!Number.isFinite(fromRow.rate) || fromRow.rate <= 0 || !Number.isFinite(toRow.rate) || toRow.rate <= 0) {
    return { ok: false, error: "Exchange rate is invalid for one or both currencies" };
  }
  const homeCurrency = world.exchangeRates[world.player.countryId]?.currencyCode;
  if (!homeCurrency) return { ok: false, error: "Player currency is unavailable" };
  const available = playerBalance(world, fromCurrency, homeCurrency);
  const tolerance = fromCurrency === "JPY" ? 1 : 0.02;
  if (!Number.isFinite(requested) || requested <= 0) return { ok: false, error: "Invalid amount" };
  if (!Number.isFinite(available) || available < 0 || requested > available + tolerance) {
    return { ok: false, error: `Insufficient ${fromCurrency} balance` };
  }
  const fromAmount = Math.min(requested, available);
  const anchorAmount = fromAmount / fromRow.rate;
  if (!Number.isFinite(anchorAmount) || anchorAmount <= 0) return { ok: false, error: "Invalid amount" };
  const baseSpread = MARKET_MAKER_SPREAD;
  const size = sizeFeeRate(anchorAmount, priorTraderAnchor(world, world.meta.turn));
  const liquidity = Math.max(liquidityFeeMultiplier(recentVolume(world, fromCurrency)), liquidityFeeMultiplier(recentVolume(world, toCurrency)));
  const feeRate = Math.min(FOREX_MAX_TRADE_FEE, (baseSpread + size) * liquidity);
  const spreadFee = Math.round(fromAmount * feeRate);
  const crossRate = toRow.rate / fromRow.rate;
  const toAmount = Math.round((fromAmount - spreadFee) * crossRate);
  if (!Number.isFinite(crossRate) || crossRate <= 0 || !Number.isFinite(toAmount)) {
    return { ok: false, error: "Exchange rate is invalid for one or both currencies" };
  }
  return { ok: true, quote: { fromCurrency, toCurrency, fromAmount, toAmount, crossRate, anchorAmount, feeRate, spreadFee } };
}

/** Apply the public trade only after all current quote and balance checks pass. */
export function executeForexTrade(world: WorldState, fromCurrency: string, toCurrency: string, amount: number): ForexTradeQuoteResult {
  const quoted = quoteForexTrade(world, fromCurrency, toCurrency, amount);
  if (!quoted.ok) return quoted;
  const quote = quoted.quote;
  const homeCurrency = world.exchangeRates[world.player.countryId]!.currencyCode;
  const fromCountryId = getCountryIdForCurrency(fromCurrency);
  const toCountryId = getCountryIdForCurrency(toCurrency);
  if (!fromCountryId || !toCountryId) return { ok: false, error: "Invalid currency code" };
  const sourceBalance = playerBalance(world, fromCurrency, homeCurrency);
  if (sourceBalance + (fromCurrency === "JPY" ? 1 : 0.02) < quote.fromAmount) {
    return { ok: false, error: `Insufficient ${fromCurrency} balance` };
  }

  // Commit the two wallet legs, fee destinations, and history record as one
  // in-memory transition. GameSession runs this on a clone and discards errors.
  if (fromCurrency === homeCurrency) world.player.cash -= quote.fromAmount;
  else {
    const personal = world.player.currencyBalances?.personal;
    if (!personal || (personal[fromCurrency] ?? 0) < quote.fromAmount) return { ok: false, error: `Insufficient ${fromCurrency} balance` };
    personal[fromCurrency] = (personal[fromCurrency] ?? 0) - quote.fromAmount;
  }
  if (toCurrency === homeCurrency) world.player.cash += quote.toAmount;
  else {
    const personal = ((world.player.currencyBalances ??= { personal: {} }).personal);
    personal[toCurrency] = (personal[toCurrency] ?? 0) + quote.toAmount;
  }
  if (quote.spreadFee > 0) {
    const fromBank = world.centralBanks[fromCountryId];
    const destinationBank = world.centralBanks[toCountryId];
    if (fromBank) fromBank.forexRevenue = (fromBank.forexRevenue ?? 0) + Math.round(quote.spreadFee * SPREAD_FEE_FOREX_REVENUE_RATIO);
    const reserveBank = destinationBank ?? fromBank;
    if (reserveBank) {
      reserveBank.spreadFeeReserveBalances ??= {};
      reserveBank.spreadFeeReserveBalances[fromCurrency] = (reserveBank.spreadFeeReserveBalances[fromCurrency] ?? 0) + Math.round(quote.spreadFee * SPREAD_FEE_RESERVE_RATIO);
    }
  }
  const history = (world.forexTradeHistory ??= []);
  history.push({
    id: `fx-${world.meta.turn}-${history.length + 1}`,
    turn: world.meta.turn,
    traderId: "player",
    fromCurrency,
    toCurrency,
    amount: quote.fromAmount,
    anchorAmount: quote.anchorAmount,
    spread: quote.spreadFee,
    source: "manual",
  });
  return quoted;
}
