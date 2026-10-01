import type { CountryBudget } from "../budget/types.js";
import type { WorldState } from "../types.js";

/** Source AHDGame `promoteEconomyToNational` extensive budget fields. */
function scaleRecord<T extends object>(record: T, weight: number): T {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value * weight])) as T;
}

function scaleBudgetMagnitudes(budget: CountryBudget, weight: number): void {
  budget.gdp *= weight;
  budget.revenue = scaleRecord(budget.revenue, weight);
  budget.taxBases = scaleRecord(budget.taxBases, weight);
  budget.spending = {
    ...budget.spending,
    byCategory: scaleRecord(budget.spending.byCategory, weight),
    stateGrants: budget.spending.stateGrants * weight,
    debtInterest: budget.spending.debtInterest * weight,
    total: budget.spending.total * weight,
  };
  budget.debt.principal *= weight;
  budget.surplus *= weight;
  budget.treasuryBalance *= weight;
  if (budget.baselineSpendingByCategory) {
    budget.baselineSpendingByCategory = scaleRecord(budget.baselineSpendingByCategory, weight);
  }
  if (budget.baselineStateGrants !== undefined) budget.baselineStateGrants *= weight;
}

/**
 * Port the source post-expansion national-budget promotion so a newly
 * independent country can be opened by the public GameSession view. The
 * source computes its share from the authored sub-region GDP after fan-out;
 * existing target budgets make retries an idempotent no-op.
 */
export function promoteSecededBudget(world: WorldState, sourceCountryId: string, targetCountryId: string): void {
  if (world.budgets[targetCountryId]) return;
  const sourceBudget = world.budgets[sourceCountryId];
  if (!sourceBudget) return;

  const targetGdp = Object.values(world.regions)
    .filter((region) => region.countryId === targetCountryId)
    .reduce((sum, region) => sum + Math.max(0, region.gdp ?? 0), 0);
  const remainderGdp = Object.values(world.regions)
    .filter((region) => region.countryId === sourceCountryId)
    .reduce((sum, region) => sum + Math.max(0, region.gdp ?? 0), 0);
  const totalGdp = targetGdp + remainderGdp;
  const weight = totalGdp > 0 ? targetGdp / totalGdp : 0;
  if (!(weight > 0 && weight < 1)) return;

  const targetBudget = structuredClone(sourceBudget);
  targetBudget.countryId = targetCountryId;
  scaleBudgetMagnitudes(targetBudget, weight);
  scaleBudgetMagnitudes(sourceBudget, 1 - weight);
  world.budgets[targetCountryId] = targetBudget;
}
