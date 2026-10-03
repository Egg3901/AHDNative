import type { WorldState } from "../types.js";
import { resolveCountryCurrency } from "../bonds/denomination.js";
import type { IndexFundBook, IndexFundRecord } from "./types.js";
import { applyIndexFundEquityCustody } from "./equityCustody.js";

export const INDEX_FUND_INITIAL_NAV = 100;
export const INDEX_FUND_SEED_CASH_ANCHOR = 50_000_000;
export const INDEX_FUND_SEED_RESERVE_UNITS = 500_000;

/**
 * Static port of AHDGame `indexFunds/fundDefinitions.ts` at Game origin/development
 * 6f8b083beffbc79b8c9974b80d93dbd19d6d56a6. The source migration seeds every
 * definition with the same NAV, reserve-unit and anchor-cash values; it does
 * not seed constituents or assets. `cashAnchor` remains common accounting
 * anchor value, while `currencyCode` is the fund's source trading denomination.
 */
const COUNTRY_FUNDS = [
  { countryId: "US", currencyCode: "USD", label: "US", names: { 25: "US Large-Cap 25 Index", 50: "US Broad Market 50 Index" } },
  { countryId: "UK", currencyCode: "GBP", label: "UK", names: { 25: "FTSE 25 Index", 50: "FTSE 50 Index" } },
  { countryId: "JP", currencyCode: "JPY", label: "JP", names: { 25: "Nikkei 25 Index", 50: "Nikkei 50 Index" } },
  { countryId: "DE", currencyCode: "EUR", label: "DE", names: { 25: "DAX 25 Index", 50: "DAX 50 Index" } },
  { countryId: "IE", currencyCode: "IEP", label: "IE", names: { 25: "ISEQ 25 Index", 50: "ISEQ 50 Index" } },
  { countryId: "BR", currencyCode: "BRL", label: "BR", names: { 25: "B3 25 Index", 50: "B3 50 Index" } },
  { countryId: "CN", currencyCode: "CNY", label: "CN", names: { 25: "SSE 25 Index", 50: "SSE 50 Index" } },
  { countryId: "NG", currencyCode: "NGN", label: "NG", names: { 25: "NGX 25 Index", 50: "NGX 50 Index" } },
] as const;

const SECTOR_FUNDS = [
  ["financial", "Financials", "GLBFIN"], ["media", "Media", "GLBMEA"],
  ["manufacturing", "Manufacturing", "GLBMFG"], ["chemical_industries", "Chemicals", "GLBCHM"],
  ["healthcare", "Healthcare", "GLBHLT"], ["retail", "Retail", "GLBRTL"],
  ["automobiles", "Automobiles", "GLBAUT"], ["technology", "Technology", "GLBTEC"],
  ["energy", "Energy", "GLBENR"], ["agriculture", "Agriculture", "GLBAGR"],
  ["real_estate", "Real Estate", "GLBRE"], ["construction", "Construction", "GLBCON"],
  ["defense", "Defense", "GLBDEF"], ["telecommunications", "Telecom", "GLBCOM"],
  ["entertainment", "Entertainment", "GLBENT"], ["logistics", "Logistics", "GLBTRN"],
  ["extraction", "Extraction & Mining", "GLBEXT"],
] as const satisfies ReadonlyArray<readonly [import("../corporation/types.js").CorporationType, string, string]>;

const BOND_FUND_DEFINITIONS = [
  ...COUNTRY_FUNDS.map(({ countryId, currencyCode }) => ({
    slug: `${countryId.toLowerCase()}_sovereign_bonds`, name: `${countryId} Government Bond Fund`,
    ticker: `${countryId}GOV`, kind: "bond" as const, scope: "country" as const,
    countryId, currencyCode, bondUniverse: { issuerType: "sovereign" as const, homeOnly: true },
  })),
  { slug: "global_sovereign_ig", name: "Global Investment Grade Sovereign Bond Fund", ticker: "GLBGOV", kind: "bond" as const, scope: "global" as const, currencyCode: "USD", bondUniverse: { issuerType: "sovereign" as const, minRating: "BBB" } },
  { slug: "global_emerging_sovereign", name: "Emerging Markets Sovereign Bond Fund", ticker: "GLBEMB", kind: "bond" as const, scope: "global" as const, currencyCode: "USD", bondUniverse: { issuerType: "sovereign" as const, maxRating: "BB" } },
  { slug: "global_corporate_ig", name: "Global Investment Grade Corporate Bond Fund", ticker: "GLBCRP", kind: "bond" as const, scope: "global" as const, currencyCode: "USD", bondUniverse: { issuerType: "corporation" as const, minRating: "BBB" } },
  { slug: "global_high_yield", name: "Global High Yield Bond Fund", ticker: "GLBHYB", kind: "bond" as const, scope: "global" as const, currencyCode: "USD", bondUniverse: { issuerType: "corporation" as const, maxRating: "BB" } },
];

function seededFund(definition: Omit<IndexFundRecord, "status" | "quotedNav" | "unitSupply" | "reserveUnits" | "cashAnchor" | "targetConstituents" | "holdings">): IndexFundRecord {
  return {
    ...definition,
    status: "active",
    quotedNav: INDEX_FUND_INITIAL_NAV,
    unitSupply: INDEX_FUND_SEED_RESERVE_UNITS,
    reserveUnits: INDEX_FUND_SEED_RESERVE_UNITS,
    cashAnchor: INDEX_FUND_SEED_CASH_ANCHOR,
    targetConstituents: [],
    holdings: {},
    ...(definition.kind === "bond" ? { bondHoldings: {} } : {}),
  };
}

/** Exact 46-definition inventory from the pinned source definition module. */
export const INDEX_FUND_DEFINITIONS: readonly IndexFundRecord[] = [
  ...COUNTRY_FUNDS.flatMap(({ countryId, currencyCode, names }) => ([25, 50] as const).map((topN) => seededFund({
    slug: `${countryId.toLowerCase()}_top_${topN}`,
    name: names[topN], ticker: `${countryId}${topN}`,
    kind: "broad", scope: "country", countryId, currencyCode, topN,
  }))),
  seededFund({ slug: "global_top_50", name: "Global Top 50 Index", ticker: "GLB50", kind: "broad", scope: "global", currencyCode: "USD", topN: 50 }),
  ...SECTOR_FUNDS.map(([sectorType, sectorLabel, ticker]) => seededFund({
    slug: `global_sector_${sectorType}`, name: `Global ${sectorLabel} Index`, ticker,
    kind: "sector", scope: "global", sectorType, currencyCode: "USD",
  })),
  ...BOND_FUND_DEFINITIONS.map((definition) => seededFund(definition)),
];

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

function currencyRate(world: WorldState, currency: string): number | undefined {
  const row = Object.values(world.exchangeRates).find((rate) => rate.currencyCode === currency);
  if (row && Number.isFinite(row.rate) && row.rate > 0) return row.rate;
  return currency === "USD" && row === undefined ? 1 : undefined;
}

/** Fund cash/NAV is in the source's shared accounting anchor (USD); wallets and issuer treasuries are local currency. */
function anchorToLocal(world: WorldState, amountAnchor: number, currency: string): number | undefined {
  const rate = currencyRate(world, currency);
  return rate === undefined ? undefined : amountAnchor * rate;
}

function playerCash(world: WorldState, currency: string): { value: number; write: (value: number) => void } | string {
  const home = resolveCountryCurrency(world, world.player.countryId);
  if (currency === home) return { value: world.player.cash, write: (value) => { world.player.cash = value; } };
  return {
    value: world.player.currencyBalances?.personal[currency] ?? 0,
    write: (value) => {
      world.player.currencyBalances ??= { personal: {} };
      world.player.currencyBalances.personal[currency] = value;
    },
  };
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
    const rate = currencyRate(world, corp.liquidCurrencyCode ?? resolveCountryCurrency(world, corp.countryId));
    if (!rate) return [];
    const maxShares = Math.max(0, Math.min(holding.shares, Math.floor(corp.liquidCapital / price)));
    return maxShares > 0 ? [{ corpId, holding, corp, price, rate, maxShares, value: (maxShares * price) / rate }] : [];
  });
  const totalValue = candidates.reduce((sum, row) => sum + row.value, 0);
  if (totalValue <= 0) return 0;
  const plan = new Map<string, number>();
  let remaining = cashNeeded;
  if (cashNeeded >= totalValue) {
    for (const row of candidates) plan.set(row.corpId, row.maxShares);
  } else {
    for (const row of candidates) {
      const shares = Math.min(row.maxShares, Math.floor((cashNeeded * row.value / totalValue) * row.rate / row.price));
      if (shares > 0) {
        plan.set(row.corpId, shares);
        remaining -= shares * row.price / row.rate;
      }
    }
    for (const row of [...candidates].sort((a, b) => b.value - a.value || a.corpId.localeCompare(b.corpId))) {
      while (remaining > 0 && (plan.get(row.corpId) ?? 0) < row.maxShares && row.price / row.rate <= remaining + 1e-9) {
        plan.set(row.corpId, (plan.get(row.corpId) ?? 0) + 1);
        remaining -= row.price / row.rate;
      }
    }
  }
  let raised = 0;
  for (const row of candidates) {
    const shares = plan.get(row.corpId) ?? 0;
    const amountLocal = shares * row.price;
    const amount = amountLocal / row.rate;
    if (shares < 1 || row.corp.liquidCapital < amountLocal || row.holding.shares < shares ||
        (row.corp.shareholders.find((entry) => entry.holder === "fund" && entry.fundSlug === fund.slug)?.shares ?? 0) !== row.holding.shares) continue;
    row.corp.liquidCapital -= amountLocal;
    row.corp.publicFloat += shares;
    if (row.corp.totalShares > 0 && row.corp.publicFloat / row.corp.totalShares >= 0.05) {
      row.corp.orderFlowWindowSellValue = (row.corp.orderFlowWindowSellValue ?? 0) + amountLocal;
    }
    row.holding.shares -= shares;
    row.holding.lastValueAnchor = row.holding.shares * row.price / row.rate;
    if (row.holding.shares === 0) delete fund.holdings[row.corpId];
    applyIndexFundEquityCustody(row.corp, fund.slug, -shares, row.price);
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
  const cashLocal = anchorToLocal(world, cash, fund.currencyCode);
  if (cashLocal === undefined) return { ok: false, error: `No current exchange rate for ${fund.currencyCode}` };
  if (!Number.isFinite(cashLocal) || wallet.value < cashLocal) return { ok: false, error: `Not enough ${fund.currencyCode} cash. Required: ${cashLocal}, available: ${wallet.value}` };

  const book = world.indexFundBook!;
  const position = book.positions.find((row) => row.fundSlug === fundSlug && row.holderKind === "player" && row.holderId === "player");
  wallet.write(wallet.value - cashLocal);
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
  if (anchorToLocal(world, requestedCash, fund.currencyCode) === undefined) return { ok: false, error: `No current exchange rate for ${fund.currencyCode}` };
  sellFundHoldingsForCash(world, fund, Math.max(0, requestedCash - Math.max(0, fund.cashAnchor - alreadyQueued)));
  const available = Math.max(0, fund.cashAnchor - alreadyQueued);
  const paidCash = Math.min(requestedCash, available);
  const paidUnits = Math.min(units, Math.floor(paidCash / fund.quotedNav));
  const queuedUnits = units - paidUnits;
  const actualPaidCash = paidUnits * fund.quotedNav;

  // Validate the entire transition first, then commit the cash, claim and supply legs together.
  wallet.write(wallet.value + anchorToLocal(world, actualPaidCash, fund.currencyCode)!);
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
    const paidLocal = anchorToLocal(world, paidCash, fund.currencyCode);
    if (paidLocal === undefined) continue;
    wallet.write(wallet.value + paidLocal);
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
