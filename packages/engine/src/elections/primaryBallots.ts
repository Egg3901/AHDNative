/**
 * Primary ballot scheduling shared by the live election phases.
 *
 * Ported from AHDGame `src/lib/turn/primaryBallots.ts` at the source revision
 * used by the election tally wave. Primary ballots are kept separate from the
 * general tally so the nominee transition cannot leak them into general vote
 * totals.
 */
import { turnVoteWeight } from "../electionEngine/tally/voteCalculations.js";

/** Closing stretch of a down-ballot primary, using the general window length. */
export function primaryBallotWindow(
  startTurn: number,
  primaryEndTurn: number,
  endTurn: number,
  currentTurn: number,
): { startTurn: number; endTurn: number; totalTurns: number; turnIndex: number; open: boolean } {
  const primaryLength = Math.max(1, primaryEndTurn - startTurn);
  const generalLength = Math.max(1, endTurn - primaryEndTurn);
  const windowStart = primaryEndTurn - Math.min(primaryLength, generalLength);
  const totalTurns = Math.max(1, primaryEndTurn - windowStart);
  return {
    startTurn: windowStart,
    endTurn: primaryEndTurn,
    totalTurns,
    turnIndex: Math.max(0, Math.min(currentTurn - windowStart, totalTurns - 1)),
    open: currentTurn >= windowStart && currentTurn < primaryEndTurn,
  };
}

/** Scale the resolved regional turnout pool by party registration share. */
export function partyPrimaryPools(
  totalTurnoutPool: number,
  partyIds: readonly string[],
  registrationByParty: ReadonlyMap<string, number>,
): Map<string, number> {
  const pools = new Map<string, number>();
  if (!(totalTurnoutPool > 0)) return pools;
  for (const partyId of partyIds) {
    const registration = registrationByParty.get(partyId);
    if (typeof registration !== "number" || !(registration > 0)) continue;
    pools.set(partyId, totalTurnoutPool * (Math.min(100, registration) / 100));
  }
  return pools;
}

export interface PrimaryBallotEntry {
  candidateId: string;
  sharePct: number;
}

/** Add one turn's party ballot slice to cumulative candidate totals. */
export function accruePrimaryBallotTurn(args: {
  cumulative: Readonly<Record<string, number>>;
  entriesByParty: ReadonlyMap<string, readonly PrimaryBallotEntry[]>;
  poolsByParty: ReadonlyMap<string, number>;
  totalTurns: number;
  turnIndex: number;
}): Record<string, number> {
  const next = { ...args.cumulative };
  for (const [partyId, entries] of args.entriesByParty) {
    const pool = args.poolsByParty.get(partyId);
    if (!(pool && entries.length > 0)) continue;
    const turnBallots = turnVoteWeight(args.totalTurns, args.turnIndex, pool);
    if (!(turnBallots > 0)) continue;
    const shareSum = entries.reduce((sum, entry) => sum + Math.max(0, entry.sharePct), 0);
    for (const entry of entries) {
      const fraction = shareSum > 0
        ? Math.max(0, entry.sharePct) / shareSum
        : 1 / entries.length;
      const increment = Math.round(turnBallots * fraction);
      if (increment > 0) next[entry.candidateId] = (next[entry.candidateId] ?? 0) + increment;
    }
  }
  return next;
}

/** Convert cumulative ballots into proportional within-party shares. */
export function ballotSharesWithinParty(
  candidateIds: readonly string[],
  primaryVotes: Readonly<Record<string, number>> | undefined,
): Map<string, number> | null {
  if (!primaryVotes) return null;
  const total = candidateIds.reduce((sum, id) => sum + (primaryVotes[id] ?? 0), 0);
  if (!(total > 0)) return null;
  return new Map(candidateIds.map((id) => [id, Math.round(((primaryVotes[id] ?? 0) / total) * 1000) / 10]));
}

/** Return ballot counts for a party when that party has recorded any ballots. */
export function scoreByPrimaryVotes(
  candidateIds: readonly string[],
  primaryVotes: Readonly<Record<string, number>> | undefined,
): Record<string, number> | null {
  if (!primaryVotes) return null;
  const scores: Record<string, number> = {};
  let total = 0;
  for (const id of candidateIds) {
    const votes = primaryVotes[id] ?? 0;
    scores[id] = votes;
    total += votes;
  }
  return total > 0 ? scores : null;
}
