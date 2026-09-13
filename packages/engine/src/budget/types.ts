/**
 * Budget types — solo port of src/lib/db/types/budget.ts (FederalBudget subset)
 * and src/lib/budget/revenue/spending primitives.
 *
 * Fiscal amounts are in local currency absolute units (same unit as gdp,
 * which is millions in EconomySeed but absolute in budget docs — we keep
 * absolute for all budget math). Sources cited per field.
 */

// Source: src/lib/db/types/budget.ts FederalTaxBases
export interface BudgetTaxBases {
  taxableIncome: number;
  domesticCorporateProfits: number;
  foreignCorporateProfits: number;
  wagesAndSalaries: number;
  importValue: number;
  taxableSales: number;
}

// Source: src/lib/db/types/budget.ts FederalTaxRates (federal subset; no CN/DE/IE surcharges — deferred)
export interface BudgetTaxRates {
  incomeTax: number; // percent 0..100
  domesticCorporateTax: number;
  foreignCorporateTax: number;
  payrollTax: number;
  tariffs: number;
  salesTax: number;
}

// Source: src/lib/db/types/budget.ts FederalRevenue (subset)
export interface BudgetRevenue {
  incomeTax: number;
  domesticCorporateTax: number;
  foreignCorporateTax: number;
  payrollTax: number;
  tariffs: number;
  salesTax: number;
  other: number;
  total: number;
}

// Source: src/lib/db/types/budget.ts FederalSpending
export interface BudgetSpending {
  byCategory: Record<string, number>;
  stateGrants: number;
  debtInterest: number;
  total: number;
}

// Source: src/lib/db/types/budget.ts debt subset
export interface BudgetDebt {
  principal: number;
  interestRate: number;
  ceiling: number;
}

// Source: src/lib/db/types/budget.ts EconomicGrowthFactors (subset)
export interface BudgetEconomicFactors {
  gdpGrowth: number;
  wageGrowth: number;
  inflationRate: number;
  tradeGrowth: number;
}

export type CreditRating = "AAA" | "AA" | "A" | "BBB" | "BB" | "B" | "CCC";

/**
 * Country-level budget — solo analogue of FederalBudget.
 * One row per playable country (US/UK/RU/DD) plus economy-preview entries.
 * Cited: src/lib/db/types/budget.ts FederalBudget, src/lib/seeds/reference/budgets.ts NATIONAL_BUDGET_SEED_CONFIGS_1953
 */
export interface CountryBudget {
  countryId: string;
  fiscalYear: number;
  gdp: number; // absolute local currency
  population: number;
  currencyCode: string;
  taxRates: BudgetTaxRates;
  taxBases: BudgetTaxBases;
  /** Pending tax-rate ramps: taxType -> target rate (%). Ticket #1102 phase-in, see taxRatePhaseIn.ts. Schema v41. */
  taxRatePhaseIn?: Partial<Record<keyof BudgetTaxRates, number>>;
  revenue: BudgetRevenue;
  spending: BudgetSpending;
  debt: BudgetDebt;
  surplus: number; // revenue.total - spending.total (cached, see invariants)
  treasuryBalance: number; // -debt.principal at seed; then surplus accumulates via fiscalYear
  creditRating: CreditRating;
  economicFactors: BudgetEconomicFactors;
  // Optional baseline spend for fallback
  baselineSpendingByCategory?: Record<string, number>;
  /** Policy-law delta from the authored baseline, rebuilt from the active law book. */
  policySpendingByCategory?: Record<string, number>;
  baselineStateGrants?: number;
  /** W6: investor confidence 0-100, baseline 70, decays 5%/turn when below. Source: nationalization/constants.ts */
  investorConfidence?: number;
  investorConfidenceUpdatedAtTurn?: number;
  /** W6: debtToGdpRatio mirror for governance.debtToGdp (optional, not computed until fiscal wave) */
  debtToGdpRatio?: number;
  /**
   * W14: State Ownership Concentration Index, 0..100. Ports
   * src/lib/nationalization/concentration.ts's stored
   * FederalBudget.stateOwnershipConcentration field. See
   * economy/stateOwnershipConcentration.ts file doc for the plannedShare
   * substitution (AHDClient has no per-corp nationalization flag). 0 for every
   * market country; only RU/DD carry a live value.
   */
  stateOwnershipConcentration: number;
}

/**
 * Regional (state) budget — generic version.
 * Source: src/lib/turn/regionalBudget.ts BudgetCalculationInput/Result + StateBudget shape.
 * JP/DE country-specific variants are unported (issue #103); see regionalBudget.ts.
 * JP and DE are playable in the 1991 and 2019 packs and use the generic processor.
 */
export interface RegionalBudget {
  regionId: string;
  countryId: string;
  revenue: {
    councilTax: number;
    businessRates: number;
    grant: number;
    /**
     * Issue #100: regional (state-scope) tax revenue = Σ (phased rate% × the
     * region's GDP-derived tax base) for each enacted state tax. Source:
     * src/lib/utils/budgetCalculations.ts calculateStateRevenue + the
     * src/lib/budget/revenue.ts GDP base factors. 0 until a state-scope tax
     * bill enacts; folded into `total`.
     */
    stateTax?: number;
    total: number;
  };
  spending: {
    byCategory: Record<string, number>;
    total: number;
  };
  balance: number; // revenue.total - spending.total
  consecutiveDeficits: number;
  /**
   * Issue #100: enacted state-scope tax rates (%) by tax type, keyed like the
   * national BudgetTaxRates (e.g. "incomeTax"). Source: src/lib/db/types/budget.ts
   * StateTaxRates (subset) written by applyTaxRateChange scope "state".
   * Written by legislation/billLifecycle.ts applyBillEffects and walked by
   * budget/phases.ts regionalBudgetProcessingPhase. Absent/empty until a
   * state-scope tax bill enacts.
   */
  taxRates?: Record<string, number>;
  /**
   * Issue #100: pending state tax-rate ramps: taxType -> target rate (%).
   * Ticket #1102 one-point-per-turn phase-in, walked by
   * regionalBudgetProcessingPhase via advanceTaxRatePhaseIn (see
   * budget/taxRatePhaseIn.ts). Absent/empty when no ramp is running.
   */
  taxRatePhaseIn?: Record<string, number>;
}
