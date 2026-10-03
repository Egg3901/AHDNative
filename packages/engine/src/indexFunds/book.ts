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
  const available = Math.max(0, fund.cashAnchor - alreadyQueued);
  const requestedCash = units * fund.quotedNav;
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
    createdTurn: world.meta.turn,
    status: queuedUnits === 0 ? "paid" as const : paidUnits === 0 ? "queued" as const : "partial" as const,
  };
  if (queuedUnits > 0) book.redemptions.push(redemption);
  book.transactions.push({ id: `fund-${world.meta.turn}-${book.transactions.length + 1}`, turn: world.meta.turn, fundSlug, kind: "redemption", units, cashAnchor: actualPaidCash });
  return { ok: true, cash: actualPaidCash, units, status: redemption.status };
}
