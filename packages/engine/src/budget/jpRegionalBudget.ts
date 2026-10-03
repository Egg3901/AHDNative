/**
 * Japan's regional-budget formula from AHDGame
 * `src/lib/countries/jp/regionalBudget.ts#calculateJPRegionalBudget`.
 *
 * The pure kernel is separate from the generic regional processor. The JP
 * processor retains regional policy options, subsidy costs, property bases,
 * minister allocation choices, and the source two-deficit austerity writes.
 */
import { getPackByEra } from "@ahdclient/content";
import type { RegionalBudget } from "./types.js";
import {
  createJPRegionalPolicyState,
  JP_REGIONAL_POLICY_CATALOG,
  JP_REGIONAL_TAX_POLICY_IDS,
  type JPRegionalPolicyState,
} from "./jpRegionalPolicyCatalog.js";
import { calculateStateSubsidyCostForRegion } from "./subsidyBudget.js";
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
export const JP_ENACTED_POLICIES_SPENDING_KEY = "jpEnactedPolicies";

function jpPolicyOption(row: RegionalBudget, legislationTypeId: string) {
  const statePolicy = row.jpRegionalPolicies?.find((policy) => policy.legislationTypeId === legislationTypeId);
  if (!statePolicy || statePolicy.policyOptionId !== `${legislationTypeId}_opt_${statePolicy.policyOptionIndex}`) return undefined;
  return JP_REGIONAL_POLICY_CATALOG.find((law) => law.id === legislationTypeId)?.options[statePolicy.policyOptionIndex];
}

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
 * eight-region pack and its authored policy options. This does not create
 * electoral Region entities, cabinet membership, or an allocation choice.
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
  const regionalPolicies = createJPRegionalPolicyState();
  const policyCostPerCapita = regionalPolicies.reduce((sum, statePolicy) => {
    const law = JP_REGIONAL_POLICY_CATALOG.find(({ id }) => id === statePolicy.legislationTypeId);
    return sum + (law?.options[statePolicy.policyOptionIndex]?.annualCostPerCapita ?? 0);
  }, 0);
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
      jpPopulation: region.population,
      jpPropertyValuePerCapita: JP_PROPERTY_VALUE_PER_CAPITA_FALLBACK,
      jpPropertyValueBaseline: JP_PROPERTY_VALUE_PER_CAPITA_FALLBACK,
      taxRates: {
        residentTax: policy.residentTaxRatePercent,
        fixedAssetTax: policy.fixedAssetTaxRatePercent,
      },
      jpRegionalPolicies: structuredClone(regionalPolicies),
      jpEnactedPolicyCosts: policyCostPerCapita * region.population,
      jpSubsidyCosts: 0,
      revenue: {
        councilTax: 0,
        businessRates: 0,
        jpResidentTax: result.residentTaxRevenue,
        jpFixedAssetTax: result.fixedAssetTaxRevenue,
        grant: result.nationalGrant,
        total: result.totalBudget,
      },
      spending: {
        byCategory: { [JP_ENACTED_POLICIES_SPENDING_KEY]: policyCostPerCapita * region.population },
        total: policyCostPerCapita * region.population,
      },
      balance: result.totalBudget - policyCostPerCapita * region.population,
      consecutiveDeficits: 0,
    };
  }
  return rows;
}

/**
 * Recompute one JP prefectural budget from its source-shaped regional tax,
 * StatePolicy, subsidy, and allocation inputs.
 */
export function processJPRegionalBudget(world: import("../types.js").WorldState, regionId: string): boolean {
  const pack = getPackByEra(world.meta.era);
  const sourceRegions = [...(pack?.states ?? []), ...(pack?.economyRegions ?? [])]
    .filter((candidate) => candidate.countryId === "JP");
  const region = sourceRegions.find((candidate) => candidate.id === regionId);
  const row = world.regionalBudgets[regionId];
  if (!region || !row || row.countryId !== "JP") return false;

  const currentPopulation = (sourceRegionId: string, packPopulation: number): number =>
    world.regions[sourceRegionId]?.population ?? world.regionalBudgets[sourceRegionId]?.jpPopulation ?? packPopulation;
  const nationalPopulation = sourceRegions.reduce(
    (sum, candidate) => sum + currentPopulation(candidate.id, candidate.population),
    0,
  );
  const population = currentPopulation(regionId, region.population ?? 0);
  if (!(nationalPopulation > 0) || !(population >= 0)) return false;
  row.jpPopulation = population;

  const policy = jpRegionalBudgetDefaults(world.meta.era);
  const regionalPolicies = row.jpRegionalPolicies ?? [];
  const residentTaxRatePercent = jpPolicyOption(row, "jp_resident_tax")?.rate ?? row.taxRates?.residentTax ?? policy.residentTaxRatePercent;
  const fixedAssetTaxRatePercent = jpPolicyOption(row, "jp_fixed_asset_tax")?.rate ?? row.taxRates?.fixedAssetTax ?? policy.fixedAssetTaxRatePercent;
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
  const propertyValuePerCapita = row.jpPropertyValuePerCapita ?? JP_PROPERTY_VALUE_PER_CAPITA_FALLBACK;
  const propertyValueBaseline = row.jpPropertyValueBaseline ?? JP_PROPERTY_VALUE_PER_CAPITA_FALLBACK;
  row.jpPropertyValuePerCapita = propertyValuePerCapita;
  row.jpPropertyValueBaseline = propertyValueBaseline;
  const result = calculateJPRegionalBudget({
    residentTaxRate,
    fixedAssetTaxRate,
    nationalGrantPerCapita,
    regionPopulation: population,
    medianIncome,
    propertyValueBase: propertyValuePerCapita,
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
  let enactedPolicyCosts = 0;
  const policiesWithCost = regionalPolicies.flatMap((statePolicy, sourceOrder) => {
    if (JP_REGIONAL_TAX_POLICY_IDS.has(statePolicy.legislationTypeId)) return [];
    const law = JP_REGIONAL_POLICY_CATALOG.find(({ id }) => id === statePolicy.legislationTypeId);
    const option = law?.options[statePolicy.policyOptionIndex];
    if (!law || !option || statePolicy.policyOptionId !== `${law.id}_opt_${statePolicy.policyOptionIndex}`) return [];
    enactedPolicyCosts += option.annualCostPerCapita * population;
    return [{ statePolicy, sourceOrder, cost: option.annualCostPerCapita, law }];
  });
  const subsidyCosts = calculateStateSubsidyCostForRegion(
    Object.values(world.corporateSectors ?? {}),
    Object.values(world.corporations ?? {}),
    world.subsidies ?? [],
    "JP",
    regionId,
  );
  row.jpEnactedPolicyCosts = enactedPolicyCosts;
  row.jpSubsidyCosts = subsidyCosts;
  const retainedSpending = Object.entries(row.spending.byCategory)
    .filter(([key]) => key !== JP_ENACTED_POLICIES_SPENDING_KEY && key !== "sectorSubsidies")
    .reduce((sum, [, value]) => sum + value, 0);
  row.spending.byCategory = {
    ...row.spending.byCategory,
    [JP_ENACTED_POLICIES_SPENDING_KEY]: enactedPolicyCosts,
    sectorSubsidies: subsidyCosts,
  };
  row.spending.total = retainedSpending + enactedPolicyCosts + subsidyCosts;
  row.balance = row.revenue.total - row.spending.total;
  row.consecutiveDeficits = row.balance < 0 ? row.consecutiveDeficits + 1 : 0;

  // AHDGame's source processor selects the highest annual per-capita cost and
  // decrements that option index after more than one consecutive deficit.
  // That is the observed ladder direction, even though the comment calls it
  // a downgrade; preserving the actual write is necessary for parity.
  if (row.consecutiveDeficits > 1 && policiesWithCost.length > 0) {
    policiesWithCost.sort((a, b) => b.cost - a.cost || a.sourceOrder - b.sourceOrder);
    const mostExpensive = policiesWithCost[0];
    if (mostExpensive && mostExpensive.cost > 0 && mostExpensive.statePolicy.policyOptionIndex > 0) {
      const nextIndex = mostExpensive.statePolicy.policyOptionIndex - 1;
      const nextOption = mostExpensive.law.options[nextIndex];
      if (nextOption) {
        const sourcePolicy = mostExpensive.statePolicy as JPRegionalPolicyState;
        sourcePolicy.policyOptionIndex = nextIndex;
        sourcePolicy.policyOptionId = `${mostExpensive.law.id}_opt_${nextIndex}`;
        sourcePolicy.economic = nextOption.economic;
        sourcePolicy.social = nextOption.social;
        sourcePolicy.effectDirection = nextOption.effectDirection;
      }
    }
  }
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
