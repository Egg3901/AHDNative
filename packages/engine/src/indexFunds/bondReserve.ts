import type { WorldState } from "../types.js";
import type { Bond } from "../bonds/types.js";
import { BOND_UNIT_FACE_VALUE } from "../bonds/constants.js";
import { nativeBondPoolForCurrency, nativeCurrencyRate, quoteNativeBondPool } from "../bonds/bondMarketPool.js";
import type { IndexFundRecord } from "./types.js";

const CASH_BUFFER_FRACTION = 0.05;
const MIN_RESERVE_SHARE = 0.25;
const MAX_EQUITY_SHARE = 0.75;
const MAX_SINGLE_SOVEREIGN_ISSUE_SHARE = 0.25;
const MAX_GLOBAL_SOVEREIGN_ISSUES_PER_PASS = 48;
const CREDIT_RATINGS = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC"] as const;

export function fundBondHolderId(slug: string): string {
  return `index-fund:${slug}`;
}

function ratingIndex(value: string | undefined): number {
  const index = CREDIT_RATINGS.indexOf((value ?? "BBB") as (typeof CREDIT_RATINGS)[number]);
  return index < 0 ? CREDIT_RATINGS.indexOf("BBB") : index;
}

function bondRating(world: WorldState, bond: Bond): string {
  if (bond.issuerType === "sovereign") return world.budgets[bond.countryId]?.creditRating ?? "BBB";
  return (bond.corporationId ? world.corporations[bond.corporationId]?.creditRatingSnapshot : undefined) ?? "BBB";
}

function fundHomeCountry(world: WorldState, fund: IndexFundRecord): string {
  if (fund.countryId) return fund.countryId;
  return Object.entries(world.exchangeRates).find(([, row]) => row.currencyCode === fund.currencyCode)?.[0] ?? "US";
}

function eligibleBonds(world: WorldState, fund: IndexFundRecord): Bond[] {
  const mandate = fund.bondUniverse;
  if (!mandate) return [];
  const homeCountry = fundHomeCountry(world, fund);
  const minimum = mandate.minRating ? ratingIndex(mandate.minRating) : 0;
  const maximum = mandate.maxRating ? ratingIndex(mandate.maxRating) : CREDIT_RATINGS.length - 1;
  const candidates = Object.values(world.bonds).filter((bond) => {
    if (bond.matured || bond.defaulted || bond.publicFloat <= 0 || bond.issuerType !== mandate.issuerType) return false;
    if (mandate.homeOnly && bond.countryId !== homeCountry) return false;
    const rating = ratingIndex(bondRating(world, bond));
    if (rating < minimum || rating > maximum) return false;
    const currency = bond.currencyCode;
    const exchange = Object.values(world.exchangeRates).find((row) => row.currencyCode === currency);
    if (mandate.homeOnly) return true; // source home paper bypasses capital controls and needs no FX read.
    if (!exchange || !Number.isFinite(exchange.rate) || exchange.rate <= 0) return false;
    if (bond.countryId !== homeCountry && exchange.capitalControls === true) return false;
    return true;
  });
  candidates.sort((left, right) => {
    const leftHeld = left.holders.some((holder) => holder.units > 0) ? 1 : 0;
    const rightHeld = right.holders.some((holder) => holder.units > 0) ? 1 : 0;
    return leftHeld - rightHeld || left.countryId.localeCompare(right.countryId) ||
      left.maturityTurn - right.maturityTurn || left.id.localeCompare(right.id);
  });
  return fund.scope === "global" && mandate.issuerType === "sovereign"
    ? candidates.slice(0, MAX_GLOBAL_SOVEREIGN_ISSUES_PER_PASS)
    : candidates;
}

function backingAnchor(world: WorldState, fund: IndexFundRecord): { total: number; equity: number; bonds: number } {
  let equity = 0;
  for (const [corpId, holding] of Object.entries(fund.holdings)) {
    const corp = world.corporations[corpId];
    if (!corp) { equity += holding.lastValueAnchor; continue; }
    const code = corp.liquidCurrencyCode ?? world.budgets[corp.countryId]?.currencyCode ?? "USD";
    const rate = nativeCurrencyRate(world, code);
    if (rate) holding.lastValueAnchor = holding.shares * corp.sharePrice / rate;
    equity += holding.lastValueAnchor;
  }
  let bonds = 0;
  for (const [bondId, holding] of Object.entries(fund.bondHoldings ?? {})) {
    const bond = world.bonds[bondId];
    const rate = bond && nativeCurrencyRate(world, bond.currencyCode);
    if (bond && rate) holding.lastValueAnchor = holding.units * bond.faceValue * bond.marketPrice / rate;
    bonds += holding.lastValueAnchor;
  }
  return { total: fund.cashAnchor + equity + bonds, equity, bonds };
}

export function refreshIndexFundNav(world: WorldState, fund: IndexFundRecord): void {
  if (fund.unitSupply <= 0) return;
  fund.quotedNav = backingAnchor(world, fund).total / fund.unitSupply;
}

/** Source fundBondReserve.ts cash/asset legs against real Native public bonds and local bond-pool cash. */
export function deployIndexFundBondReserve(world: WorldState, fund: IndexFundRecord): number {
  if (fund.status !== "active" || !fund.bondUniverse) return 0;
  if (fund.kind !== "bond" && world.indexFundBondLiquidityEnabled !== true) return 0;
  const book = world.indexFundBook;
  if (!book) return 0;
  const backing = backingAnchor(world, fund);
  if (backing.total <= 0) return 0;
  const minReserveShare = fund.kind === "bond" ? 1 : MIN_RESERVE_SHARE;
  const reserveShortfall = Math.max(0, minReserveShare * backing.total - backing.bonds - fund.cashAnchor);
  const minimumCash = Math.min(fund.cashAnchor, CASH_BUFFER_FRACTION * backing.total);
  const targetBondValue = fund.kind === "bond" ? Math.max(0, backing.total - minimumCash) : backing.bonds + reserveShortfall;
  let remainingBudget = Math.max(0, Math.min(targetBondValue - backing.bonds, fund.cashAnchor - minimumCash));
  if (remainingBudget <= 0) return 0;

  const candidates = eligibleBonds(world, fund);
  let deployed = 0;
  for (let index = 0; index < candidates.length && remainingBudget > 0; index++) {
    const bond = candidates[index]!;
    const currency = bond.currencyCode;
    const rate = nativeCurrencyRate(world, currency);
    if (!rate || rate <= 0) continue;
    const currentUnits = bond.holders.find((holder) => holder.holderId === fundBondHolderId(fund.slug))?.units ?? 0;
    const totalUnits = Math.floor(bond.totalIssued / bond.faceValue);
    const holderCap = bond.issuerType === "sovereign" ? Math.floor(totalUnits * MAX_SINGLE_SOVEREIGN_ISSUE_SHARE) : Number.MAX_SAFE_INTEGER;
    const availableUnits = Math.min(Math.floor(bond.publicFloat), Math.max(0, holderCap - currentUnits));
    if (availableUnits <= 0) continue;

    const pool = nativeBondPoolForCurrency(world, currency, true);
    const quote = quoteNativeBondPool({
      issuerType: bond.issuerType,
      marketPrice: bond.marketPrice,
      cashLocal: pool.cashLocal,
      targetCashLocal: pool.targetCashLocal,
      appetite: pool.appetiteByCountry?.[bond.countryId],
      defaulted: bond.defaulted,
    });
    const priceLocal = Math.round(bond.faceValue * quote.ask * 100) / 100;
    if (!(priceLocal > 0)) continue;
    const issueBudget = remainingBudget / (candidates.length - index);
    let units = Math.min(availableUnits, Math.floor(issueBudget * rate / priceLocal));
    const affordable = (count: number) => {
      const cost = Math.round(count * priceLocal / rate * 100) / 100;
      const marked = count * bond.faceValue * bond.marketPrice / rate;
      return cost > 0 && cost <= remainingBudget + 1e-9 &&
        fund.cashAnchor - cost + 1e-9 >= CASH_BUFFER_FRACTION * (backing.total + marked - cost);
    };
    while (units > 0 && !affordable(units)) units--;
    if (units <= 0) continue;
    const costLocal = units * priceLocal;
    const costAnchor = Math.round(costLocal / rate * 100) / 100;
    const markedAnchor = units * bond.faceValue * bond.marketPrice / rate;
    if (fund.cashAnchor - costAnchor < 0 || bond.publicFloat < units) continue;

    const holderId = fundBondHolderId(fund.slug);
    const holder = bond.holders.find((row) => row.holderId === holderId);
    if (holder) holder.units += units;
    else bond.holders.push({ holderId, units });
    bond.publicFloat -= units;
    pool.cashLocal = Math.round((pool.cashLocal + costLocal) * 100) / 100;
    pool.lifetime.fundPurchasesIn = (pool.lifetime.fundPurchasesIn ?? 0) + costLocal;
    fund.bondHoldings ??= {};
    const prior = fund.bondHoldings[bond.id];
    fund.bondHoldings[bond.id] = prior
      ? { units: prior.units + units, averageCostPerUnitAnchor: (prior.units * prior.averageCostPerUnitAnchor + costAnchor) / (prior.units + units), lastValueAnchor: prior.lastValueAnchor + markedAnchor }
      : { units, averageCostPerUnitAnchor: costAnchor / units, lastValueAnchor: markedAnchor };
    fund.cashAnchor -= costAnchor;
    book.transactions.push({ id: `fund-${world.meta.turn}-${book.transactions.length + 1}`, turn: world.meta.turn, fundSlug: fund.slug, kind: "bondPurchase", bondId: bond.id, units, cashAnchor: costAnchor });
    deployed += costAnchor;
    remainingBudget -= costAnchor;
  }
  if (deployed > 0) refreshIndexFundNav(world, fund);
  return deployed;
}

/** Credits coupon or maturity proceeds to the fund's anchor-currency cash, retaining native issuer denomination at the boundary. */
export function settleIndexFundBondReceipt(world: WorldState, bond: Bond, holderId: string, units: number, amountLocal: number, kind: "bondCoupon" | "bondMaturity" | "bondDefaultReceipt"): boolean {
  const prefix = "index-fund:";
  if (!holderId.startsWith(prefix) || !canSettleIndexFundBondReceipt(world, bond, holderId, units, amountLocal)) return false;
  const slug = holderId.slice(prefix.length);
  const fund = world.indexFundBook?.funds[slug];
  const position = fund?.bondHoldings?.[bond.id];
  if (!fund || !position || position.units !== units) return false;
  const rate = nativeCurrencyRate(world, bond.currencyCode)!;
  const cashAnchor = amountLocal / rate;
  if (!Number.isFinite(cashAnchor) || !Number.isFinite(fund.cashAnchor + cashAnchor)) return false;
  if (kind === "bondMaturity" || kind === "bondDefaultReceipt") delete fund.bondHoldings![bond.id];
  if (amountLocal === 0) {
    refreshIndexFundNav(world, fund);
    return true;
  }
  fund.cashAnchor += cashAnchor;
  const book = world.indexFundBook!;
  book.transactions.push({ id: `fund-${world.meta.turn}-${book.transactions.length + 1}`, turn: world.meta.turn, fundSlug: slug, kind, bondId: bond.id, units, cashAnchor });
  refreshIndexFundNav(world, fund);
  return true;
}

export function canSettleIndexFundBondReceipt(world: WorldState, bond: Bond, holderId: string, units: number, amountLocal: number): boolean {
  if (!holderId.startsWith("index-fund:") || !Number.isSafeInteger(units) || units <= 0 || !Number.isFinite(amountLocal) || amountLocal < 0) return false;
  const slug = holderId.slice("index-fund:".length);
  const fund = world.indexFundBook?.funds[slug];
  const position = fund?.bondHoldings?.[bond.id];
  const rate = nativeCurrencyRate(world, bond.currencyCode);
  const anchor = amountLocal / (rate ?? 0);
  return !!fund && position?.units === units && !!rate && rate > 0 && Number.isFinite(anchor) && Number.isFinite(fund.cashAnchor + anchor);
}
