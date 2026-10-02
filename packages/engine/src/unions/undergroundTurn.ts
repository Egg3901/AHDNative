import type { WorldState } from "../types.js";
import { sha256FirstUint32BE } from "../corporation/rdInnovationRng.js";
import {
  decayUndergroundHeat,
  EXPOSURE_LENGTH_TURNS,
  isUnionExposed,
  rollUndergroundDetectionOutcome,
  undergroundDetectionChance,
  undergroundHeat,
} from "./underground.js";

export interface UndergroundTurnResult {
  unionsChecked: number;
  newlyExposed: number;
}

/** Deterministic source-style heat decay and detection pass; no shared RNG draws. */
export function processUndergroundTurn(world: WorldState, turn: number): UndergroundTurnResult {
  const cells = Object.values(world.unions)
    .filter((union) => world.budgets[union.countryId]?.unionsBanned === true)
    .sort((a, b) => a.id.localeCompare(b.id));
  let newlyExposed = 0;
  let unionsChecked = 0;
  for (const union of cells) {
    if ((union.undergroundProcessedTurn ?? -1) >= turn) continue;
    unionsChecked++;
    const heat = undergroundHeat(union);
    const droveThisTurn = union.lastUndergroundDriveTurn === turn;
    const nextHeat = droveThisTurn ? heat : decayUndergroundHeat(heat);
    const recentDriveCount = typeof union.recentUndergroundDriveCount === "number" && Number.isFinite(union.recentUndergroundDriveCount)
      ? Math.max(0, union.recentUndergroundDriveCount) : 0;
    const remainingDrivePressure = recentDriveCount / 2;
    if (remainingDrivePressure >= 0.5) union.recentUndergroundDriveCount = remainingDrivePressure;
    else delete union.recentUndergroundDriveCount;
    if (typeof union.heat === "number" || nextHeat > 0) union.heat = nextHeat;
    if (!isUnionExposed(union, turn) && nextHeat >= 30) {
      const chance = undergroundDetectionChance(nextHeat, recentDriveCount);
      const roll = (sha256FirstUint32BE(`${union.id}:${turn}:underground-detection:illicit-unions-v1`) % 100) + 1;
      if (rollUndergroundDetectionOutcome(chance, roll)) {
        union.exposedUntilTurn = turn + EXPOSURE_LENGTH_TURNS - 1;
        newlyExposed++;
      }
    }
    union.undergroundProcessedTurn = turn;
    union.updatedAtTurn = turn;
  }
  return { unionsChecked, newlyExposed };
}
