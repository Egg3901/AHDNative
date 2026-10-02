/**
 * National union-law enactment state.
 *
 * Source: AHDGame src/lib/labour/unionLaws.ts applyUnionLawProvision at
 * origin/main cb66acdf0129616b8a09902727e9b58715c8bacb. The country budget
 * is authoritative for ban/bias state. Union rows mirror a ban so Native's
 * existing action, dues, service, organizing and bargaining consumers freeze
 * immediately, as the reference union documents do.
 */
import type { WorldState } from "../types.js";
import { STRIKE_UNIONIZATION_THRESHOLD } from "./bargaining.js";
import { repealUndergroundConversion, undergroundStrength } from "./underground.js";
import { resolveUnionBanStrike, triggerUnionBanStrike } from "./unionBanStrike.js";

export const UNION_LAW_BIAS_MIN = -50;
export const UNION_LAW_BIAS_MAX = 50;
/** Source labour/strikes.ts STRIKE_LAW_THRESHOLD_WEIGHT at Game cb66acdf. */
export const STRIKE_LAW_THRESHOLD_WEIGHT = 0.2;

export interface UnionLawProvision {
  type: "union_law";
  bias?: number;
  banAction?: "ban" | "repeal_ban";
}

export function clampUnionLawBias(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(UNION_LAW_BIAS_MIN, Math.min(UNION_LAW_BIAS_MAX, value));
}

/** Apply only to the named country's authored budget, preserving other rows. */
export function applyUnionLawProvision(
  world: WorldState,
  countryId: string,
  provision: UnionLawProvision,
): void {
  const budget = world.budgets[countryId];
  if (!budget) return;

  if (provision.banAction === "ban" || provision.banAction === "repeal_ban") {
    const banned = provision.banAction === "ban";
    budget.unionsBanned = banned;
    // Source applyUnionLawProvision clears every old underground cell when a
    // new ban starts. Repeal restores half of the shadow pool to legal
    // organizing strength, then clears the shadow state and organizer banks.
    for (const union of Object.values(world.unions)) {
      if (union.countryId === countryId) {
        union.suspended = banned;
        if (banned) {
          delete union.undergroundStrength;
          delete union.heat;
          delete union.exposedUntilTurn;
          delete union.lastUndergroundDriveTurn;
          delete union.recentUndergroundDriveCount;
          delete union.undergroundProcessedTurn;
          delete union.lastUndergroundRaidTurn;
        } else {
          const shadowStrength = repealUndergroundConversion(undergroundStrength(union));
          if (union.suspended || shadowStrength > 0) {
            union.strength = Math.max(0, union.strength ?? 0) + shadowStrength;
          }
          delete union.undergroundStrength;
          delete union.heat;
          delete union.exposedUntilTurn;
          delete union.lastUndergroundDriveTurn;
          delete union.recentUndergroundDriveCount;
          delete union.undergroundProcessedTurn;
          delete union.lastUndergroundRaidTurn;
        }
        union.updatedAtTurn = world.meta.turn;
      }
    }
    const countryUnionIds = new Set(Object.values(world.unions).filter((union) => union.countryId === countryId).map((union) => union.id));
    for (const organizer of Object.values(world.unionOrganizers ?? {})) {
      if (countryUnionIds.has(organizer.unionId)) {
        delete organizer.undergroundStrength;
        delete organizer.lastUndergroundDriveTurn;
        organizer.updatedAtTurn = world.meta.turn;
      }
    }
    if (banned) triggerUnionBanStrike(world, countryId);
    else resolveUnionBanStrike(world, countryId);
    return;
  }

  budget.unionLawBias = clampUnionLawBias(provision.bias ?? 0);
}

/** Source strikes.ts lawAdjustedUnionizationThreshold, with its 0.2-per-point shift. */
export function lawAdjustedUnionizationThreshold(bias: number | undefined): number {
  const safeBias = typeof bias === "number" && Number.isFinite(bias) ? bias : 0;
  return STRIKE_UNIONIZATION_THRESHOLD - safeBias * STRIKE_LAW_THRESHOLD_WEIGHT;
}
