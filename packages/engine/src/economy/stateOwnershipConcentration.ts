/**
 * State Ownership Concentration Index (SOCI), solo port of
 * src/lib/nationalization/concentration.ts's pure math (clampConcentration,
 * sociMultiplier). A per-country 0-100 measure of state-owned corporate
 * revenue ÷ total national corporate revenue.
 *
 * Game sums operating-country assets, with only that country's state owners
 * in the numerator. Game stores asset receipts in the owner's currency;
 * Native plantProduction records host-local receipts. Normalize each store
 * in its own denomination before applying the same anchor-revenue ratio.
 */
import type { WorldState } from "../types.js";
import { getRateForCountry, localToAnchor } from "../forex/conversion.js";

/** Current source computeCountryStateOwnershipConcentration, Native store adapter. */
export function computeCountryStateOwnershipConcentration(world: WorldState, countryId: string): number {
  let totalRevenueAnchor = 0;
  let stateRevenueAnchor = 0;
  for (const asset of Object.values(world.corporateSectors ?? {})) {
    if (asset.countryId !== countryId) continue;
    const corporation = world.corporations[asset.corporationId];
    if (!corporation) continue;
    const revenueAnchor = localToAnchor(asset.revenue ?? corporation.revenue, getRateForCountry(world, asset.countryId));
    totalRevenueAnchor += revenueAnchor;
    if (corporation.countryOwnerId === countryId) stateRevenueAnchor += revenueAnchor;
  }
  return totalRevenueAnchor > 0 ? clampConcentration(100 * stateRevenueAnchor / totalRevenueAnchor) : 0;
}

/** SOCI value at/below which the escalation multiplier is exactly 1.0. */
export const SOCI_DANGER_ZONE = 35;
/** Escalation multiplier at SOCI 100. */
export const CONCENTRATION_MULTIPLIER_MAX = 3.5;

/** Clamp any value into the SOCI range [0,100]; non-finite ⇒ 0. */
export function clampConcentration(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

/**
 * Escalation multiplier (≥ 1.0). Exactly 1.0 at/below the danger zone, then a
 * convex (quadratic) ramp to CONCENTRATION_MULTIPLIER_MAX at SOCI 100 — early
 * takings barely escalate, empire-building bites hard.
 */
export function sociMultiplier(soci: number): number {
  const s = clampConcentration(soci);
  if (s <= SOCI_DANGER_ZONE) return 1;
  const span = 100 - SOCI_DANGER_ZONE;
  const t = (s - SOCI_DANGER_ZONE) / span;
  return 1 + (CONCENTRATION_MULTIPLIER_MAX - 1) * t * t;
}
