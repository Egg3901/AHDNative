/**
 * Regional (state) budget processing — generic.
 * Source: src/lib/turn/regionalBudget.ts (UK central model) +
 *         generic extraction of the shared revenue/spending pattern.
 *
 * Mainline has country-specific variants:
 *  - src/lib/turn/jpRegionalBudget.ts (Japan, unported, issue #103)
 *  - src/lib/turn/deRegionalBudget.ts (Germany, unported, issue #103)
 *  - src/lib/turn/cnRegionalBudget.ts / ruRegionalBudget.ts etc.
 *
 * JP and DE are playable in the 1991 and 2019 packs and use the generic
 * processor below until their variants land.
 *
 * Solo's generic processor handles any playable country's regions as a
 * population-share slice of the national grant pool plus a small own-revenue
 * share of regional GDP (mirrors the UK CN/DE pattern without country-specific
 * value-base drift).
 */

import type { RegionalBudget } from "./types.js";

// Source: src/lib/turn/regionalBudget.ts COUNCIL_TAX_GDP_SHARE etc. — generic constant, not country-specific
export const REGIONAL_OWN_REVENUE_GDP_SHARE = 0.016; // generic own-revenue share of regional GDP (UK councilTax analogue)
export const REGIONAL_BUSINESS_GDP_SHARE = 0.01;

/**
 * Issue #100: state-scope tax base as a multiple of regional GDP, per tax type.
 * Source: src/lib/budget/revenue.ts:169-178 (GDP_INCOME_TAX_FACTOR 0.35,
 * GDP_SALES_FACTOR 0.55, GDP_DOMESTIC_CORPORATE_FACTOR 0.06,
 * GDP_FOREIGN_CORPORATE_FACTOR 0.02, GDP_PROPERTY_FACTOR 3.0), the fallback
 * `calculateStateRevenue` uses when no stored StateTaxBases exist
 * (src/lib/budget/revenue.ts:649-655). Native models no per-region state tax
 * bases, so the region's GDP-derived base is used (see
 * calculateStateTaxRevenue). Tax types without an authored factor (e.g. DE's
 * Hebesatz-driven tradeTax) contribute nothing — DE/CN regional processors are
 * unported (issue #103).
 */
export const STATE_TAX_GDP_FACTORS: Record<string, number> = {
  incomeTax: 0.35,
  salesTax: 0.55,
  domesticCorporateTax: 0.06,
  foreignCorporateTax: 0.02,
  propertyTax: 3.0,
};

/**
 * Issue #100: state-scope tax revenue for one region = Σ per-type
 * (GDP-derived base × rate / 100). Source:
 * src/lib/utils/budgetCalculations.ts:95-129 calculateStateRevenue
 * (`incomeTax = bases.taxableIncome * rates.incomeTax / 100`, summed into
 * total) with the reference's GDP base factors above. Pure helper exported for
 * golden tests. Rate types the reference does not price off GDP (tradeTax) are
 * ignored; non-finite rates are skipped.
 */
export function calculateStateTaxRevenue(
  regionGdp: number,
  taxRates: Record<string, number | null | undefined> | undefined,
): number {
  if (!Number.isFinite(regionGdp)) return 0;
  let total = 0;
  for (const [taxType, rate] of Object.entries(taxRates ?? {})) {
    const factor = STATE_TAX_GDP_FACTORS[taxType];
    if (factor === undefined) continue;
    if (typeof rate !== "number" || !Number.isFinite(rate)) continue;
    total += regionGdp * factor * (rate / 100);
  }
  return total;
}

/**
 * Issue #100: a region's GDP in absolute local currency, from the same real
 * modeled inputs the regional budget phase already uses — the region's own GSP
 * (`region.gdp`, millions) when present, otherwise its population share of the
 * national budget GDP. Keeps enactment-time and per-turn revenue on one basis.
 */
export function regionalGdpAbsolute(
  region: { gdp?: number; population?: number },
  countryBudget: { gdp: number; population: number } | undefined,
): number {
  if (region.gdp != null) return region.gdp * 1_000_000;
  const pop = region.population ?? 0;
  const nationalPop = countryBudget?.population ?? 0;
  return countryBudget && nationalPop > 0 ? (countryBudget.gdp * pop) / nationalPop : 0;
}

/**
 * Issue #100: fold a region's enacted state-scope taxes into its budget revenue
 * and derived totals. Mutates `revenue.stateTax`, `revenue.total` and `balance`.
 * Source: src/lib/billEnactment.ts applyTaxRateChange scope "state"
 * (revenue + surplus recomputed immediately on enactment).
 */
export function applyStateTaxToRegionalRevenue(budget: RegionalBudget, regionGdp: number): number {
  const stateTax = Math.round(calculateStateTaxRevenue(regionGdp, budget.taxRates));
  budget.revenue.stateTax = stateTax;
  budget.revenue.total = budget.revenue.councilTax + budget.revenue.businessRates + budget.revenue.grant + stateTax;
  budget.balance = budget.revenue.total - budget.spending.total;
  return stateTax;
}

export interface GenericRegionalInput {
  regionId: string;
  countryId: string;
  regionGdp: number; // absolute local currency (state.gdp * 1e6 or region.gdp scaled)
  regionPopulation: number;
  nationalPopulation: number;
  grantPool: number;
  chancellorAllocation?: number | null;
}

export interface GenericRegionalResult {
  regionId: string;
  countryId: string;
  councilTax: number;
  businessRates: number;
  grant: number;
  revenueTotal: number;
  spendingTotal: number;
  balance: number;
}

/**
 * Calculate regional revenue as generic statutory shares of regional GDP + grant.
 * Pure helper exported for golden tests.
 * Source: src/lib/turn/regionalBudget.ts calculateRegionalBudget
 */
export function calculateGenericRegionalRevenue(input: GenericRegionalInput): { councilTax: number; businessRates: number; grant: number; total: number } {
  const councilTax = input.regionGdp * REGIONAL_OWN_REVENUE_GDP_SHARE;
  const businessRates = input.regionGdp * REGIONAL_BUSINESS_GDP_SHARE;
  const grant = input.chancellorAllocation != null
    ? input.chancellorAllocation
    : input.nationalPopulation > 0
      ? (input.grantPool * input.regionPopulation) / input.nationalPopulation
      : 0;
  const total = councilTax + businessRates + grant;
  return { councilTax, businessRates, grant, total };
}
