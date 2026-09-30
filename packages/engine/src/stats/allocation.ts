/**
 * AHDGame 6ed11a3: character/reallocate-stats route. Allocation stays a
 * one-time 28-point choice; the one free reset spends no money or AP.
 * SP uses the saved game date for the decay anchor rather than wall time.
 */
import type { PlayerCharacter, WorldState } from "../types.js";
import { STAT_KEYS, validateStatAllocation } from "./characterStats.js";

/** Pre-lifecycle Native creation saves already contain a full allocated block. */
export function hasAllocatedStats(player: PlayerCharacter): boolean {
  return player.statsAllocated ?? STAT_KEYS.every(key => player.stats?.[key] !== undefined);
}

export function allocatePlayerStats(world: WorldState, input: unknown): void {
  if (!world.featureFlags.rpgStats) throw new Error("The stat system is not currently enabled.");
  const validation = validateStatAllocation(input);
  if (!validation.ok) throw new Error(validation.error);
  if (hasAllocatedStats(world.player)) throw new Error("Stats already allocated.");
  world.player.stats = validation.stats;
  world.player.statsAllocated = true;
  world.player.statXp = {};
  world.player.debateDecayAnchor = world.meta.date;
}

export function reallocatePlayerStats(world: WorldState, input: unknown): void {
  if (!world.featureFlags.rpgStats) throw new Error("The stat system is not currently enabled.");
  const validation = validateStatAllocation(input);
  if (!validation.ok) throw new Error(validation.error);
  const player = world.player;
  if (!hasAllocatedStats(player)) throw new Error("Allocate your stats before reallocating.");
  if (player.statsReallocationUsed) throw new Error("You have already used your free stat reallocation.");
  player.stats = validation.stats;
  player.statsAllocated = true;
  player.statsReallocationUsed = true;
  player.statXp = {};
  player.debateDecayAnchor = world.meta.date;
}
