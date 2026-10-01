/** Game 08820d1: successful ActionTypes accrue XP; actionRefresh consumes it.
 * Generic idle decay is disabled in that source. Debate has its separate clock.
 */
import type { WorldState } from "../types.js";
import { STAT_KEYS, clampStat, type StatKey } from "./characterStats.js";

const ACTION_STATS: Readonly<Record<string, StatKey>> = {
  fundraise: "fundraising", buildDonorBase: "fundraising",
  campaign: "charisma", advertise: "charisma", poll: "intellect", pollLarge: "intellect",
};
const CHARACTER_ACTIONS = new Set([...Object.keys(ACTION_STATS), "convertCash", "rest"]);
export function accrueCharacterActionXp(world: WorldState, actionId: string): void {
  const player = world.player;
  if (!world.featureFlags.rpgStats || !player.stats || !CHARACTER_ACTIONS.has(actionId)) return;
  player.statXp ??= {};
  const trained = ACTION_STATS[actionId];
  if (trained && player.stats[trained] !== undefined) player.statXp[trained] = (player.statXp[trained] ?? 0) + 0.03;
  if (player.stats.energy !== undefined) player.statXp.energy = (player.statXp.energy ?? 0) + 0.03;
}
export function flushCharacterStatXp(world: WorldState): void {
  const player = world.player;
  if (!world.featureFlags.rpgStats || !player.stats) return;
  const next = { ...player.stats };
  for (const key of STAT_KEYS) {
    const current = next[key];
    if (key !== "debate" && current !== undefined) next[key] = clampStat(current + (player.statXp?.[key] ?? 0));
  }
  player.stats = next;
  player.statXp = {};
  // MP's real-time interval maps to 72 completed turns in deterministic SP,
  // following the existing one-hour/one-turn membership clock adaptation.
  // Keep game-calendar weeks separate from the reference's wall clock.
  const anchor = player.debateDecayAnchorTurn;
  if (anchor === undefined) {
    player.debateDecayAnchorTurn = world.meta.turn;
  } else {
    const windows = Math.floor((world.meta.turn - anchor) / 72);
    if (windows > 0) {
      if (next.debate !== undefined) next.debate = Math.max(1, next.debate - windows);
      player.debateDecayAnchorTurn = anchor + windows * 72;
    }
  }
}
