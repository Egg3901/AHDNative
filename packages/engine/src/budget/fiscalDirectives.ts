import { calculateBudgetRevenue } from "./revenue.js";
import { calculateBudgetSpending } from "./spending.js";
import type { WorldState } from "../types.js";
import type { TurnPhase } from "../phases/types.js";

/** Enact costed HoS fiscal directions at the turn boundary, never immediately. */
export const fiscalDirectivesPhase: TurnPhase = {
  name: "fiscalDirectives",
  run(world: WorldState) {
    const pending = world.pendingFiscalDirectives ?? [];
    for (const directive of pending) {
      const budget = world.budgets[directive.countryId];
      if (!budget) continue;
      if (directive.kind === "spending") {
        const byCategory = { ...budget.spending.byCategory, [directive.field]: directive.value };
        budget.spending = calculateBudgetSpending(
          byCategory,
          budget.spending.stateGrants,
          budget.debt.principal,
          budget.debt.interestRate,
        );
      } else {
        budget.taxRates = { ...budget.taxRates, [directive.field]: directive.value };
        budget.revenue = calculateBudgetRevenue(budget.taxRates, budget.taxBases, budget.revenue.other);
      }
      budget.surplus = budget.revenue.total - budget.spending.total;
    }
    if (world.pendingFiscalDirectives !== undefined) world.pendingFiscalDirectives = [];
  },
};
