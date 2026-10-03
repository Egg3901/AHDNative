import type { WorldState } from "../types.js";

/** Source partyCapacity.ts active-member window: 14 real-time days. */
export const PARTY_ACTIVE_MEMBER_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
export const PARTY_ACTIVE_MEMBER_MIN_ACTIONS = 2;
export const PARTY_ACTIVITY_SUMMARY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const ACTIONS_WITHOUT_SOURCE_ACTION_LOG = new Set([
  "rest",
  "joinParty",
  "leaveParty",
  "foundParty",
  "createCaucus",
  "leaveCaucus",
  "proposePartyMerger",
  "votePartyMerger",
]);

/**
 * Queue one committed player command for the source-equivalent end-of-turn
 * activity summary. Committee proposal and ballot routes do not write the
 * reference actionLogs collection, and rest is removed before summarization.
 */
export function recordPartyActivityAction(world: WorldState, actionId: string): void {
  if (ACTIONS_WITHOUT_SOURCE_ACTION_LOG.has(actionId)) return;
  const pending = (world.player.partyActivityPendingByTurn ??= {});
  const key = String(world.meta.turn);
  pending[key] = (pending[key] ?? 0) + 1;
}

/**
 * Emit the source activityLogging phase's one-per-character turn summary.
 * `summaryAtMs` is an explicit session clock reading; the engine turn itself
 * never consults the wall clock. Missing clock input means no summary is
 * written, matching the absence of a source timestamp rather than inventing
 * offline history.
 */
export function summarizePartyActivityTurn(
  world: WorldState,
  actionTurn: number,
  summaryAtMs?: number,
): void {
  const pending = world.player.partyActivityPendingByTurn;
  const key = String(actionTurn);
  const actionCount = pending?.[key] ?? 0;
  if (pending) {
    delete pending[key];
    if (Object.keys(pending).length === 0) delete world.player.partyActivityPendingByTurn;
  }
  if (actionCount <= 0 || !Number.isSafeInteger(summaryAtMs) || summaryAtMs! < 0) return;

  const summaries = (world.player.partyActivitySummaries ??= []);
  summaries.push({ timestampMs: summaryAtMs!, actionCount });
  const cutoff = summaryAtMs! - PARTY_ACTIVITY_SUMMARY_TTL_MS;
  world.player.partyActivitySummaries = summaries.filter((entry) => entry.timestampMs >= cutoff);
}

/** Source's five NPPs per active account, capped at 25 total. */
export function partyNppCapacityForActiveMembers(activeMemberCount: number): number {
  return Math.min(25, Math.max(0, Math.floor(activeMemberCount)) * 5);
}

/** One local SP human account is active only after two summarized actions in window. */
export function isPartyPlayerActive(world: WorldState, nowMs: number): boolean {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return false;
  const cutoff = nowMs - PARTY_ACTIVE_MEMBER_WINDOW_MS;
  const actionCount = (world.player.partyActivitySummaries ?? [])
    .filter((summary) => summary.timestampMs >= cutoff)
    .reduce((sum, summary) => sum + summary.actionCount, 0);
  return actionCount >= PARTY_ACTIVE_MEMBER_MIN_ACTIONS;
}
