/**
 * Countable achievement triggers — the single source of truth for the
 * achievements whose condition is an action count.
 *
 * achievements/evaluate.ts derives its count checks from this map, and the
 * Profile projection reads the same map to show `current / target` progress, so
 * a threshold and the progress bar rendered for it can never diverge.
 *
 * Only slugs whose trigger is genuinely countable in `world.player.actionCounts`
 * are listed. Boolean/current-state triggers (offices, elections, bills, funds)
 * have no honest numeric target and stay absent — the Profile shows no
 * fabricated progress for them.
 */
import type { WorldState } from "../types.js";

/** Sentinel `actionId`: sum every action count (century_club). */
const ACHIEVEMENT_TOTAL_ACTIONS = "__total";

export interface AchievementCountTrigger {
  /** `actionCounts` key, or the total-actions sentinel. */
  actionId: string;
  /** Count at which the trigger fires. Mirrors evaluate.ts exactly. */
  target: number;
}

/**
 * slug -> { actionId, target }. Values mirror the CHECKS entries in
 * achievements/evaluate.ts (fundraise 10/50, campaign 10, buildDonorBase 5,
 * advertise 3, rest 1, total actions 100, wireTransfer 1).
 */
export const ACHIEVEMENT_COUNT_TRIGGERS: Readonly<Record<string, AchievementCountTrigger>> = {
  first_fundraise: { actionId: "fundraise", target: 1 },
  fundraiser: { actionId: "fundraise", target: 10 },
  big_fundraiser: { actionId: "fundraise", target: 50 },
  campaigner: { actionId: "campaign", target: 10 },
  grassroots: { actionId: "buildDonorBase", target: 5 },
  advertiser: { actionId: "advertise", target: 3 },
  rested: { actionId: "rest", target: 1 },
  century_club: { actionId: ACHIEVEMENT_TOTAL_ACTIONS, target: 100 },
  donor: { actionId: "wireTransfer", target: 1 },
};

function actionCount(world: WorldState, actionId: string): number {
  return world.player.actionCounts?.[actionId] ?? 0;
}

function totalActionCount(world: WorldState): number {
  return Object.values(world.player.actionCounts ?? {}).reduce((sum, n) => sum + n, 0);
}

/** Current/target progress for one countable trigger, from persisted counts only. */
export function achievementCountProgress(
  world: WorldState,
  trigger: AchievementCountTrigger,
): { current: number; target: number } {
  const current = trigger.actionId === ACHIEVEMENT_TOTAL_ACTIONS
    ? totalActionCount(world)
    : actionCount(world, trigger.actionId);
  return { current, target: trigger.target };
}
