import type { WorldState } from "../types.js";
import type { Bond } from "./types.js";
import { BOND_UNIT_FACE_VALUE, calculateBondMarketPrice, perTurnCouponPayment } from "./constants.js";
import { isCorpStateOwned } from "./corporateBonds.js";
import { calculateNativeCorporateCreditRating, corporateRatingSpread } from "./corporateCredit.js";
import { nativeBondPoolForCurrency, nativeCurrencyRate, quoteNativeCorporateBondPool } from "./bondMarketPool.js";
import { resolveBondCurrency, resolveCountryCurrency } from "./denomination.js";

/**
 * Corporate bond servicing — #308.
 *
 * Source: AHDGame 01797b270 `src/lib/turn/bondTurn.ts` (Phase 1 coupon flows,
 * Phase 1.5/2 unified issuer debit, Phase 3 default detection, Phase 4
 * default/maturity marking, Phase 5 maturity settlement),
 * `src/lib/bonds/corpBondCashflows.ts` (per-turn coupon = annual rate × face /
 * TURNS_PER_YEAR, denominated in `bond.currencyCode`),
 * `src/app/api/bonds/[bondId]/buyback/route.ts` (CEO float buyback at market
 * price, full retirement with no holders → matured),
 * `src/lib/bonds/executeCorporationBondDefaultDissolution.ts` (national
 * corporations cannot be dissolved — state-owned issuers never default here).
 *
 * Solo cuts (cited, not silent): no FX conversion (domestic-only trade seam
 * guarantees bond currency == player home currency; the currencyBalances
 * fallback below mirrors the sovereign seam for crafted docs), no market pool
 * (the float slice of coupon/maturity cost is real issuer expense that
 * vanishes, exactly as the pool credit would receive it in mainline), no
 * escrow cover, no solvency-gate sector valuation, no restructure/refinance/
 * dissolution ladder (a solo default is terminal: paper freezes, trades
 * already blocked, no further accrual), no pool ask or cross-currency
 * settlement on buyback. Active corporate prices use the source conservative
 * current-credit-rate path; default stamps 0.1 per source Phase 4.
 *
 * Atomicity: per bond, affordability of coupon + maturity is checked BEFORE
 * any mutation. A bond that cannot be covered defaults with zero flows;
 * otherwise every flow (issuer debit, holder credits, status/float/holding
 * updates) commits together. Repeated calls at the same turn are idempotent:
 * coupons stamp `lastCouponTurn`, maturity/default transitions are guarded by
 * the `matured`/`defaulted` flags.
 *
 * Rounding: coupon and maturity flows are unrounded floats (same as the
 * sovereign seam), so conservation holds to float dust. Only buyback rounds,
 * using the trade seam's whole-order 2dp contract.
 */

export interface CorporateBondTurnResult {
  couponsPaid: number;
  matured: number;
  defaulted: number;
}

/** Per-unit coupon for one turn, in the bond's denomination. */
export function corporateCouponPerUnit(
  bond: Pick<Bond, "couponRate" | "faceValue">,
): number {
  return perTurnCouponPayment(bond.couponRate, bond.faceValue);
}

/** Whole units outstanding: tracked holders + market float. */
function outstandingUnits(bond: Pick<Bond, "holders" | "publicFloat">): number {
  return (
    bond.holders.reduce((sum, h) => sum + (h.units ?? 0), 0) + bond.publicFloat
  );
}

function playerUnits(bond: Pick<Bond, "holders">): number {
  return bond.holders.find((h) => h.holderId === "player")?.units ?? 0;
}

/**
 * Credit a player cash flow in the bond's authoritative denomination.
 * Mirrors bondTurn.ts creditPlayerBondCurrency: same-currency lands in
 * player.cash, anything else in currencyBalances.personal.
 */
function creditPlayerBondCurrency(
  world: WorldState,
  bond: Bond,
  amount: number,
): void {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  const homeCurrency =
    world.budgets[world.player.countryId]?.currencyCode?.trim() || "USD";
  const bondCurrency = resolveBondCurrency(world, bond);
  if (bondCurrency === homeCurrency) {
    world.player.cash += amount;
    return;
  }
  const balances = (world.player.currencyBalances ??= { personal: {} })
    .personal;
  balances[bondCurrency] = (balances[bondCurrency] ?? 0) + amount;
}

function markDefaulted(world: WorldState, bond: Bond): void {
  bond.defaulted = true;
  bond.defaultedAtTurn = world.meta.turn;
  bond.marketPrice = 0.1;
  bond.updatedAt = world.meta.date;
}

/** Source bondTurn's corporate current-rate calculation, using its conservative zero-income balance-sheet path. */
function currentCorporateBondRate(world: WorldState, corporationId: string): number {
  const corp = world.corporations[corporationId];
  if (!corp) return 3;
  const active = Object.values(world.bonds).filter(
    (bond) => bond.issuerType === "corporation" && bond.corporationId === corporationId && !bond.matured && !bond.defaulted,
  );
  const totalDebt = active.reduce((sum, bond) => sum + bond.totalIssued, 0);
  const annualInterest = active.reduce((sum, bond) => sum + (bond.couponRate / 100) * bond.totalIssued, 0);
  const totalEquity = corp.liquidCapital + corp.sharePrice * corp.totalShares * 0.1;
  const rating = calculateNativeCorporateCreditRating({
    liquidCapital: corp.liquidCapital,
    totalDebt,
    annualIncome: 0,
    annualInterestPayments: annualInterest,
    totalEquity,
  });
  const primeRate = world.centralBanks[corp.countryId]?.primeRate ?? 3;
  return primeRate + corporateRatingSpread(rating) + 1;
}

/**
 * Service every active corporate bond for the current turn: coupons, maturity
 * settlement, and insufficient-cash default. The exact writer hook the
 * source's processBondTurn provides; called from bondCouponMaturityPhase
 * (#309 owns any further phase reordering).
 */
export function processCorporateBondTurn(
  world: WorldState,
): CorporateBondTurnResult {
  const result: CorporateBondTurnResult = {
    couponsPaid: 0,
    matured: 0,
    defaulted: 0,
  };
  const turn = world.meta.turn;

  for (const bond of Object.values(world.bonds ?? {})) {
    if (bond.issuerType !== "corporation") continue;
    if (bond.matured || bond.defaulted) continue;
    const corp = bond.corporationId
      ? world.corporations[bond.corporationId]
      : undefined;
    if (!corp) continue;

    const stateOwned = isCorpStateOwned(corp);
    if (![corp.liquidCapital, corp.sharePrice, corp.totalShares].every(Number.isFinite)
      || !Number.isFinite(bond.marketPrice) || !Number.isFinite(bond.couponRate)
      || !Number.isFinite(bond.totalIssued) || !Number.isFinite(bond.faceValue)) {
      continue;
    }
    // Source processBondTurn prices active corporate bonds using the issuer's
    // live conservative credit score before coupon/default/maturity settlement.
    const currentRate = currentCorporateBondRate(world, corp.id);
    bond.marketPrice = calculateBondMarketPrice(
      bond.couponRate,
      currentRate,
      bond.maturityTurn - turn,
      false,
    );
    const units = outstandingUnits(bond);
    const couponPerUnit = corporateCouponPerUnit(bond);
    // State-owned (national) issuers are government-covered on coupons —
    // no liquidCapital change (source Phase 2 natcorp gate) — but still
    // incur maturity face value (source preserves the issuer maturity debit).
    const couponDue = bond.lastCouponTurn === turn ? 0 : couponPerUnit * units;
    const couponCost = stateOwned ? 0 : couponDue;
    const maturing = turn >= bond.maturityTurn;
    const maturityCost = maturing ? units * bond.faceValue : 0;
    const totalCost = couponCost + maturityCost;

    // Private issuers that cannot cover the turn's obligation default with
    // zero flows (atomic all-or-nothing). State-owned issuers never default
    // (source: national corporations cannot be dissolved); they service even
    // if liquidCapital goes negative.
    if (!stateOwned && corp.liquidCapital < totalCost) {
      markDefaulted(world, bond);
      result.defaulted++;
      continue;
    }

    if (totalCost > 0) {
      corp.liquidCapital -= totalCost;
    }
    const held = playerUnits(bond);
    if (couponDue > 0 && held > 0) {
      const pay = couponPerUnit * held;
      creditPlayerBondCurrency(world, bond, pay);
      result.couponsPaid += pay;
    }
    if (bond.lastCouponTurn !== turn) {
      bond.lastCouponTurn = turn;
    }
    if (maturing) {
      if (held > 0) {
        creditPlayerBondCurrency(world, bond, held * bond.faceValue);
      }
      bond.matured = true;
      bond.holders = [];
      bond.publicFloat = 0;
      bond.marketPrice = 1.0;
      bond.updatedAt = world.meta.date;
      result.matured++;
    } else {
      bond.updatedAt = world.meta.date;
    }
  }

  return result;
}

export type BuybackCorporateBondResult =
  { ok: true; units: number; cost: number; currencyCode: string } | { ok: false; error: string };

export interface CorporateBondBuybackQuote {
  available: boolean;
  reason?: string;
  currencyCode: string;
  issuerCurrencyCode: string;
  /** Pool ask for a unit, in the bond denomination. */
  askPerUnit: number;
  /** Issuer debit for one unit, in the corporation's current liquid currency. */
  issuerCostPerUnit: number;
}

export function quoteCorporateBondBuyback(world: WorldState, bond: Bond): CorporateBondBuybackQuote {
  const currencyCode = resolveBondCurrency(world, bond);
  const corp = bond.corporationId ? world.corporations[bond.corporationId] : undefined;
  const issuerCurrency = corp ? resolveCountryCurrency(world, corp.countryId) : currencyCode;
  const unavailable = (reason: string): CorporateBondBuybackQuote => ({
    available: false, reason, currencyCode, issuerCurrencyCode: issuerCurrency, askPerUnit: 0, issuerCostPerUnit: 0,
  });
  if (bond.issuerType !== "corporation" || !corp) return unavailable("Corporate issuer is unavailable");
  if (issuerCurrency !== currencyCode && world.featureFlags?.foreignExchange === false) {
    return unavailable("Foreign exchange is disabled for this corporation buyback");
  }
  const bondRate = nativeCurrencyRate(world, currencyCode);
  const issuerRate = nativeCurrencyRate(world, issuerCurrency);
  if (bondRate === undefined || issuerRate === undefined) {
    return unavailable("Exchange rate unavailable for corporate bond buyback");
  }
  if (![bond.marketPrice, bond.faceValue, corp.liquidCapital].every(Number.isFinite) || bond.faceValue <= 0 || corp.liquidCapital < 0) {
    return unavailable("Corporate buyback requires finite price and issuer cash");
  }
  const pool = nativeBondPoolForCurrency(world, currencyCode);
  const poolQuote = quoteNativeCorporateBondPool({
    marketPrice: bond.marketPrice,
    cashLocal: pool.cashLocal,
    targetCashLocal: pool.targetCashLocal,
    defaulted: bond.defaulted,
  });
  const askPerUnit = bond.defaulted ? bond.faceValue : Math.round(bond.faceValue * poolQuote.ask * 100) / 100;
  const issuerCostPerUnit = Math.round((askPerUnit / bondRate * issuerRate) * 100) / 100;
  if (![askPerUnit, issuerCostPerUnit].every(Number.isFinite) || askPerUnit < 0 || issuerCostPerUnit < 0) {
    return unavailable("Corporate buyback quote exceeds the supported finite range");
  }
  return { available: true, currencyCode, issuerCurrencyCode: issuerCurrency, askPerUnit, issuerCostPerUnit };
}

/**
 * Issuer buyback: retire float units at the current market price, funded from
 * the issuing corp's liquidCapital. Source: buyback/route.ts — cost is
 * units × face × marketPrice, publicFloat and totalIssued shrink by the
 * retired units/face, and full retirement with no holders closes the series
 * (matured, price back to par). Atomic: every check runs before any mutation.
 */
export function buybackCorporateBondUnits(
  world: WorldState,
  bondId: string,
  units: number,
): BuybackCorporateBondResult {
  const bond = world.bonds[bondId];
  if (!bond) {
    return { ok: false, error: `Unknown bond: ${bondId}` };
  }
  if (bond.issuerType !== "corporation") {
    return { ok: false, error: `Bond ${bondId} is not a corporate issue` };
  }
  if (bond.matured) {
    return { ok: false, error: `Bond ${bondId} has already matured` };
  }
  if (!Number.isInteger(units) || units <= 0) {
    return {
      ok: false,
      error: `buyback requires a positive integer units amount`,
    };
  }
  if (bond.publicFloat < units) {
    return {
      ok: false,
      error: `Only ${bond.publicFloat} units available in ${bond.id}'s public float`,
    };
  }
  const corp = bond.corporationId
    ? world.corporations[bond.corporationId]
    : undefined;
  if (!corp) {
    return {
      ok: false,
      error: `Corporate bond ${bondId} names unknown corporation ${bond.corporationId}`,
    };
  }
  const held = bond.holders.reduce((sum, h) => sum + (h.units ?? 0), 0);
  if (![bond.faceValue, bond.marketPrice, bond.publicFloat, bond.totalIssued, corp.liquidCapital, held].every(Number.isFinite)
    || bond.faceValue <= 0 || bond.marketPrice < 0 || held < 0
    || units > bond.publicFloat || units * BOND_UNIT_FACE_VALUE > bond.totalIssued) {
    return { ok: false, error: `Corporate bond ${bondId} has invalid cash, price, or outstanding-unit state` };
  }
  const quote = quoteCorporateBondBuyback(world, bond);
  if (!quote.available) return { ok: false, error: quote.reason ?? "Corporate buyback is unavailable" };
  // Game buys defaulted float at par; live issues pay the corporation pool
  // ask and convert into its current liquid currency through the USD anchor.
  const cost = Math.round(units * quote.issuerCostPerUnit * 100) / 100;
  if (corp.liquidCapital < cost) {
    return {
      ok: false,
      error: `Insufficient corporate funds. Need ${cost} ${quote.issuerCurrencyCode}, have ${corp.liquidCapital}`,
    };
  }

  const localCost = Math.round(units * quote.askPerUnit * 100) / 100;
  corp.liquidCapital -= cost;
  bond.publicFloat -= units;
  bond.totalIssued -= units * BOND_UNIT_FACE_VALUE;
  const pool = nativeBondPoolForCurrency(world, quote.currencyCode, true);
  pool.cashLocal = Math.round((pool.cashLocal + localCost) * 100) / 100;
  pool.lifetime.retiredIn = (pool.lifetime.retiredIn ?? 0) + localCost;
  if (held <= 0 && bond.publicFloat <= 0) {
    bond.matured = true;
    bond.defaulted = false;
    bond.marketPrice = 1.0;
  }
  bond.updatedAt = world.meta.date;
  return { ok: true, units, cost, currencyCode: quote.issuerCurrencyCode };
}
