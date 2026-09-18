import { calculateBudgetRevenue } from "./revenue.js";
import { calculateBudgetSpending } from "./spending.js";
import { needsPhaseIn, stepTaxRate } from "./taxRatePhaseIn.js";
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
        // Issue #93: tax directives take the same persisted phase-in path as
        // federal tax legislation (legislation/billLifecycle.ts applyBillEffects
        // federal branch via budget/taxRatePhaseIn.ts). The rate moves by
        // stepTaxRate (max 1pp) at this boundary and the remainder is queued on
        // budget.taxRatePhaseIn for fiscalBaseGrowthPhase to walk each turn. A
        // fresh directive on the same tax replaces a running ramp. Unknown tax
        // fields are ignored so no rate is created from a fallback value.
        if (!(directive.field in budget.taxRates)) continue;
        const key = directive.field as keyof typeof budget.taxRates;
        const current = budget.taxRates[key];
        const stepped = stepTaxRate(current, directive.value);
        budget.taxRates = { ...budget.taxRates, [key]: stepped };
        const pending = { ...(budget.taxRatePhaseIn ?? {}) };
        if (needsPhaseIn(current, directive.value)) pending[key] = directive.value;
        else delete pending[key];
        budget.taxRatePhaseIn = pending;
        budget.revenue = calculateBudgetRevenue(budget.taxRates, budget.taxBases, budget.revenue.other);
      }
      budget.surplus = budget.revenue.total - budget.spending.total;
    }
    if (world.pendingFiscalDirectives !== undefined) world.pendingFiscalDirectives = [];
  },
};
