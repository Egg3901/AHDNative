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

// Source: AHDGame src/lib/db/types/budget.ts FederalTaxRates (federal subset)
export interface BudgetTaxRates {
  incomeTax: number; // percent 0..100
  domesticCorporateTax: number;
  foreignCorporateTax: number;
  payrollTax: number;
  tariffs: number;
  salesTax: number;
  /** DE rate applied to calculated income-tax receipts, not the income base. */
  solidaritySurcharge?: number;
}

// Source: src/lib/db/types/budget.ts FederalRevenue (subset)
export interface BudgetRevenue {
  incomeTax: number;
  domesticCorporateTax: number;
  foreignCorporateTax: number;
  payrollTax: number;
  tariffs: number;
  salesTax: number;
  /** Present only in authored DE budgets; earned on income-tax receipts. */
  solidaritySurcharge?: number;
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
 * One row per recorded budget country, including player and economy-preview entries.
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
   * economy/stateOwnershipConcentration.ts for the explicit source/Native
   * asset currency mapping and actual host-state ownership measurement.
   */
  stateOwnershipConcentration: number;
  stateOwnershipConcentrationUpdatedAtTurn?: number;
  /** Source FederalBudget.unionsBanned; absent on historical saves means no enacted ban. */
  unionsBanned?: boolean;
  /** Source FederalBudget.unionLawBias, -50 right-to-work to +50 collective bargaining. */
  unionLawBias?: number;
}

/**
 * Regional (state) budget — generic version.
 * Source: src/lib/turn/regionalBudget.ts BudgetCalculationInput/Result + StateBudget shape.
 * The generic processor covers the supported country rows. Japan's source
 * regional-budget subset uses its dedicated processor in budget/phases.ts;
 * schema v70 retains the source JP StatePolicy ladder and budget cost outputs.
 * Fiscal-only JP rows deliberately do not imply electoral Region entities or
 * new-character eligibility.
 */
export interface RegionalBudget {
  regionId: string;
  countryId: string;
  /** Japan's authored Local Allocation Tax option cost, in JPY per capita. Schema v70. */
  jpNationalGrantPerCapita?: number;
  /** Current source JP `State.population`, retained with the fiscal-only row. */
  jpPopulation?: number;
  /** Source JP `RegionalBudget.propertyValuePerCapita`, defaulting to ¥8m. */
  jpPropertyValuePerCapita?: number;
  /** Source JP `RegionalBudget.propertyValueBaseline`, defaulting to ¥8m. */
  jpPropertyValueBaseline?: number;
  /**
   * Source JP prefectural StatePolicy rows. The option ID/index and political
   * axes are retained because source forced austerity mutates this ladder.
   * Absent on historical rows; only fresh source rows seed center options.
   */
  jpRegionalPolicies?: import("./jpRegionalPolicyCatalog.js").JPRegionalPolicyState[];
  /** Annual source StatePolicy cost total, JPY. */
  jpEnactedPolicyCosts?: number;
  /** Annual state-subsidy cost total, JPY. */
  jpSubsidyCosts?: number;
  revenue: {
    councilTax: number;
    businessRates: number;
    grant: number;
    /** Japan source regional budget revenue lines (schema v70, absent on legacy rows). */
    jpResidentTax?: number;
    jpFixedAssetTax?: number;
    /**
     * Issue #100: regional (state-scope) tax revenue = Σ (phased rate% × the
     * region's GDP-derived tax base) for each enacted state tax. Source:
     * src/lib/utils/budgetCalculations.ts calculateStateRevenue + the
     * src/lib/budget/revenue.ts GDP base factors. 0 until a state-scope tax
     * bill enacts; folded into `total`.
     */
    stateTax?: number;
    /** State-authorized extraction-contract royalties, kept as a separate source revenue line. */
    resourceRoyalties?: number;
    total: number;
  };
  spending: {
    byCategory: Record<string, number>;
    total: number;
    /** Persistent regional survey spend, analogous to the source StateBudget line. */
    resourceProspecting?: number;
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

/**
 * Faithful snapshot of AHDGame `StateBudget` generated by
 * `generateStateBudgets` for the Nigerian source regions. Game multiplies the
 * authored State.gdp value by 1,000,000 and does not apply FX in this producer;
 * keep the original GDP denomination alongside those literal outputs so a
 * reader cannot mistake the stored fiscal amounts for converted NGN.
 * Optional by design: legacy saves do not contain this source budget family.
 */
export interface SourceStateBudgetSnapshot {
  source: "AHDGame.generateStateBudgets";
  fiscalYear: number;
  sourceFiscalYear: number;
  stateGdp: number;
  gdpInput: { amount: number; currencyCode: string; unit: "millions" };
  amountBasis: "literal-state-gdp-times-one-million-no-fx";
  /**
   * Last Game-shaped 75/25 corporate-profit base refresh. The income figures
   * are positive per-turn source operating income, annualized at 48 turns and
   * already expressed in the operating state's local accounting units. Absent
   * on the exact generation snapshot and on historical saves.
   */
  corporateTaxBaseUpdate?: {
    turn: number;
    domesticAnnualIncomeLocal: number;
    foreignAnnualIncomeLocal: number;
  };
  taxBases: {
    taxableIncome: number;
    taxableSales: number;
    domesticCorporateProfits: number;
    foreignCorporateProfits: number;
    propertyValue: number;
  };
  taxRates: {
    incomeTax: number;
    salesTax: number;
    domesticCorporateTax: number;
    foreignCorporateTax: number;
    propertyTax: number;
  };
  revenue: {
    incomeTax: number;
    salesTax: number;
    domesticCorporateTax: number;
    foreignCorporateTax: number;
    propertyTax: number;
    federalGrants: number;
    other: number;
    total: number;
  };
  spending: { byCategory: Record<string, number>; total: number };
  balance: number;
  surplus: number;
}
