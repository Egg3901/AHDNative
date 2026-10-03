import type { WorldState } from "../types.js";
import { catalogPolicyOptionAnnualCost } from "../policyEffects/budget.js";
import { getLaw, POLICY_EFFECT_DIRECTION_LADDER } from "./catalog.js";
import type { Bill, BillBudgetValidation } from "./types.js";

interface PolicySelection {
  legislationTypeId: string;
  policyOptionId?: string;
  effectDirection?: number;
}

function billSelections(bill: Bill): PolicySelection[] {
  const policies = bill.provisions
    .filter((provision) => provision.type === "policy")
    .map((provision) => ({
      legislationTypeId: provision.legislationTypeId,
      ...(provision.policyOptionId ? { policyOptionId: provision.policyOptionId } : {}),
      effectDirection: provision.effectDirection,
    }));
  if (policies.length > 0) return policies;
  if (bill.legislationTypeId && bill.effectDirection !== undefined) {
    return [{ legislationTypeId: bill.legislationTypeId, effectDirection: bill.effectDirection }];
  }
  return [];
}

function selectedOptionId(selection: PolicySelection): string | undefined {
  if (selection.policyOptionId) return selection.policyOptionId;
  if (selection.effectDirection === undefined) return undefined;
  const catalog = getLaw(selection.legislationTypeId);
  if (!catalog?.levels) return undefined;
  const directions = catalog.optionEffectDirections ?? POLICY_EFFECT_DIRECTION_LADDER;
  const index = directions.indexOf(selection.effectDirection as -1 | 0 | 1);
  return index >= 0 && index < catalog.levels.length ? `l${index}` : undefined;
}

/**
 * Source `validateFederalBudgetImpact` projection for Native's available
 * catalog cost forms. Unknown source cost classes intentionally price at 0,
 * matching Game's `getCostClass(typeId) ?? "none"` fallback. The national
 * gate is advisory: it records a warning and never refuses enactment.
 */
export function validateFederalBudgetImpact(world: WorldState, bill: Bill): BillBudgetValidation {
  const budget = world.budgets[bill.countryId];
  const yearValue = Number.parseInt(world.meta.date.slice(0, 4), 10);
  const year = Number.isFinite(yearValue) ? yearValue : undefined;
  const costAmount = budget
    ? billSelections(bill).reduce((total, selection) => {
      const catalog = getLaw(selection.legislationTypeId);
      if (!catalog) return total;
      return total + catalogPolicyOptionAnnualCost(
        catalog,
        selectedOptionId(selection),
        budget.gdp,
        budget.population,
        year,
      );
    }, 0)
    : 0;

  if (!budget || costAmount === 0) {
    return {
      costAmount: 0,
      newTotalSpending: budget?.spending.total ?? 0,
      validatedAtTurn: world.meta.turn,
    };
  }

  const newTotalSpending = budget.spending.total + costAmount;
  const newDeficit = newTotalSpending - budget.revenue.total;
  const newDebt = newDeficit > 0 ? budget.debt.principal + newDeficit : budget.debt.principal;
  const borrowingLimit = bill.countryId === "DD"
    ? Math.max(budget.debt.ceiling, budget.gdp * 0.4)
    : budget.debt.ceiling;
  const debtRatio = budget.debtToGdpRatio ?? (budget.gdp > 0 ? budget.debt.principal / budget.gdp : undefined);
  const warning = newDebt > borrowingLimit
    ? "DEBT_CEILING_EXCEEDED"
    : (debtRatio !== undefined && debtRatio > 1 ? "HIGH_DEBT" : undefined);

  return {
    costAmount,
    newTotalSpending,
    newDebt,
    ...(warning ? { warning } : {}),
    validatedAtTurn: world.meta.turn,
  };
}
