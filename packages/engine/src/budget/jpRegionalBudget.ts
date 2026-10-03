/**
 * Japan's regional-budget formula from AHDGame
 * `src/lib/countries/jp/regionalBudget.ts#calculateJPRegionalBudget`.
 *
 * This pure kernel is kept separate from the generic regional processor. It
 * provides the supported source revenue and allocation path. Source regional
 * spending-policy records, subsidy costs, and forced austerity remain outside
 * this represented subset.
 */
import { getPackByEra } from "@ahdclient/content";
import type { RegionalBudget } from "./types.js";
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
export const JP_RESIDENT_TAX_MEDIAN_INCOME_FALLBACK = 4_400_000;
export const JP_PROPERTY_VALUE_PER_CAPITA_FALLBACK = 8_000_000;

export function jpRegionalBudgetDefaults(era: string): {
  residentTaxRatePercent: number;
  fixedAssetTaxRatePercent: number;
  nationalGrantPerCapita: number;
} {
  if (era === "1953" || era === "1979") {
    return { residentTaxRatePercent: 8, fixedAssetTaxRatePercent: 1.4, nationalGrantPerCapita: 128_000 };
  }
  if (era === "1991" || era === "2019") {
    return { residentTaxRatePercent: 10, fixedAssetTaxRatePercent: 1.4, nationalGrantPerCapita: 128_000 };
  }
  // The source JP seed path writes each regional policy at its center option
  // for every preset, even when that preset's national policy config has no
  // authored JP row. The inherited national JP budget selects the same center
  // Local Allocation Tax option (¥128,000 per capita).
  if (era === "1999" || era === "2007" || era === "2023") {
    return { residentTaxRatePercent: 10, fixedAssetTaxRatePercent: 1.4, nationalGrantPerCapita: 128_000 };
  }
  throw new Error(`No source JP regional-budget policy defaults for era ${era}`);
}

/**
 * Build the source background country's initial fiscal rows from its immutable
 * eight-region pack. This does not create electoral Region entities, policies,
 * cabinet membership, or an allocation choice.
 */
export function createJPRegionalBudgetRows(era: string): Record<string, RegionalBudget> {
  const pack = getPackByEra(era);
  const sourceRegions = [...(pack?.states ?? []), ...(pack?.economyRegions ?? [])]
    .filter((candidate) => candidate.countryId === "JP");
  if (sourceRegions.length === 0) return {};
  if (sourceRegions.length !== JP_REGION_COUNT || new Set(sourceRegions.map((row) => row.id)).size !== JP_REGION_COUNT) {
    throw new Error(`Expected ${JP_REGION_COUNT} unique source JP budget regions for era ${era}`);
  }

  const nationalPopulation = sourceRegions.reduce((sum, candidate) => sum + candidate.population, 0);
  const policy = jpRegionalBudgetDefaults(era);
  const rows: Record<string, RegionalBudget> = {};
  for (const region of sourceRegions) {
    const result = calculateJPRegionalBudget({
      residentTaxRate: policy.residentTaxRatePercent / 100,
      fixedAssetTaxRate: policy.fixedAssetTaxRatePercent / 100,
      nationalGrantPerCapita: policy.nationalGrantPerCapita,
      regionPopulation: region.population,
      medianIncome: JP_RESIDENT_TAX_MEDIAN_INCOME_FALLBACK,
      propertyValueBase: JP_PROPERTY_VALUE_PER_CAPITA_FALLBACK,
      nationalPopulation,
      ministerAllocation: null,
    });
    rows[region.id] = {
      regionId: region.id,
      countryId: "JP",
      jpNationalGrantPerCapita: policy.nationalGrantPerCapita,
      taxRates: {
        residentTax: policy.residentTaxRatePercent,
        fixedAssetTax: policy.fixedAssetTaxRatePercent,
      },
      revenue: {
        councilTax: 0,
        businessRates: 0,
        jpResidentTax: result.residentTaxRevenue,
        jpFixedAssetTax: result.fixedAssetTaxRevenue,
        grant: result.nationalGrant,
        total: result.totalBudget,
      },
      spending: { byCategory: {}, total: 0 },
      balance: result.totalBudget,
      consecutiveDeficits: 0,
    };
  }
  return rows;
}

/**
 * Recompute one recorded JP prefectural budget from inputs Native can
 * currently represent. Missing fiscal fields use the source center-option
 * defaults seeded by Game; source regional spending-policy records, subsidy
 * costs, and forced austerity remain explicit limitations.
 */
export function processJPRegionalBudget(world: import("../types.js").WorldState, regionId: string): boolean {
  const pack = getPackByEra(world.meta.era);
  const sourceRegions = [...(pack?.states ?? []), ...(pack?.economyRegions ?? [])]
    .filter((candidate) => candidate.countryId === "JP");
  const region = sourceRegions.find((candidate) => candidate.id === regionId);
  const row = world.regionalBudgets[regionId];
  if (!region || !row || row.countryId !== "JP") return false;

  const nationalPopulation = sourceRegions.reduce((sum, candidate) => sum + candidate.population, 0);
  const population = region.population ?? 0;
  if (!(nationalPopulation > 0) || !(population >= 0)) return false;

  const policy = jpRegionalBudgetDefaults(world.meta.era);
  const residentTaxRatePercent = row.taxRates?.residentTax ?? policy.residentTaxRatePercent;
  const fixedAssetTaxRatePercent = row.taxRates?.fixedAssetTax ?? policy.fixedAssetTaxRatePercent;
  const nationalGrantPerCapita = row.jpNationalGrantPerCapita ?? policy.nationalGrantPerCapita;
  row.jpNationalGrantPerCapita = nationalGrantPerCapita;
  row.taxRates = {
    ...row.taxRates,
    residentTax: residentTaxRatePercent,
    fixedAssetTax: fixedAssetTaxRatePercent,
  };
  const allocation = world.jpRegionalBudgetAllocation?.allocationPercents;
  const nationalGrantPool = nationalGrantPerCapita * nationalPopulation;
  const ministerAllocation = allocation
    ? ((allocation[regionId] ?? 100 / JP_REGION_COUNT) / 100) * nationalGrantPool
    : null;
  const residentTaxRate = residentTaxRatePercent / 100;
  const fixedAssetTaxRate = fixedAssetTaxRatePercent / 100;
  const medianIncome = world.regionalMetrics[regionId]?.["economic.medianIncome"]?.value
    ?? JP_RESIDENT_TAX_MEDIAN_INCOME_FALLBACK;
  const result = calculateJPRegionalBudget({
    residentTaxRate,
    fixedAssetTaxRate,
    nationalGrantPerCapita,
    regionPopulation: population,
    medianIncome,
    propertyValueBase: JP_PROPERTY_VALUE_PER_CAPITA_FALLBACK,
    nationalPopulation,
    ministerAllocation,
  });

  row.revenue.jpResidentTax = result.residentTaxRevenue;
  row.revenue.jpFixedAssetTax = result.fixedAssetTaxRevenue;
  row.revenue.councilTax = 0;
  row.revenue.businessRates = 0;
  row.revenue.grant = result.nationalGrant;
  row.revenue.total = result.residentTaxRevenue + result.fixedAssetTaxRevenue + result.nationalGrant
    + (row.revenue.resourceRoyalties ?? 0);
  // Native does not yet persist the JP StatePolicy/LegislationType spending
  // rows consumed by Game. Preserve explicitly represented row spending and
  // do not apportion national categories as a substitute for those policies.
  row.balance = row.revenue.total - row.spending.total;
  row.consecutiveDeficits = row.balance < 0 ? row.consecutiveDeficits + 1 : 0;
  return true;
}

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
