/**
 * Japan's regional-budget formula from AHDGame
 * `src/lib/countries/jp/regionalBudget.ts#calculateJPRegionalBudget`.
 *
 * This pure kernel is kept separate from the generic regional processor. It
 * only qualifies the exact source formula; a live JP turn still requires the
 * source-shaped policy, ministry-allocation and austerity state producers.
 */
export interface JPRegionalBudgetInput {
  residentTaxRate: number;
  fixedAssetTaxRate: number;
  nationalGrantPerCapita: number;
  regionPopulation: number;
  medianIncome: number;
  propertyValueBase: number;
  nationalPopulation: number;
  ministerAllocation: number | null;
}

export interface JPRegionalBudgetResult {
  residentTaxRevenue: number;
  fixedAssetTaxRevenue: number;
  nationalGrant: number;
  totalBudget: number;
}

const JP_REGION_COUNT = 8;

/** Exact source formula: rate × per-capita base × local population, plus grant. */
export function calculateJPRegionalBudget(input: JPRegionalBudgetInput): JPRegionalBudgetResult {
  const residentTaxRevenue = input.residentTaxRate * input.medianIncome * input.regionPopulation;
  const fixedAssetTaxRevenue = input.fixedAssetTaxRate * input.propertyValueBase * input.regionPopulation;
  const nationalGrant = input.ministerAllocation ??
    (input.nationalGrantPerCapita * input.nationalPopulation) / JP_REGION_COUNT;
  return {
    residentTaxRevenue,
    fixedAssetTaxRevenue,
    nationalGrant,
    totalBudget: residentTaxRevenue + fixedAssetTaxRevenue + nationalGrant,
  };
}
