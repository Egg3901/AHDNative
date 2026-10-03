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

const JP_COST_SCALE = { gdpLow: 470_000_000_000_000, popLow: 124_000_000, scaleLow: 1, gdpHigh: 550_000_000_000_000, popHigh: 126_000_000, scaleHigh: 1.09 };

function sourceCostScale(countryId: string, gdp: number, population: number, nationalGdpPerCapita?: number): number {
  if (countryId !== "JP") return 1;
  const gpc = nationalGdpPerCapita ?? (population > 0 ? gdp / population : 0);
  const lo = JP_COST_SCALE.gdpLow / JP_COST_SCALE.popLow;
  const hi = JP_COST_SCALE.gdpHigh / JP_COST_SCALE.popHigh;
  if (gpc <= 0) return JP_COST_SCALE.scaleLow;
  if (gpc < lo) return JP_COST_SCALE.scaleLow * gpc / lo;
  const t = Math.max(0, Math.min(1, (gpc - lo) / (hi - lo)));
  return JP_COST_SCALE.scaleLow + t * (JP_COST_SCALE.scaleHigh - JP_COST_SCALE.scaleLow);
}

function optionCost(catalog: CatalogEntry, optionId: string | undefined, gdp: number, population: number, year?: number, nationalGdpPerCapita?: number): number {
  const options = catalog.policyOptionCosts ?? [];
  const selected = options.find((option) => option.id === optionId) ??
    (optionId && /^\d+$/.test(optionId) ? options[Number(optionId)] : undefined) ??
    (optionId && /^l\d+$/.test(optionId) ? options[Number(optionId.slice(1))] : undefined);
  if (catalog.budgetCostClass === "none" && year !== undefined) return 0;
  if (!selected) return 0;
  if (typeof selected.gdpPerCapitaMultiplier === "number") return selected.gdpPerCapitaMultiplier * gdp;
  if (typeof selected.annualCostPerCapita === "number") {
    return selected.annualCostPerCapita * population * sourceCostScale(catalog.countryId, gdp, population, nationalGdpPerCapita);
  }
  return 0;
}

/** Game's regionalBudget consumer intentionally prices legacy regional rows
 * as option annualCostPerCapita × that region's population; it does not route
 * through the national era-class helper or GDP scale ramp. */
function regionalOptionCost(catalog: CatalogEntry, optionId: string | undefined, population: number): number {
  const options = catalog.policyOptionCosts ?? [];
  const selected = options.find((option) => option.id === optionId) ??
    (optionId && /^\d+$/.test(optionId) ? options[Number(optionId)] : undefined) ??
    (optionId && /^l\d+$/.test(optionId) ? options[Number(optionId.slice(1))] : undefined);
  return typeof selected?.annualCostPerCapita === "number" ? selected.annualCostPerCapita * population : 0;
}

function ledgerOptionId(catalog: CatalogEntry, entry: ReturnType<typeof currentLedgerEntry>): string | undefined {
  if (entry?.isRepeal) return undefined;
  if (entry?.sourcePolicyOptionId) return entry.sourcePolicyOptionId;
  if (entry?.policyOptionId) return entry.policyOptionId;
  return catalog.baselinePolicyOptionId;
}

/**
 * Rebuild policy-law spending as a delta from Native's authored budget seed.
 * The seed already contains aggregate spending, so only the difference between
 * the current law level and its authored baseline is added. This prevents the
 * same baseline cost being counted twice while making replacement and repeal
 * observable and save-stable.
 */
export function rebuildPolicyBudgets(world: WorldState): void {
  const year = Number.parseInt(world.meta.date.slice(0, 4), 10);
  const sourceYear = Number.isFinite(year) ? year : undefined;
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
        catalog.kind === "tax" ||
        catalog.allowedScope === "regional" ||
        catalog.countryId !== budget.countryId ||
        (!catalog.levels && !catalog.policyOptionCosts)
      ) continue;
      const ledger = currentLedgerEntry(world, catalog);
      if (catalog.status !== "available" && !ledger) continue;
      const baselineLevel = catalog.baselineLevel ?? 0;
      const currentLevel = levelIndex(catalog, ledger);
      const baseline = catalog.policyOptionCosts
        ? optionCost(catalog, catalog.baselinePolicyOptionId, budget.gdp, budget.population, sourceYear)
        : levelCost(catalog, baselineLevel, budget.gdp);
      const current = catalog.policyOptionCosts
        ? optionCost(catalog, ledgerOptionId(catalog, ledger), budget.gdp, budget.population, sourceYear)
        : levelCost(catalog, currentLevel, budget.gdp);
      const delta = current - baseline;
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

/** Re-derived regional policy delta; regional budget phases rebuild their base
 * categories from national allocations, so this is intentionally ephemeral. */
export function regionalPolicySpendingDelta(world: WorldState, regionId: string): number {
  const region = world.regions[regionId];
  if (!region) return 0;
  const population = region.population ?? 0;
  let delta = 0;
  for (const catalog of CATALOG) {
    if (catalog.countryId !== region.countryId || !catalog.policyOptionCosts || (catalog.allowedScope !== "regional" && catalog.allowedScope !== "both")) continue;
    const entries = Object.values(world.policyLedger).filter((entry) => entry.countryId === region.countryId && entry.legislationTypeId === catalog.id && entry.scope === "regional" && entry.regionId === regionId && entry.repealedAtTurn === undefined);
    const current = entries.sort((a, b) => a.enactedTurn - b.enactedTurn || a.id.localeCompare(b.id)).at(-1);
    // The source regional consumer charges only actual active statePolicies
    // rows. No row means no regional line; a repeal tombstone also removes it.
    if (!current || current.isRepeal) continue;
    delta += regionalOptionCost(catalog, ledgerOptionId(catalog, current), population);
  }
  return delta;
}
