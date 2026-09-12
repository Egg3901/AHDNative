import type { WorldState } from "@ahdclient/engine";
import type { RacePhase } from "./types";

/**
 * Race lifecycle stage derived from the persisted record, not a stored flag.
 * Mirrors the reference election lifecycle: upcoming, then the primary/filing
 * window, then the general voting and counting window, then the result.
 */
export const RACE_PHASE_LABELS: Record<RacePhase, string> = {
  upcoming: "Upcoming",
  primary: "Primary",
  general: "General",
  resolved: "Resolved",
};

export function racePhase(
  world: WorldState,
  election: WorldState["elections"][number],
): RacePhase {
  if (election.status === "resolved" || (election.winners?.length ?? 0) > 0) return "resolved";
  const turn = world.meta.turn;
  if (turn < election.startTurn) return "upcoming";
  if (turn < election.primaryEndTurn) return "primary";
  if (turn <= election.endTurn) return "general";
  return "resolved";
}
