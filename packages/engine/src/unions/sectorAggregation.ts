/**
 * Sector-worker aggregation — #320.
 *
 * Replaces the phases.ts demographic bridge (total labor force x 1953 sector
 * weight as a synthetic single sector) with aggregation over the recorded
 * #296 corporate-sector assets: for each union, every asset whose
 * representingUnionId points at it contributes one
 * { workers, unionization, wagePerWorker } row, and the verbatim dues helpers
 * (unionMembers, averageAnnualWage) run over those rows. No duplicate asset
 * is introduced — corporateSectorAssets (#211/#296) stays the single
 * workforce record, so display headcount and dues headcount can never drift
 * apart.
 *
 * What stays demographic: Native assets record workers but not
 * per-sector unionization or wagePerWorker (the reference's CorporateSector
 * fields), so each row reuses the union's worker-weighted density and the
 * country annual wage derived from current region labor (laborForces) and
 * payroll (budget wagesAndSalaries, else gdp x 0.35 — the same payroll the
 * budget revenue uses). Per-sector wage/unionization tables remain a
 * documented gap for the bargaining slice (#322), not silently replaced.
 *
 * Determinism: assets iterate in explicit id-sorted order (the seed already
 * inserts sorted, the sort here pins it), organizers sort by identity in
 * organizers.ts, and no RNG is consumed anywhere in this module.
 *
 * Source: <mainline-checkout>/src/lib/turn/unions/index.ts processUnionsTurn
 *         (representedSectors query + unionMembers/averageAnnualWage over it,
 *         adoptUnrepresentedSectors) at e364c04954ed628beef73a993a8e9e156650a31e.
 */

import type { WorldState } from "../types.js";
import { corporateSectorAssets, initialRepresentingUnionId } from "../corporation/corporateSectorAssets.js";
import { GAME_DAYS_PER_YEAR } from "./services.js";
import type { UnionMemberSector } from "./dues.js";
import type { Union } from "./types.js";

/** Country labor force: sum of recorded region labor for regions in this country. Falls back to a population-derived estimate in stripped worlds. */
export function totalLaborForceForCountry(world: WorldState, countryId: string): number {
  let total = 0;
  for (const [rid, lf] of Object.entries(world.laborForces ?? {})) {
    const region = world.regions[rid];
    if (region?.countryId === countryId && Number.isFinite(lf) && lf > 0) total += lf;
  }
  // Fallback: derive from region population if laborForces empty (e.g. in stripped test world)
  if (total === 0) {
    for (const region of Object.values(world.regions)) {
      if (region.countryId !== countryId) continue;
      const pop = region.population ?? 0;
      if (pop > 0) total += Math.round(pop * 0.58 * 0.625);
    }
  }
  return total;
}

/** Country annual wage per worker: recorded payroll spread over the country labor force. */
export function annualWageForCountry(
  world: WorldState,
  countryId: string,
  totalLaborForce: number,
): number {
  if (totalLaborForce <= 0) return 0;
  const budget = world.budgets?.[countryId];
  // Derive actual payroll from budgets if available, else from gdp proxy
  let payroll = 0;
  if (budget?.taxBases?.wagesAndSalaries && budget.taxBases.wagesAndSalaries > 0) {
    payroll = budget.taxBases.wagesAndSalaries;
  } else if (world.countries[countryId]) {
    payroll = world.countries[countryId]!.economy.gdp * 1_000_000 * 0.35;
  }
  return payroll / totalLaborForce;
}

/**
 * Dues rows for one union: one row per recorded asset it represents, in
 * asset-id order. Workers come from the stored #296 headcount; density is
 * the union's worker-weighted unionization; the daily wage is the country
 * annual wage per worker spread over GAME_DAYS_PER_YEAR (the same
 * per-worker payroll the budget revenue uses, so dues burden reads against
 * what members actually earn).
 */
export function representedSectorsForUnion(
  world: WorldState,
  union: Union,
): UnionMemberSector[] {
  const assets = corporateSectorAssets(world);
  const represented = Object.values(assets)
    .filter((asset) => asset.representingUnionId === union.id)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const totalLF = totalLaborForceForCountry(world, union.countryId);
  const annualWage = annualWageForCountry(world, union.countryId, totalLF);
  const dailyWage = GAME_DAYS_PER_YEAR > 0 ? annualWage / GAME_DAYS_PER_YEAR : 0;
  const density = Math.max(0, Math.min(100, union.unionization ?? 0));
  return represented.map((asset) => ({
    workers: asset.workers,
    unionization: density,
    wagePerWorker: dailyWage,
  }));
}

/**
 * Adopt null-pointer sectors into their industry's seeded union and report
 * how many moved. A present pointer is never overwritten (a rival that won
 * a shop keeps it); a pair with no seeded union stays unrepresented rather
 * than inventing coverage. Untouched saves (no materialized corporateSectors)
 * are left lazy — seeding-on-access already adopts, so there is nothing to
 * do and the serialized shape is preserved. Source: adoptUnrepresentedSectors
 * in turn/unions/index.ts; Native has only seeded roster unions
 * (ownerType "npp" | null, no player-claimed unions), so every recorded
 * union is adoption-eligible.
 */
export function adoptUnrepresentedSectors(world: WorldState): number {
  const assets = world.corporateSectors;
  if (!assets) return 0;
  let adopted = 0;
  for (const asset of Object.values(assets)) {
    if (asset.representingUnionId !== null && asset.representingUnionId !== undefined) continue;
    const candidate = initialRepresentingUnionId(world, asset.countryId, asset.sectorType);
    if (!candidate) continue;
    asset.representingUnionId = candidate;
    adopted++;
  }
  return adopted;
}
