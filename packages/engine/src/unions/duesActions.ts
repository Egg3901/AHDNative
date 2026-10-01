import type { WorldState } from "../types.js";
import { representedSectorsForUnion } from "./sectorAggregation.js";
import { averageAnnualWage, duesIncomePerTurn, maxDuesForWage, unionMembers } from "./dues.js";

export type SetUnionDuesResult =
  | { ok: true; duesPerWorkerAnnual: number; maxDuesPerWorkerAnnual: number; members: number; duesIncomePerTurn: number }
  | { ok: false; reason: "union-not-found" | "not-president" | "invalid-dues" | "no-paid-workforce" };

/** Set annual per-member dues, capped at ten percent of represented annual wages. */
export function setUnionDuesAction(world: WorldState, unionId: string, requested: number): SetUnionDuesResult {
  const union = world.unions[unionId];
  if (!union) return { ok: false, reason: "union-not-found" };
  if (world.player.countryId !== union.countryId || union.ownerType !== "player" || union.ownerId !== "player") {
    return { ok: false, reason: "not-president" };
  }
  if (!Number.isFinite(requested) || requested < 0) return { ok: false, reason: "invalid-dues" };

  const sectors = representedSectorsForUnion(world, union);
  const annualWage = averageAnnualWage(sectors);
  const max = maxDuesForWage(annualWage);
  if (max <= 0 && requested > 0) return { ok: false, reason: "no-paid-workforce" };
  const rate = Math.min(requested, max);
  union.duesPerWorkerAnnual = rate;
  union.updatedAtTurn = world.meta.turn;
  const members = unionMembers(sectors);
  return { ok: true, duesPerWorkerAnnual: rate, maxDuesPerWorkerAnnual: max, members, duesIncomePerTurn: duesIncomePerTurn(members, rate) };
}
