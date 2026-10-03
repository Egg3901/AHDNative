import { describe, expect, it } from "vitest";
import { calculateSourceCorporateCreditScore } from "./corporateCredit.js";

describe("Game turn-time corporate credit score", () => {
  it("matches the pinned source debt/equity, coverage, profitability and liquidity vector", () => {
    const score = calculateSourceCorporateCreditScore({
      liquidCapitalAnchor: 2_000_000,
      totalDebtAnchor: 1_000_000,
      annualIncomeAnchor: 0,
      annualInterestAnchor: 50_000,
      totalEquityAnchor: 5_000_000,
    });
    expect(score).toEqual({
      rating: "A",
      compositeScore: 58,
      components: { debtToEquity: 93, interestCoverage: 0, profitability: 40, liquidity: 100 },
    });
  });

  it("persists the 75/25 prior-score smoothing and applies default/inclusion notches once", () => {
    const score = calculateSourceCorporateCreditScore({
      liquidCapitalAnchor: 2_000_000,
      totalDebtAnchor: 1_000_000,
      annualIncomeAnchor: 0,
      annualInterestAnchor: 50_000,
      totalEquityAnchor: 5_000_000,
      previousCompositeScore: 70,
      indexInclusionUpgrade: true,
    });
    expect(score.compositeScore).toBe(61);
    expect(score.rating).toBe("AA");
    const defaulted = calculateSourceCorporateCreditScore({
      liquidCapitalAnchor: 2_000_000,
      totalDebtAnchor: 1_000_000,
      annualIncomeAnchor: 0,
      annualInterestAnchor: 50_000,
      totalEquityAnchor: 5_000_000,
      bondDefaultCreditPenaltyActive: true,
      indexInclusionUpgrade: true,
    });
    expect(defaulted).toMatchObject({ rating: "CCC", compositeScore: 12 });
  });
});
