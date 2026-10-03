import type { TurnPhase } from "../phases/types.js";
import type { Corporation } from "../corporation/types.js";
import type { WorldState } from "../types.js";
import { resolveCountryCurrency } from "../bonds/denomination.js";
import { settleQueuedIndexFundRedemptions } from "./book.js";
import type { IndexFundRecord } from "./types.js";

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

function currencyRate(world: WorldState, currency: string): number | undefined {
  const row = Object.values(world.exchangeRates).find((rate) => rate.currencyCode === currency);
  if (row && Number.isFinite(row.rate) && row.rate > 0) return row.rate;
  return currency === "USD" && row === undefined ? 1 : undefined;
}

function corporationCurrency(world: WorldState, corp: Corporation): string {
  return corp.liquidCurrencyCode ?? resolveCountryCurrency(world, corp.countryId);
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

function fundMatchesCorporation(fund: IndexFundRecord, corp: Corporation): boolean {
  if (corp.ownershipState === "stateOwned" || corp.countryOwnerId || corp.isPrivate === true) return false;
  if (fund.scope === "country" && corp.countryId !== fund.countryId) return false;
  if (fund.kind === "sector") return corp.sectorType === fund.sectorType || corp.secondarySectorType === fund.sectorType;
  return fund.kind === "broad";
}

function fundTarget(world: WorldState, fund: IndexFundRecord) {
  const candidates = Object.values(world.corporations).filter((corp) =>
    fundMatchesCorporation(fund, corp) &&
    corp.totalShares > 0 && Number.isFinite(corp.sharePrice) && corp.sharePrice > 0,
  ).flatMap((corp) => {
    const code = corporationCurrency(world, corp);
    const localRate = currencyRate(world, code);
    const fundRate = currencyRate(world, fund.currencyCode);
    if (localRate === undefined || fundRate === undefined) return [];
    const marketCapAnchor = corp.sharePrice * corp.totalShares / localRate * fundRate;
    return Number.isFinite(marketCapAnchor) && marketCapAnchor > 0 ? [{ corp, marketCapAnchor }] : [];
  });
  const caps = candidates.map((row) => row.marketCapAnchor).sort((a, b) => a - b);
  const median = caps.length === 0 ? 0 : caps.length % 2 === 0
    ? (caps[caps.length / 2 - 1]! + caps[caps.length / 2]!) / 2
    : caps[Math.floor(caps.length / 2)]!;
  const incumbents = new Set(fund.targetConstituents.map((row) => row.corporationId));
  const qualified = candidates.filter(({ corp, marketCapAnchor }) => {
    const floatRatio = corp.totalShares > 0 ? corp.publicFloat / corp.totalShares : 0;
    if (floatRatio < MIN_FREE_FLOAT_RATIO) return incumbents.has(corp.id);
    if (median > 0 && marketCapAnchor < median * MIN_RELATIVE_SIZE) return incumbents.has(corp.id);
    if (corp.liquidCapital < 0 && -corp.liquidCapital > marketCapAnchor * 0.01) return false;
    return true;
  }).sort((a, b) => b.marketCapAnchor - a.marketCapAnchor || a.corp.id.localeCompare(b.corp.id))
    .slice(0, fund.topN);
  const weights = cappedMarketWeights(qualified.map((row) => row.marketCapAnchor));
  fund.targetConstituents = qualified.map((row, index) => ({
    corporationId: row.corp.id,
    targetWeight: weights[index]!,
    marketCapAnchor: row.marketCapAnchor,
    rank: index + 1,
  }));
}

function rebalanceEquityFund(world: WorldState, fund: IndexFundRecord, absorptionShares: Map<string, number>): void {
  const book = world.indexFundBook;
  if (!book || fund.status !== "active" || fund.kind === "bond") return;
  for (const [corpId, holding] of Object.entries(fund.holdings)) {
    const corp = world.corporations[corpId];
    const rate = corp && currencyRate(world, corporationCurrency(world, corp));
    if (corp && rate) holding.lastValueAnchor = holding.shares * executionPrice(corp) / rate;
  }
  const holdingsValue = Object.values(fund.holdings).reduce((sum, holding) => sum + holding.lastValueAnchor, 0);
  const bondValue = Object.values(fund.bondHoldings ?? {}).reduce((sum, holding) => sum + holding.lastValueAnchor, 0);
  const maxEquityValue = MAX_EQUITY_ALLOCATION * (fund.cashAnchor + holdingsValue + bondValue);
  const targetWeight = new Map(fund.targetConstituents.map((row) => [row.corporationId, row.targetWeight]));
  const allIds = [...new Set([...Object.keys(fund.holdings), ...targetWeight.keys()])];
  type Intent = { corpId: string; corp: Corporation; priceLocal: number; priceAnchor: number; shares: number; direction: "buy" | "sell" };
  const intents = allIds.flatMap<Intent>((corpId) => {
    const corp = world.corporations[corpId];
    if (!corp) return [];
    const priceLocal = executionPrice(corp);
    const rate = currencyRate(world, corporationCurrency(world, corp));
    if (!Number.isFinite(priceLocal) || priceLocal <= 0 || !rate) return [];
    const priceAnchor = priceLocal / rate;
    const current = fund.holdings[corpId]?.shares ?? 0;
    const target = Math.floor(((targetWeight.get(corpId) ?? 0) * maxEquityValue) / priceAnchor);
    const drift = target - current;
    const cap = Math.max(1, Math.floor(corp.totalShares / 100));
    return drift > 0
      ? [{ corpId, corp, priceLocal, priceAnchor, shares: Math.min(drift, cap, Math.max(0, Math.floor(corp.publicFloat))), direction: "buy" }]
      : drift < 0
        ? [{ corpId, corp, priceLocal, priceAnchor, shares: Math.min(-drift, cap, current), direction: "sell" }]
        : [];
  });
  const sellIntents = intents.filter((intent) => intent.direction === "sell").sort((a, b) => a.corpId.localeCompare(b.corpId));
  const buyIntents = intents.filter((intent) => intent.direction === "buy").sort((a, b) => b.shares * b.priceAnchor - a.shares * a.priceAnchor || a.corpId.localeCompare(b.corpId));

  for (const intent of sellIntents) {
    const holding = fund.holdings[intent.corpId];
    const amountLocal = intent.shares * intent.priceLocal;
    const amountAnchor = intent.shares * intent.priceAnchor;
    if (!holding || intent.shares < 1 || intent.corp.liquidCapital < amountLocal) continue;
    intent.corp.liquidCapital -= amountLocal;
    intent.corp.publicFloat += intent.shares;
    if (intent.corp.totalShares > 0 && intent.corp.publicFloat / intent.corp.totalShares >= 0.05) {
      intent.corp.orderFlowWindowSellValue = (intent.corp.orderFlowWindowSellValue ?? 0) + amountLocal;
    }
    holding.shares -= intent.shares;
    holding.lastValueAnchor = holding.shares * intent.priceAnchor;
    if (holding.shares === 0) delete fund.holdings[intent.corpId];
    fund.cashAnchor += amountAnchor;
    book.transactions.push({ id: `fund-${world.meta.turn}-${book.transactions.length + 1}`, turn: world.meta.turn, fundSlug: fund.slug, kind: "floatSale", corporationId: intent.corpId, units: intent.shares, cashAnchor: amountAnchor });
  }

  let cashBudget = Math.max(0, Math.min(maxEquityValue - holdingsValue, fund.cashAnchor));
  for (const intent of buyIntents) {
    const plannedCap = absorptionShares.get(`${fund.slug}:${intent.corpId}`) ?? 0;
    const perFundCap = Math.max(1, Math.floor(intent.corp.totalShares / 100));
    const affordable = Math.floor(cashBudget / intent.priceAnchor);
    const shares = Math.min(intent.shares, perFundCap, plannedCap, affordable);
    if (shares < 1) continue;
    const amountLocal = shares * intent.priceLocal;
    const amountAnchor = shares * intent.priceAnchor;
    const holding = fund.holdings[intent.corpId] ?? { shares: 0, averageCostPerShare: intent.priceAnchor, lastValueAnchor: 0 };
    holding.averageCostPerShare = (holding.shares * holding.averageCostPerShare + amountAnchor) / (holding.shares + shares);
    holding.shares += shares;
    holding.lastValueAnchor = holding.shares * intent.priceAnchor;
    fund.holdings[intent.corpId] = holding;
    intent.corp.publicFloat -= shares;
    intent.corp.liquidCapital += amountLocal;
    if (intent.corp.totalShares > 0 && intent.corp.publicFloat / intent.corp.totalShares >= 0.05) {
      intent.corp.orderFlowWindowBuyValue = (intent.corp.orderFlowWindowBuyValue ?? 0) + amountLocal;
    }
    fund.cashAnchor -= amountAnchor;
    cashBudget -= amountAnchor;
    book.transactions.push({ id: `fund-${world.meta.turn}-${book.transactions.length + 1}`, turn: world.meta.turn, fundSlug: fund.slug, kind: "floatPurchase", corporationId: intent.corpId, units: shares, cashAnchor: amountAnchor });
  }
  settleQueuedIndexFundRedemptions(world, fund);
  const queuedUnits = book.redemptions.filter((row) => row.fundSlug === fund.slug).reduce((sum, row) => sum + row.queuedUnits, 0);
  const updatedHoldingsValue = Object.values(fund.holdings).reduce((sum, holding) => sum + holding.lastValueAnchor, 0);
  const updatedBondValue = Object.values(fund.bondHoldings ?? {}).reduce((sum, holding) => sum + holding.lastValueAnchor, 0);
  const nav = (fund.cashAnchor + updatedHoldingsValue + updatedBondValue) / (fund.unitSupply + queuedUnits);
  if (Number.isFinite(nav) && nav > 0) fund.quotedNav = nav;
}

function allocateSharedFloatCap(world: WorldState, funds: IndexFundRecord[]): Map<string, number> {
  const output = new Map<string, number>();
  const corps = Object.values(world.corporations).sort((a, b) => a.id.localeCompare(b.id));
  for (const corp of corps) {
    const publicFloat = Math.max(0, Math.floor(corp.publicFloat));
    const cap = Math.min(publicFloat, Math.max(1, Math.floor(corp.totalShares / 100)));
    if (cap <= 0) continue;
    const bids = funds.flatMap((fund) => {
      const target = fund.targetConstituents.find((row) => row.corporationId === corp.id);
      if (!target || target.targetWeight <= 0) return [];
      return [{ id: fund.slug, requested: Math.min(publicFloat, Math.max(1, Math.floor(cap * target.targetWeight))), weight: target.targetWeight }];
    }).sort((a, b) => a.id.localeCompare(b.id));
    let remaining = cap;
    const active = new Set(bids.map((bid) => bid.id));
    while (remaining > 0 && active.size > 0) {
      const weightTotal = bids.filter((bid) => active.has(bid.id)).reduce((sum, bid) => sum + bid.weight, 0);
      if (weightTotal <= 0) break;
      const shares = bids.filter((bid) => active.has(bid.id)).map((bid) => {
        const raw = remaining * bid.weight / weightTotal;
        return { bid, raw, floor: Math.min(Math.floor(raw), bid.requested - (output.get(`${bid.id}:${corp.id}`) ?? 0)) };
      });
      let assigned = 0;
      for (const row of shares) {
        if (row.floor <= 0) continue;
        const key = `${row.bid.id}:${corp.id}`;
        output.set(key, (output.get(key) ?? 0) + row.floor);
        assigned += row.floor;
      }
      remaining -= assigned;
      for (const row of shares) if ((output.get(`${row.bid.id}:${corp.id}`) ?? 0) >= row.bid.requested) active.delete(row.bid.id);
      const remainderOrder = shares.filter((row) => active.has(row.bid.id))
        .sort((a, b) => (b.raw - Math.floor(b.raw)) - (a.raw - Math.floor(a.raw)) || a.bid.id.localeCompare(b.bid.id));
      let remainderAssigned = 0;
      for (const row of remainderOrder) {
        if (remaining <= 0) break;
        const key = `${row.bid.id}:${corp.id}`;
        const current = output.get(key) ?? 0;
        if (current >= row.bid.requested) { active.delete(row.bid.id); continue; }
        output.set(key, current + 1);
        remaining -= 1;
        remainderAssigned += 1;
        if (current + 1 >= row.bid.requested) active.delete(row.bid.id);
      }
      if (assigned === 0 && remainderAssigned === 0) break;
    }
  }
  return output;
}

/**
 * Source AHDGame runs a full catalog pass. In the SP graph, a fund can only
 * acquire cash-backed issuer treasury float that is present in WorldState;
 * there is no Mongo equity-pool account or persisted fund order book to debit.
 */
export const indexFundTurnPhase: TurnPhase = {
  name: "indexFunds",
  run(world) {
    const funds = Object.values(world.indexFundBook?.funds ?? {}).filter((fund) => fund.status === "active");
    const equityFunds = funds.filter((row) => row.kind !== "bond");
    for (const fund of equityFunds) fundTarget(world, fund);
    const absorptionShares = allocateSharedFloatCap(world, equityFunds);
    for (const fund of equityFunds) rebalanceEquityFund(world, fund, absorptionShares);
  },
};
