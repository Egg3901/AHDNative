import type { WorldState } from "../types.js";
import { resolveCountryCurrency } from "../bonds/denomination.js";
import type { IndexFundBook, IndexFundRecord } from "./types.js";

export const INDEX_FUND_INITIAL_NAV = 100;
export const INDEX_FUND_SEED_CASH_ANCHOR = 50_000_000;
export const INDEX_FUND_SEED_RESERVE_UNITS = 500_000;

/** First source-authored public fund vertical: AHDGame fundDefinitions.ts. */
export const INDEX_FUND_DEFINITIONS: readonly IndexFundRecord[] = [{
  slug: "us_top_25",
  name: "US Large-Cap 25 Index",
  ticker: "US25",
  kind: "broad",
  scope: "country",
  countryId: "US",
  currencyCode: "USD",
  topN: 25,
  status: "active",
  quotedNav: INDEX_FUND_INITIAL_NAV,
  unitSupply: INDEX_FUND_SEED_RESERVE_UNITS,
  reserveUnits: INDEX_FUND_SEED_RESERVE_UNITS,
  cashAnchor: INDEX_FUND_SEED_CASH_ANCHOR,
  targetConstituents: [],
  holdings: {},
}];

export function seedIndexFundBook(): IndexFundBook {
  const funds = Object.fromEntries(INDEX_FUND_DEFINITIONS.map((fund) => [fund.slug, structuredClone(fund)]));
  return {
    funds,
    positions: INDEX_FUND_DEFINITIONS.map((fund) => ({
      fundSlug: fund.slug,
      holderKind: "fund_reserve" as const,
      holderId: `reserve:${fund.slug}`,
      units: fund.reserveUnits,
      averageNavAnchor: fund.quotedNav,
    })),
    redemptions: [],
    transactions: [],
  };
}

export type FundTradeResult = { ok: true; cash: number; units: number; status: "paid" | "partial" | "queued" } | { ok: false; error: string };

function playerCash(world: WorldState, currency: string): { value: number; write: (value: number) => void } | string {
  const home = resolveCountryCurrency(world, world.player.countryId);
  if (currency !== home) return `Fund currency ${currency} differs from player home currency ${home}; currency conversion is not implemented`;
  return { value: world.player.cash, write: (value) => { world.player.cash = value; } };
}

function fundAndWallet(world: WorldState, fundSlug: string): { fund: IndexFundRecord; wallet: { value: number; write: (value: number) => void } } | { error: string } {
  const fund = world.indexFundBook?.funds[fundSlug];
  if (!fund || fund.status !== "active") return { error: `Unknown or inactive index fund: ${fundSlug}` };
  const wallet = playerCash(world, fund.currencyCode);
  if (typeof wallet === "string") return { error: wallet };
  return { fund, wallet };
}

function executionPrice(corp: WorldState["corporations"][string]): number {
  const fundamental = corp.fundamentalSharePrice ?? 0;
  if (corp.totalShares > 0 && corp.publicFloat / corp.totalShares < 0.05 && fundamental > 0) return fundamental;
  return fundamental > 0 ? Math.min(fundamental * 5, Math.max(fundamental / 5, corp.sharePrice)) : corp.sharePrice;
}

/** Source planProportionalHoldingsSale with issuer-treasury sell depth. */
function sellFundHoldingsForCash(world: WorldState, fund: IndexFundRecord, cashNeeded: number): number {
  if (!Number.isFinite(cashNeeded) || cashNeeded <= 0) return 0;
  const candidates = Object.entries(fund.holdings).flatMap(([corpId, holding]) => {
    const corp = world.corporations[corpId];
    if (!corp || holding.shares <= 0) return [];
    const price = executionPrice(corp);
    if (!Number.isFinite(price) || price <= 0) return [];
    const maxShares = Math.max(0, Math.min(holding.shares, Math.floor(corp.liquidCapital / price)));
    return maxShares > 0 ? [{ corpId, holding, corp, price, maxShares, value: maxShares * price }] : [];
  });
  const totalValue = candidates.reduce((sum, row) => sum + row.value, 0);
  if (totalValue <= 0) return 0;
  const plan = new Map<string, number>();
  let remaining = cashNeeded;
  if (cashNeeded >= totalValue) {
    for (const row of candidates) plan.set(row.corpId, row.maxShares);
  } else {
    for (const row of candidates) {
      const shares = Math.min(row.maxShares, Math.floor((cashNeeded * row.value / totalValue) / row.price));
      if (shares > 0) {
        plan.set(row.corpId, shares);
        remaining -= shares * row.price;
      }
    }
    for (const row of [...candidates].sort((a, b) => b.value - a.value || a.corpId.localeCompare(b.corpId))) {
      while (remaining > 0 && (plan.get(row.corpId) ?? 0) < row.maxShares && row.price <= remaining + 1e-9) {
        plan.set(row.corpId, (plan.get(row.corpId) ?? 0) + 1);
        remaining -= row.price;
      }
    }
  }
  let raised = 0;
  for (const row of candidates) {
    const shares = plan.get(row.corpId) ?? 0;
    const amount = shares * row.price;
    if (shares < 1 || row.corp.liquidCapital < amount || row.holding.shares < shares) continue;
    row.corp.liquidCapital -= amount;
    row.corp.publicFloat += shares;
    if (row.corp.totalShares > 0 && row.corp.publicFloat / row.corp.totalShares >= 0.05) {
      row.corp.orderFlowWindowSellValue = (row.corp.orderFlowWindowSellValue ?? 0) + amount;
    }
    row.holding.shares -= shares;
    row.holding.lastValueAnchor = row.holding.shares * row.price;
    if (row.holding.shares === 0) delete fund.holdings[row.corpId];
    const book = world.indexFundBook!;
    book.transactions.push({ id: `fund-${world.meta.turn}-${book.transactions.length + 1}`, turn: world.meta.turn, fundSlug: fund.slug, kind: "floatSale", units: shares, cashAnchor: amount });
    fund.cashAnchor += amount;
    raised += amount;
  }
  return raised;
}

export function subscribeIndexFund(world: WorldState, fundSlug: string, units: number): FundTradeResult {
  if (!Number.isSafeInteger(units) || units < 1) return { ok: false, error: "Index fund orders must be for at least 1 whole unit" };
  const resolved = fundAndWallet(world, fundSlug);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const { fund, wallet } = resolved;
  const cash = units * fund.quotedNav;
  if (!Number.isFinite(cash) || wallet.value < cash) return { ok: false, error: `Not enough ${fund.currencyCode} cash. Required: ${cash}, available: ${wallet.value}` };

  const book = world.indexFundBook!;
  const position = book.positions.find((row) => row.fundSlug === fundSlug && row.holderKind === "player" && row.holderId === "player");
  wallet.write(wallet.value - cash);
  fund.cashAnchor += cash;
  fund.unitSupply += units;
  if (position) {
    position.averageNavAnchor = (position.units * position.averageNavAnchor + cash) / (position.units + units);
    position.units += units;
  } else {
    book.positions.push({ fundSlug, holderKind: "player", holderId: "player", units, averageNavAnchor: fund.quotedNav });
  }
  book.transactions.push({ id: `fund-${world.meta.turn}-${book.transactions.length + 1}`, turn: world.meta.turn, fundSlug, kind: "subscription", units, cashAnchor: cash });
  return { ok: true, cash, units, status: "paid" };
}

export function redeemIndexFund(world: WorldState, fundSlug: string, units: number): FundTradeResult {
  if (!Number.isSafeInteger(units) || units < 1) return { ok: false, error: "Index fund redemptions must be for at least 1 whole unit" };
  const resolved = fundAndWallet(world, fundSlug);
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const { fund, wallet } = resolved;
  const book = world.indexFundBook!;
  const position = book.positions.find((row) => row.fundSlug === fundSlug && row.holderKind === "player" && row.holderId === "player");
  if (!position || position.units < units) return { ok: false, error: `Insufficient ${fundSlug} units: requested ${units}, held ${position?.units ?? 0}` };

  const alreadyQueued = book.redemptions.reduce((sum, row) => sum + row.queuedAmountAnchor, 0);
  const requestedCash = units * fund.quotedNav;
  sellFundHoldingsForCash(world, fund, Math.max(0, requestedCash - Math.max(0, fund.cashAnchor - alreadyQueued)));
  const available = Math.max(0, fund.cashAnchor - alreadyQueued);
  const paidCash = Math.min(requestedCash, available);
  const paidUnits = Math.min(units, Math.floor(paidCash / fund.quotedNav));
  const queuedUnits = units - paidUnits;
  const actualPaidCash = paidUnits * fund.quotedNav;

  // Validate the entire transition first, then commit the cash, claim and supply legs together.
  wallet.write(wallet.value + actualPaidCash);
  fund.cashAnchor -= actualPaidCash;
  fund.unitSupply -= units;
  position.units -= units;
  if (position.units === 0) book.positions.splice(book.positions.indexOf(position), 1);
  const redemption = {
    id: `redemption-${world.meta.turn}-${book.redemptions.length + 1}`,
    fundSlug,
    holderId: "player",
    requestedUnits: units,
    paidUnits,
    queuedUnits,
    queuedAmountAnchor: queuedUnits * fund.quotedNav,
    queuedNavAnchor: fund.quotedNav,
    createdTurn: world.meta.turn,
    status: queuedUnits === 0 ? "paid" as const : paidUnits === 0 ? "queued" as const : "partial" as const,
  };
  if (queuedUnits > 0) book.redemptions.push(redemption);
  book.transactions.push({ id: `fund-${world.meta.turn}-${book.transactions.length + 1}`, turn: world.meta.turn, fundSlug, kind: "redemption", units, cashAnchor: actualPaidCash });
  return { ok: true, cash: actualPaidCash, units, status: redemption.status };
}

export function settleQueuedIndexFundRedemptions(world: WorldState, fund: IndexFundRecord): void {
  const book = world.indexFundBook!;
  for (const redemption of book.redemptions) {
    if (redemption.fundSlug !== fund.slug || redemption.queuedAmountAnchor <= 0) continue;
    const reservedForLater = book.redemptions
      .filter((row) => row !== redemption && row.fundSlug === fund.slug && row.createdTurn <= redemption.createdTurn)
      .reduce((sum, row) => sum + row.queuedAmountAnchor, 0);
    const available = Math.max(0, fund.cashAnchor - reservedForLater);
    if (available <= 0) continue;
    sellFundHoldingsForCash(world, fund, Math.max(0, redemption.queuedAmountAnchor - available));
    const payout = Math.min(redemption.queuedAmountAnchor, Math.max(0, fund.cashAnchor - reservedForLater));
    const paidUnits = Math.min(redemption.queuedUnits, Math.floor((payout + 1e-8) / redemption.queuedNavAnchor));
    const paidCash = paidUnits * redemption.queuedNavAnchor;
    if (paidUnits < 1 || paidCash <= 0) continue;
    const wallet = playerCash(world, fund.currencyCode);
    if (typeof wallet === "string") continue;
    wallet.write(wallet.value + paidCash);
    fund.cashAnchor -= paidCash;
    redemption.queuedUnits -= paidUnits;
    redemption.queuedAmountAnchor -= paidCash;
    redemption.paidUnits += paidUnits;
    if (redemption.queuedUnits === 0) {
      redemption.queuedAmountAnchor = 0;
      redemption.status = "paid";
    } else redemption.status = "partial";
    book.transactions.push({ id: `fund-${world.meta.turn}-${book.transactions.length + 1}`, turn: world.meta.turn, fundSlug: fund.slug, kind: "redemptionPayout", units: paidUnits, cashAnchor: paidCash });
  }
  book.redemptions = book.redemptions.filter((row) => row.queuedUnits > 0);
}
