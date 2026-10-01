import type { WorldState } from "../types.js";
import {
  CORPORATE_BOND_ISSUANCE_COOLDOWN_TURNS,
  CORPORATE_BOND_MAX_EXIT_LEVERAGE,
  CORPORATE_BOND_MAX_LEVERAGE,
  CORPORATE_BOND_MIN_HEADROOM,
  CORPORATE_BOND_MIN_PER_ISSUE_CAP,
  CORPORATE_BOND_REVENUE_CAP_FRACTION,
  isCorpStateOwned,
} from "./corporateBonds.js";
import { calculateNativeCorporateCreditRating, corporateRatingSpread } from "./corporateCredit.js";
import { resolveCountryCurrency } from "./denomination.js";

export interface CorporateBondIssuanceQuote {
  available: boolean;
  reason?: string;
  currencyCode: string;
  /** Local currency units per USD accounting-anchor unit. */
  exchangeRate: number;
  /** USD accounting anchor. */
  minimumFaceValue: number;
  /** USD accounting anchor. */
  maximumFaceValue: number;
  cooldownTurnsRemaining: number;
  creditRating: string;
  couponRates: Record<96 | 240 | 336, number>;
}

/**
 * Public issuance preview used by both the Markets DTO and action validator.
 * Mirrors Game's public corporate-bond GET/POST economics over Native's
 * supported one-sector balance sheet. Native revenue/growth cost are per-turn
 * values; Game's corporate-sector revenue is daily and callers divide its
 * profit by TURNS_PER_DAY before multiplying by TURNS_PER_YEAR. Mapping a
 * Native turn to Game's TURNS_PER_DAY units cancels that division, so both
 * value the single sector as positive per-turn profit × 48 / 15%.
 */
export function quoteCorporateBondIssuance(world: WorldState, corporationId: string): CorporateBondIssuanceQuote {
  const unavailable = (reason: string, currencyCode = "USD"): CorporateBondIssuanceQuote => ({
    available: false, reason, currencyCode, exchangeRate: 1, minimumFaceValue: 100_000,
    maximumFaceValue: 0, cooldownTurnsRemaining: 0, creditRating: "CCC",
    couponRates: { 96: 0, 240: 0, 336: 0 },
  });
  const corp = world.corporations[corporationId];
  if (!corp) return unavailable(`Unknown corporation: ${corporationId}`);
  const currencyCode = resolveCountryCurrency(world, corp.countryId);
  if (corp.ceoType !== "player" || corp.ceoId !== "player" || corp.ceoVacant === true) {
    return unavailable("Only the active CEO may issue corporation bonds", currencyCode);
  }
  if (isCorpStateOwned(corp) || corp.suspended) {
    return unavailable("Only active private corporations may issue bonds", currencyCode);
  }
  const latestIssueTurn = Object.values(world.bonds)
    .filter((bond) => bond.issuerType === "corporation" && bond.corporationId === corporationId)
    .reduce((latest, bond) => Math.max(latest, bond.issuedAtTurn), -Infinity);
  const cooldownTurnsRemaining = Number.isFinite(latestIssueTurn)
    ? Math.max(0, latestIssueTurn + CORPORATE_BOND_ISSUANCE_COOLDOWN_TURNS - world.meta.turn)
    : 0;
  const forexEnabled = world.featureFlags?.foreignExchange !== false;
  const exchangeRate = currencyCode === "USD" && world.exchangeRates?.[corp.countryId] === undefined
    ? 1 : world.exchangeRates?.[corp.countryId]?.rate;
  if (!forexEnabled && currencyCode !== "USD") return unavailable("Foreign-currency corporate issuance is not available while foreign exchange is disabled", currencyCode);
  if (typeof exchangeRate !== "number" || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    return unavailable(`Exchange rate unavailable for ${currencyCode}`, currencyCode);
  }
  if (![corp.liquidCapital, corp.revenue, corp.effectiveProfitMargin, corp.currentGrowthCost, corp.sharePrice, corp.totalShares].every(Number.isFinite)
    || corp.liquidCapital < 0 || corp.revenue < 0 || corp.sharePrice < 0 || corp.totalShares < 0) {
    return unavailable("Corporate bond issuance requires finite, non-negative cash, revenue, and equity inputs", currencyCode);
  }

  const issuerBonds = Object.values(world.bonds).filter(
    (bond) => bond.issuerType === "corporation" && bond.corporationId === corporationId && !bond.matured,
  );
  if (issuerBonds.some((bond) => !Number.isFinite(bond.totalIssued) || bond.totalIssued < 0 || !Number.isFinite(bond.couponRate) || bond.couponRate < 0)) {
    return unavailable("Corporate bond liabilities must be finite and non-negative", currencyCode);
  }
  const existingDebtLocal = issuerBonds.reduce((sum, bond) => sum + bond.totalIssued, 0);
  const incomePerTurnLocal = corp.revenue * (corp.effectiveProfitMargin / 100) - corp.currentGrowthCost;
  const annualIncomeLocal = incomePerTurnLocal * 48;
  const sectorNpvLocal = annualIncomeLocal > 0 ? annualIncomeLocal / 0.15 : 0;
  const equityLocal = corp.liquidCapital + sectorNpvLocal;
  const totalEquityAnchor = equityLocal / exchangeRate;
  const existingDebtAnchor = existingDebtLocal / exchangeRate;
  const annualRevenueAnchor = (corp.revenue * 48) / exchangeRate;
  const annualInterestLocal = issuerBonds.reduce((sum, bond) => sum + (bond.couponRate / 100) * bond.totalIssued, 0);
  if (![existingDebtLocal, equityLocal, totalEquityAnchor, existingDebtAnchor, annualRevenueAnchor, annualIncomeLocal, annualInterestLocal].every(Number.isFinite)) {
    return { ...unavailable("Corporate bond credit inputs exceed the supported finite range", currencyCode), exchangeRate };
  }
  const perIssueCapAnchor = Math.max(CORPORATE_BOND_MIN_PER_ISSUE_CAP, annualRevenueAnchor * CORPORATE_BOND_REVENUE_CAP_FRACTION);
  const maximumFaceValue = Math.max(0, Math.min(
    perIssueCapAnchor,
    totalEquityAnchor * CORPORATE_BOND_MAX_LEVERAGE - existingDebtAnchor,
    totalEquityAnchor * CORPORATE_BOND_MAX_EXIT_LEVERAGE - existingDebtAnchor,
  ));
  if (maximumFaceValue < CORPORATE_BOND_MIN_HEADROOM) {
    return { ...unavailable("Corporate has insufficient debt headroom", currencyCode), exchangeRate, cooldownTurnsRemaining, maximumFaceValue };
  }

  const rating = calculateNativeCorporateCreditRating({
    liquidCapital: corp.liquidCapital,
    totalDebt: existingDebtLocal,
    annualIncome: annualIncomeLocal,
    annualInterestPayments: annualInterestLocal,
    totalEquity: equityLocal,
  });
  const primeRate = world.centralBanks[corp.countryId]?.primeRate ?? 3;
  if (!Number.isFinite(primeRate)) return { ...unavailable("Corporate bond prime rate is invalid", currencyCode), exchangeRate };
  const couponRate = (termPremium: number) =>
    Math.round((primeRate + corporateRatingSpread(rating) + 1 + termPremium) * 100) / 100;
  return {
    available: cooldownTurnsRemaining === 0,
    ...(cooldownTurnsRemaining > 0 ? { reason: `Bond issuance on cooldown. ${cooldownTurnsRemaining} turns remaining.` } : {}),
    currencyCode,
    exchangeRate,
    minimumFaceValue: 100_000,
    maximumFaceValue,
    cooldownTurnsRemaining,
    creditRating: rating,
    couponRates: { 96: couponRate(0), 240: couponRate(1), 336: couponRate(1.75) },
  };
}
