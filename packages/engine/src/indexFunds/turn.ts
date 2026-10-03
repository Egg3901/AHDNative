import type { TurnPhase } from "../phases/types.js";
import type { Corporation } from "../corporation/types.js";
import type { WorldState } from "../types.js";
import { settleQueuedIndexFundRedemptions } from "./book.js";

const MAX_EQUITY_ALLOCATION = 0.75;
const MAX_SINGLE_NAME_WEIGHT = 0.2;
const MIN_FREE_FLOAT_RATIO = 0.15;
const MIN_RELATIVE_SIZE = 0.05;
const INSOLVENCY_MATERIALITY_FRACTION = 0.01;

function executionPrice(corp: Corporation): number {
  const fundamental = corp.fundamentalSharePrice ?? 0;
  const thinFloat = corp.totalShares > 0 && corp.publicFloat / corp.totalShares < 0.05;
  if (thinFloat && fundamental > 0) return fundamental;
  if (fundamental > 0) return Math.min(fundamental * 5, Math.max(fundamental / 5, corp.sharePrice));
  return corp.sharePrice;
}

function cappedMarketWeights(caps: number[]): number[] {
  const total = caps.reduce((sum, cap) => sum + cap, 0);
  if (total <= 0) return caps.map(() => 0);
  const weights = caps.map((cap) => cap / total);
  let free = weights.map((_, index) => index);
  let remaining = 1;
  while (free.length > 0) {
    const freeTotal = free.reduce((sum, index) => sum + weights[index]!, 0);
    const capped = free.filter((index) => (weights[index]! / freeTotal) * remaining > MAX_SINGLE_NAME_WEIGHT);
    if (capped.length === 0) {
      for (const index of free) weights[index] = (weights[index]! / freeTotal) * remaining;
      break;
    }
    for (const index of capped) {
      weights[index] = MAX_SINGLE_NAME_WEIGHT;
      remaining -= MAX_SINGLE_NAME_WEIGHT;
    }
    free = free.filter((index) => !capped.includes(index));
  }
  return weights;
}

function rebalanceUsTop25(world: WorldState): void {
  const book = world.indexFundBook;
  const fund = book?.funds["us_top_25"];
  if (!book || !fund || fund.status !== "active") return;

  const candidates = Object.values(world.corporations).filter((corp) =>
    corp.countryId === "US" && corp.ownershipState !== "stateOwned" && !corp.countryOwnerId &&
    corp.isPrivate !== true && corp.totalShares > 0 && Number.isFinite(corp.sharePrice) && corp.sharePrice > 0,
  ).map((corp) => ({ corp, marketCap: corp.sharePrice * corp.totalShares }));
  const medianCaps = candidates.map((row) => row.marketCap).filter((cap) => cap > 0).sort((a, b) => a - b);
  const median = medianCaps.length === 0 ? 0 : medianCaps.length % 2 === 0
    ? (medianCaps[medianCaps.length / 2 - 1]! + medianCaps[medianCaps.length / 2]!) / 2
    : medianCaps[Math.floor(medianCaps.length / 2)]!;
  const qualified = candidates.filter(({ corp, marketCap }) => {
    const floatRatio = Number.isFinite(corp.publicFloat) ? corp.publicFloat / corp.totalShares : undefined;
    if (floatRatio !== undefined && floatRatio < MIN_FREE_FLOAT_RATIO) return false;
    if (median > 0 && marketCap < median * MIN_RELATIVE_SIZE) return false;
    return !(corp.liquidCapital < 0 && (!Number.isFinite(marketCap) || marketCap <= 0 || -corp.liquidCapital > marketCap * INSOLVENCY_MATERIALITY_FRACTION));
  }).sort((a, b) => b.marketCap - a.marketCap || a.corp.id.localeCompare(b.corp.id)).slice(0, fund.topN);

  const weights = cappedMarketWeights(qualified.map((row) => row.marketCap));
  fund.targetConstituents = qualified.map((row, index) => ({
    corporationId: row.corp.id,
    targetWeight: weights[index]!,
    marketCapAnchor: row.marketCap,
    rank: index + 1,
  }));

  // Mark the source holdings from the same live prices that constrain their
  // next execution quote. Native's single-currency fund cash is USD-only.
  for (const [corpId, holding] of Object.entries(fund.holdings)) {
    const corp = world.corporations[corpId];
    if (corp) holding.lastValueAnchor = holding.shares * executionPrice(corp);
  }
  const holdingsValue = Object.values(fund.holdings).reduce((sum, holding) => sum + holding.lastValueAnchor, 0);
  const backing = fund.cashAnchor + holdingsValue;
  const maxEquityValue = MAX_EQUITY_ALLOCATION * backing;
  const targetWeight = new Map(fund.targetConstituents.map((row) => [row.corporationId, row.targetWeight]));
  const allIds = [...new Set([...Object.keys(fund.holdings), ...targetWeight.keys()])];
  const intents = allIds.flatMap((corpId) => {
    const corp = world.corporations[corpId];
    if (!corp) return [];
    const price = executionPrice(corp);
    if (!Number.isFinite(price) || price <= 0) return [];
    const current = fund.holdings[corpId]?.shares ?? 0;
    const target = Math.floor(((targetWeight.get(corpId) ?? 0) * maxEquityValue) / price);
    const drift = target - current;
    const cap = Math.max(1, Math.floor(corp.totalShares / 100));
    return drift > 0
      ? [{ corpId, corp, price, shares: Math.min(drift, cap, Math.max(0, Math.floor(corp.publicFloat))), direction: "buy" as const }]
      : drift < 0
        ? [{ corpId, corp, price, shares: Math.min(-drift, cap, current), direction: "sell" as const }]
        : [];
  });
  const sellIntents = intents.filter((intent) => intent.direction === "sell").sort((a, b) => a.corpId.localeCompare(b.corpId));
  const buyIntents = intents.filter((intent) => intent.direction === "buy").sort((a, b) => b.shares * b.price - a.shares * a.price || a.corpId.localeCompare(b.corpId));
  for (const intent of sellIntents) {
    const holding = fund.holdings[intent.corpId];
    const amount = intent.shares * intent.price;
    // With no source equity-market-pool book, Game routes sales to the issuer
    // treasury; refuse the whole leg when that authored account cannot cover it.
    if (!holding || intent.shares < 1 || intent.corp.liquidCapital < amount) continue;
    intent.corp.liquidCapital -= amount;
    intent.corp.publicFloat += intent.shares;
    fund.cashAnchor += amount;
    holding.shares -= intent.shares;
    holding.lastValueAnchor = holding.shares * intent.price;
    if (holding.shares === 0) delete fund.holdings[intent.corpId];
    book.transactions.push({ id: `fund-${world.meta.turn}-${book.transactions.length + 1}`, turn: world.meta.turn, fundSlug: fund.slug, kind: "floatSale", corporationId: intent.corpId, units: intent.shares, cashAnchor: amount });
  }
  let cashBudget = Math.max(0, Math.min(maxEquityValue - holdingsValue, fund.cashAnchor));
  for (const intent of buyIntents) {
    const affordable = Math.floor(cashBudget / intent.price);
    const shares = Math.min(intent.shares, affordable);
    if (shares < 1) continue;
    const amount = shares * intent.price;
    const holding = fund.holdings[intent.corpId] ?? { shares: 0, averageCostPerShare: intent.price, lastValueAnchor: 0 };
    holding.averageCostPerShare = (holding.shares * holding.averageCostPerShare + amount) / (holding.shares + shares);
    holding.shares += shares;
    holding.lastValueAnchor = holding.shares * intent.price;
    fund.holdings[intent.corpId] = holding;
    intent.corp.publicFloat -= shares;
    intent.corp.liquidCapital += amount;
    if (intent.corp.totalShares > 0 && intent.corp.publicFloat / intent.corp.totalShares >= 0.05) {
      intent.corp.orderFlowWindowBuyValue = (intent.corp.orderFlowWindowBuyValue ?? 0) + amount;
    }
    fund.cashAnchor -= amount;
    cashBudget -= amount;
    book.transactions.push({ id: `fund-${world.meta.turn}-${book.transactions.length + 1}`, turn: world.meta.turn, fundSlug: fund.slug, kind: "floatPurchase", corporationId: intent.corpId, units: shares, cashAnchor: amount });
  }
  settleQueuedIndexFundRedemptions(world, fund);
  const queuedUnits = book.redemptions.reduce((sum, redemption) => sum + redemption.queuedUnits, 0);
  const updatedHoldingsValue = Object.values(fund.holdings).reduce((sum, holding) => sum + holding.lastValueAnchor, 0);
  const nav = (fund.cashAnchor + updatedHoldingsValue) / (fund.unitSupply + queuedUnits);
  if (Number.isFinite(nav) && nav > 0) fund.quotedNav = nav;
}

/**
 * Source f14 fundCron runs after the ordinary turn simulation. Native's
 * weekly clock currently supplies one saved reprice/rebalance observation per
 * weekly step, whereas Game runs this cadence per engine turn.
 */
export const indexFundTurnPhase: TurnPhase = {
  name: "indexFunds",
  run(world) { rebalanceUsTop25(world); },
};
