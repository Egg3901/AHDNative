export type CorporateCreditRating = "AAA" | "AA" | "A" | "BBB" | "BB" | "B" | "CCC";

export interface CorporateCreditComponents {
  debtToEquity: number;
  interestCoverage: number;
  profitability: number;
  liquidity: number;
}

export interface CorporateCreditScore {
  rating: CorporateCreditRating;
  compositeScore: number;
  components: CorporateCreditComponents;
}

const THRESHOLDS: readonly [number, CorporateCreditRating][] = [
  [85, "AAA"], [70, "AA"], [55, "A"], [40, "BBB"], [25, "BB"], [15, "B"], [0, "CCC"],
];

const SCORE_THRESHOLDS: readonly [number, CorporateCreditRating][] = [
  [85, "AAA"], [70, "AA"], [55, "A"], [40, "BBB"], [25, "BB"], [15, "B"], [0, "CCC"],
];
const CREDIT_RATINGS: readonly CorporateCreditRating[] = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC"];
export const CORPORATE_DEFAULT_CREDIT_PENALTY_TURNS = 96;

/** Exact Game `calculateCreditScore`; this is a turn producer (not the conservative bond-quote variant). */
export function calculateSourceCorporateCreditScore(input: {
  liquidCapitalAnchor: number;
  totalDebtAnchor: number;
  annualIncomeAnchor: number;
  annualInterestAnchor: number;
  totalEquityAnchor: number;
  previousCompositeScore?: number;
  bondDefaultCreditPenaltyActive?: boolean;
  insiderConcentrationPenalty?: boolean;
  indexInclusionUpgrade?: boolean;
}): CorporateCreditScore {
  const values = [input.liquidCapitalAnchor, input.totalDebtAnchor, input.annualIncomeAnchor,
    input.annualInterestAnchor, input.totalEquityAnchor];
  if (!values.every(Number.isFinite) || input.totalDebtAnchor < 0 || input.annualInterestAnchor < 0) {
    throw new Error("Corporate credit inputs must be finite and debt/interest non-negative");
  }
  const debtRatio = input.totalEquityAnchor > 0 ? input.totalDebtAnchor / input.totalEquityAnchor : input.totalDebtAnchor > 0 ? 10 : 0;
  const debtToEquity = Math.max(0, Math.min(100, 100 - (debtRatio / 3) * 100));
  const coverage = input.annualInterestAnchor > 0 ? input.annualIncomeAnchor / input.annualInterestAnchor : input.annualIncomeAnchor > 0 ? 10 : 5;
  const interestCoverage = Math.max(0, Math.min(100, coverage * 20));
  const roe = input.totalEquityAnchor > 0 ? input.annualIncomeAnchor / input.totalEquityAnchor : 0;
  const profitability = roe >= 0 ? Math.min(100, 40 + roe * 350)
    : Math.max(5, 40 - 50 * Math.sqrt(Math.min(Math.abs(roe), 1)));
  const liquidityRatio = input.annualInterestAnchor > 0 ? input.liquidCapitalAnchor / input.annualInterestAnchor : input.liquidCapitalAnchor > 0 ? 5 : 0;
  const liquidity = Math.max(0, Math.min(100, 20 + liquidityRatio * 40));
  const raw = Math.round(debtToEquity * 0.3 + interestCoverage * 0.25 + profitability * 0.25 + liquidity * 0.2);
  const prior = input.previousCompositeScore;
  let compositeScore = typeof prior === "number" && Number.isFinite(prior) && prior > 0
    ? Math.round(0.75 * raw + 0.25 * prior) : raw;
  let rating = SCORE_THRESHOLDS.find(([threshold]) => compositeScore >= threshold)![1];
  if (input.bondDefaultCreditPenaltyActive) {
    rating = "CCC";
    compositeScore = Math.min(compositeScore, 12);
  } else {
    const notches = (input.insiderConcentrationPenalty ? 1 : 0) - (input.indexInclusionUpgrade ? 1 : 0);
    if (notches !== 0) rating = CREDIT_RATINGS[Math.max(0, Math.min(CREDIT_RATINGS.length - 1, CREDIT_RATINGS.indexOf(rating) + notches))]!;
  }
  return {
    rating,
    compositeScore,
    components: {
      debtToEquity: Math.round(debtToEquity),
      interestCoverage: Math.round(interestCoverage),
      profitability: Math.round(profitability),
      liquidity: Math.round(liquidity),
    },
  };
}

/**
 * AHDGame `src/lib/constants/bonds.ts` calculateCreditScore, copied formula
 * for the Native issuer values available at the public action/turn seam.
 * Market-price inputs use the source bondTurn conservative zero-income path;
 * issuance passes current modeled net income. Native has a single-sector
 * issuer, so equity is cash plus the source bondTurn 10% quoted market-cap
 * proxy rather than the Game route's multi-sector NPV aggregation.
 */
export function calculateNativeCorporateCreditRating(input: {
  liquidCapital: number;
  totalDebt: number;
  annualIncome: number;
  annualInterestPayments: number;
  totalEquity: number;
}): CorporateCreditRating {
  const { liquidCapital, totalDebt, annualIncome, annualInterestPayments, totalEquity } = input;
  if (![liquidCapital, totalDebt, annualIncome, annualInterestPayments, totalEquity].every(Number.isFinite)) {
    throw new Error("Corporate credit inputs must be finite");
  }
  if (totalDebt < 0 || annualInterestPayments < 0) {
    throw new Error("Corporate debt and interest inputs cannot be negative");
  }
  const deRatio = totalEquity > 0 ? totalDebt / totalEquity : totalDebt > 0 ? 10 : 0;
  const debtToEquity = Math.max(0, Math.min(100, 100 - (deRatio / 3) * 100));
  const coverage = annualInterestPayments > 0 ? annualIncome / annualInterestPayments : annualIncome > 0 ? 10 : 5;
  const interestCoverage = Math.max(0, Math.min(100, coverage * 20));
  const roe = totalEquity > 0 ? annualIncome / totalEquity : 0;
  const profitability = roe >= 0
    ? Math.min(100, 40 + roe * 350)
    : Math.max(5, 40 - 50 * Math.sqrt(Math.min(Math.abs(roe), 1)));
  const liquidityRatio = annualInterestPayments > 0 ? liquidCapital / annualInterestPayments : liquidCapital > 0 ? 5 : 0;
  const liquidity = Math.max(0, Math.min(100, 20 + liquidityRatio * 40));
  const score = Math.round(debtToEquity * 0.3 + interestCoverage * 0.25 + profitability * 0.25 + liquidity * 0.2);
  return THRESHOLDS.find(([threshold]) => score >= threshold)![1];
}

export function corporateRatingSpread(rating: CorporateCreditRating): number {
  return { AAA: 0, AA: 0.5, A: 1.5, BBB: 3, BB: 5, B: 8, CCC: 12 }[rating];
}

/** Source-derived three inputs: debt/equity 1:5, no current income, 50k annual interest. */
export const CORPORATE_CREDIT_SOURCE_VECTOR = {
  input: { liquidCapital: 2_000_000, totalDebt: 1_000_000, annualIncome: 0, annualInterestPayments: 50_000, totalEquity: 5_000_000 },
  rating: "A" as const,
  currentRateAtPrime3: 5.5,
  priceAtCoupon5And240Turns: 0.9786,
};
