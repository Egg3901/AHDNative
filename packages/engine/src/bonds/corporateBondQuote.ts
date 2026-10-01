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
import { DAYS_PER_TURN } from "../calendar.js";
import { TURNS_PER_DAY } from "../corporation/constants.js";
import { TURNS_PER_YEAR } from "./constants.js";

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
 * Once the plants demand ledger exists, use recorded realized plant receipts
 * (local currency per Native week) and the source daily/hourly/year basis:
 * Game's sector valuation divides daily profit by TURNS_PER_DAY then multiplies
 * by TURNS_PER_YEAR. Native's realized receipt spans DAYS_PER_TURN, so its
 * source-equivalent annual income is weekly profit / DAYS_PER_TURN /
 * TURNS_PER_DAY * TURNS_PER_YEAR. Pre-plants worlds keep their established
 * per-turn balance-sheet basis.
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
  const physicalAssets = Object.values(world.corporateSectors ?? {}).filter(
    (asset) => asset.corporationId === corporationId,
  );
  const plantsMode = world.plantMarketDemand !== undefined && physicalAssets.length > 0;
  const realizedWeeklyLocal = plantsMode
    ? physicalAssets.reduce((sum, asset) => {
      const realized = asset.realizedRevenue;
      return Number.isFinite(realized) && (realized ?? 0) >= 0 ? sum + (realized ?? 0) : Number.NaN;
    }, 0)
    : null;
  if (plantsMode && (!Number.isFinite(realizedWeeklyLocal) || !Number.isFinite(corp.effectiveProfitMargin))) {
    return { ...unavailable("Plant bond valuation requires finite realized sector receipts and margin", currencyCode), exchangeRate };
  }
  const sourceTurnsPerNativeTurn = plantsMode ? DAYS_PER_TURN * TURNS_PER_DAY : 1;
  const sectorRevenueLocal = plantsMode ? realizedWeeklyLocal! : corp.revenue;
  const incomePerSourceTurnLocal = plantsMode
    ? (sectorRevenueLocal * (corp.effectiveProfitMargin / 100)) / sourceTurnsPerNativeTurn
    : sectorRevenueLocal * (corp.effectiveProfitMargin / 100) - corp.currentGrowthCost;
  const annualIncomeLocal = incomePerSourceTurnLocal * TURNS_PER_YEAR;
  const sectorNpvLocal = annualIncomeLocal > 0 ? annualIncomeLocal / 0.15 : 0;
  const equityLocal = corp.liquidCapital + sectorNpvLocal;
  const totalEquityAnchor = equityLocal / exchangeRate;
  const existingDebtAnchor = existingDebtLocal / exchangeRate;
  const annualRevenueAnchor = (sectorRevenueLocal * TURNS_PER_YEAR / sourceTurnsPerNativeTurn) / exchangeRate;
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
