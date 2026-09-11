import type { WorldState } from "../types.js";
import { calculateBudgetSpending } from "../budget/spending.js";
import { CATALOG, resolveCatalogPolicyOption, type CatalogEntry } from "../legislation/catalog.js";

/** Native budget bucket used for the relative cost delta of a catalog law. */
const BUDGET_CATEGORY_BY_LAW_CATEGORY: Record<string, string> = {
  economy: "other",
  education: "education",
  health: "healthcare",
  healthcare: "healthcare",
  infrastructure: "infrastructure",
  governance: "other",
  defense: "defense",
  welfare: "welfare",
  environment: "other",
  order: "other",
};

function currentLedgerEntry(world: WorldState, catalog: CatalogEntry) {
  return Object.values(world.policyLedger)
    .filter((entry) =>
      entry.countryId === catalog.countryId &&
      entry.legislationTypeId === catalog.id &&
      entry.scope === "national" &&
      entry.repealedAtTurn === undefined,
    )
    .sort((a, b) => a.enactedTurn - b.enactedTurn || a.id.localeCompare(b.id))
    .at(-1);
}

function levelIndex(catalog: CatalogEntry, ledger: ReturnType<typeof currentLedgerEntry>): number {
  if (ledger?.isRepeal) return 0;
  if (ledger?.sourcePolicyOptionId) {
    const resolved = resolveCatalogPolicyOption(catalog, ledger.sourcePolicyOptionId);
    if (resolved) return resolved.index;
  }
  const raw = ledger?.policyOptionId;
  if (raw && /^\d+$/.test(raw)) return Number(raw);
  if (raw) {
    const resolved = resolveCatalogPolicyOption(catalog, raw);
    if (resolved) return resolved.index;
  }
  return catalog.baselineLevel ?? 0;
}

function levelCost(catalog: CatalogEntry, index: number, gdp: number): number {
  const level = catalog.levels?.[Math.max(0, Math.min(catalog.levels.length - 1, index))];
  const fraction = level?.gdpCostFraction ?? 0;
  return Number.isFinite(fraction) && Number.isFinite(gdp) ? fraction * gdp : 0;
}

/**
 * Rebuild policy-law spending as a delta from Native's authored budget seed.
 * The seed already contains aggregate spending, so only the difference between
 * the current law level and its authored baseline is added. This prevents the
 * same baseline cost being counted twice while making replacement and repeal
 * observable and save-stable.
 */
export function rebuildPolicyBudgets(world: WorldState): void {
  for (const budget of Object.values(world.budgets)) {
    const previousPolicy = budget.policySpendingByCategory ?? {};
    // Start from the live spending map so other fiscal phases retain their
    // authored or computed lines (for example sector subsidies). Remove only
    // the policy delta written by the previous rebuild, then apply the newly
    // derived delta on top.
    const nonPolicy: Record<string, number> = { ...budget.spending.byCategory };
    for (const [category, amount] of Object.entries(previousPolicy)) {
      nonPolicy[category] = (nonPolicy[category] ?? 0) - amount;
    }

    const policyDelta: Record<string, number> = {};
    for (const catalog of CATALOG) {
      if (
        catalog.status !== "available" ||
        catalog.kind === "tax" ||
        catalog.allowedScope === "regional" ||
        catalog.countryId !== budget.countryId ||
        !catalog.levels
      ) continue;
      const baselineLevel = catalog.baselineLevel ?? 0;
      const currentLevel = levelIndex(catalog, currentLedgerEntry(world, catalog));
      const delta = levelCost(catalog, currentLevel, budget.gdp) - levelCost(catalog, baselineLevel, budget.gdp);
      if (delta === 0) continue;
      const category = BUDGET_CATEGORY_BY_LAW_CATEGORY[catalog.category] ?? "other";
      policyDelta[category] = (policyDelta[category] ?? 0) + delta;
    }

    const byCategory: Record<string, number> = { ...nonPolicy };
    for (const [category, amount] of Object.entries(policyDelta)) {
      byCategory[category] = (byCategory[category] ?? 0) + amount;
    }
    budget.policySpendingByCategory = policyDelta;
    budget.spending = calculateBudgetSpending(
      byCategory,
      budget.spending.stateGrants,
      budget.debt.principal,
      budget.debt.interestRate,
    );
    budget.surplus = budget.revenue.total - budget.spending.total;
  }
}
