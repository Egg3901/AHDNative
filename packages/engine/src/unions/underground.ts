/** Source-backed underground organizing rules used while national union law suspends legal operations. */
export type UndergroundDriveMode = "quiet" | "mass";
export type UndergroundStatus = "dark" | "suspected" | "exposed";
export type UndergroundHeatText = "cold" | "warm" | "hot";

export const UNDERGROUND_ACTION_COST = 10;
export const UNDERGROUND_QUIET_STRENGTH_GAIN = 4;
export const UNDERGROUND_MASS_STRENGTH_GAIN = 9;
export const UNDERGROUND_QUIET_HEAT = 4;
export const UNDERGROUND_MASS_HEAT = 12;
export const HEAT_DETECTION_THRESHOLD = 30;
export const HEAT_DECAY_PER_TURN = 2;
export const DETECTION_CHANCE_PER_RECENT_DRIVE = 4;
export const EXPOSURE_LENGTH_TURNS = 6;
export const EXPOSED_EFFICIENCY_MULTIPLIER = 0.5;
export const REPEAL_UNDERGROUND_HAIRCUT = 0.5;
const DETECTION_CHANCE_PER_HEAT = 2;
const DETECTION_CHANCE_MAX = 60;

export interface UndergroundUnionState {
  undergroundStrength?: number;
  heat?: number;
  exposedUntilTurn?: number | null;
}

export function undergroundStrength(union: UndergroundUnionState): number {
  return typeof union.undergroundStrength === "number" && Number.isFinite(union.undergroundStrength) && union.undergroundStrength > 0
    ? union.undergroundStrength : 0;
}

export function undergroundHeat(union: UndergroundUnionState): number {
  return typeof union.heat === "number" && Number.isFinite(union.heat) && union.heat > 0
    ? Math.min(100, union.heat) : 0;
}

export function isUnionExposed(union: UndergroundUnionState, turn: number): boolean {
  return typeof union.exposedUntilTurn === "number" && Number.isFinite(union.exposedUntilTurn) && turn <= union.exposedUntilTurn;
}

export function undergroundStatus(union: UndergroundUnionState, turn: number): UndergroundStatus {
  if (isUnionExposed(union, turn)) return "exposed";
  return undergroundHeat(union) >= HEAT_DETECTION_THRESHOLD ? "suspected" : "dark";
}

export function undergroundHeatText(union: UndergroundUnionState): UndergroundHeatText {
  const heat = undergroundHeat(union);
  return heat >= 60 ? "hot" : heat >= 15 ? "warm" : "cold";
}

export function approvalHeatMultiplier(approval: number): number {
  const value = Number.isFinite(approval) ? approval : 50;
  return value >= 60 ? 1 : value >= 40 ? 1.25 : 1.5;
}

export function resolveUndergroundDrive(input: { mode: UndergroundDriveMode; approval: number; exposed: boolean }): { strengthGain: number; heat: number } {
  const gain = input.mode === "mass" ? UNDERGROUND_MASS_STRENGTH_GAIN : UNDERGROUND_QUIET_STRENGTH_GAIN;
  const baseHeat = input.mode === "mass" ? UNDERGROUND_MASS_HEAT : UNDERGROUND_QUIET_HEAT;
  return {
    strengthGain: Math.round(gain * (input.exposed ? EXPOSED_EFFICIENCY_MULTIPLIER : 1) * 10) / 10,
    heat: Math.round(baseHeat * approvalHeatMultiplier(input.approval)),
  };
}

export function undergroundDetectionChance(heat: number, recentDriveCount = 0): number {
  const value = Math.max(0, Math.min(100, Number.isFinite(heat) ? heat : 0));
  if (value < HEAT_DETECTION_THRESHOLD) return 0;
  const drives = Math.max(0, Math.min(5, Number.isFinite(recentDriveCount) ? recentDriveCount : 0));
  return Math.min(DETECTION_CHANCE_MAX, (value - HEAT_DETECTION_THRESHOLD + 1) * DETECTION_CHANCE_PER_HEAT + drives * DETECTION_CHANCE_PER_RECENT_DRIVE);
}

export function rollUndergroundDetectionOutcome(chance: number, roll: number): boolean {
  return chance > 0 && roll <= chance;
}

export function decayUndergroundHeat(heat: number): number {
  const value = Math.max(0, Math.min(100, Number.isFinite(heat) ? heat : 0));
  return Math.max(0, value - HEAT_DECAY_PER_TURN);
}

export function repealUndergroundConversion(pool: number): number {
  const value = typeof pool === "number" && Number.isFinite(pool) && pool > 0 ? pool : 0;
  return Math.round(value * REPEAL_UNDERGROUND_HAIRCUT * 10) / 10;
}
