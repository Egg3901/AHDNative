/**
 * Federal revenue calculation.
 * Source: src/lib/budget/revenue.ts calculateFederalRevenue (pure core)
 *
 * Revenue = sum(taxRate% * taxBase) + jurisdiction-specific lines + other.
 * Germany's solidarity surcharge is calculated from income-tax receipts,
 * matching AHDGame's calculateFederalRevenue. Other unported jurisdictional
 * lines remain deferred.
 */

import type { BudgetRevenue, BudgetTaxBases, BudgetTaxRates } from "./types.js";

export function calculateBudgetRevenue(
  taxRates: BudgetTaxRates,
  taxBases: BudgetTaxBases,
  other: number
): BudgetRevenue {
  const r = (rate: number | undefined, base: number): number =>
    typeof rate === "number" && Number.isFinite(rate) && Number.isFinite(base)
      ? Math.round(base * (rate / 100))
      : 0;

  const incomeTax = r(taxRates.incomeTax, taxBases.taxableIncome);
  const domesticCorporateTax = r(taxRates.domesticCorporateTax, taxBases.domesticCorporateProfits);
  const foreignCorporateTax = r(taxRates.foreignCorporateTax, taxBases.foreignCorporateProfits);
  const payrollTax = r(taxRates.payrollTax, taxBases.wagesAndSalaries);
  const tariffs = r(taxRates.tariffs, taxBases.importValue);
  const salesTax = r(taxRates.salesTax, taxBases.taxableSales);
  const solidaritySurcharge = typeof taxRates.solidaritySurcharge === "number"
    ? Math.round(incomeTax * (taxRates.solidaritySurcharge / 100))
    : undefined;
  const otherSafe = Number.isFinite(other) ? Math.round(other) : 0;

  const total = incomeTax + domesticCorporateTax + foreignCorporateTax + payrollTax + tariffs + salesTax + (solidaritySurcharge ?? 0) + otherSafe;

  return {
    incomeTax,
    domesticCorporateTax,
    foreignCorporateTax,
    payrollTax,
    tariffs,
    salesTax,
    ...(solidaritySurcharge === undefined ? {} : { solidaritySurcharge }),
    other: otherSafe,
    total,
  };
}

/**
 * Build tax bases from GDP ratios.
 * Source: src/lib/seeds/reference/budgets.ts buildTaxBases (totalCorporateProfits split 75/25).
 */
export function buildTaxBases(
  gdp: number,
  ratios: { taxableIncome: number; corporateProfits: number; wagesAndSalaries: number; importValue: number; taxableSales: number }
): BudgetTaxBases {
  const totalCorp = gdp * ratios.corporateProfits;
  return {
    taxableIncome: gdp * ratios.taxableIncome,
    domesticCorporateProfits: totalCorp * 0.75,
    foreignCorporateProfits: totalCorp * 0.25,
    wagesAndSalaries: gdp * ratios.wagesAndSalaries,
    importValue: gdp * ratios.importValue,
    taxableSales: gdp * ratios.taxableSales,
  };
}
