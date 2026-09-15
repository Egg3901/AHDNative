import type { WorldState } from "../types.js";

/**
 * Resolve the currency that owns a bond's units and cash flows.
 *
 * Current bonds carry an explicit denomination. Legacy bonds may omit it;
 * those inherit the issuing country's budget currency, then USD when the
 * country has no supported currency row.
 */
export function resolveBondCurrency(
  world: Pick<WorldState, "budgets">,
  bond: { countryId: string; currencyCode?: string | null },
): string {
  const explicit = bond.currencyCode?.trim();
  if (explicit) return explicit;
  return resolveCountryCurrency(world, bond.countryId);
}

/** Resolve one country's supported budget denomination. */
export function resolveCountryCurrency(
  world: Pick<WorldState, "budgets">,
  countryId: string,
): string {
  const inferred = world.budgets[countryId]?.currencyCode?.trim();
  return inferred || "USD";
}
