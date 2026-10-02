/**
 * Hamilton seat estimation for tally snapshots.
 *
 * Ported verbatim from the inline `seatsEstimate` closure inside
 * `src/lib/electionEngine/tallyManagement.ts#accumulateVoteTurn`.
 *
 * This is NOT `resolution/seatAllocation.ts#allocateSeats` — that resolver
 * handles authoritative seat counts, Bloc lists, and era bundles. The tally
 * snapshot is a live projection using Largest Remainder (Hamilton) with the
 * same thresholds and majoritarian bonus the resolver uses, but scoped to
 * the running vote totals.
 */

import type { EnrichedCandidate } from "../types.js";

// Shared with resolution/seatAllocation.ts: the two gates must agree or a
// race is multi-seat at resolution but single-seat in the live tally
// projection (this file previously carried a stale copy missing the soviet
// and snap types).
import { MULTI_SEAT_TYPES } from "../resolution/constants.js";
import { getMultiSeatMinShare } from "../resolution/seatAllocation.js";

export interface EstimateSeatsArgs {
  electionType: string;
  totalSeats?: number | null;
  enriched: EnrichedCandidate[];
  newTotals: Record<string, number>;
}

export function estimateSeats(args: EstimateSeatsArgs): Record<string, number> | undefined {
  const { electionType, totalSeats, enriched, newTotals } = args;
  if (!totalSeats || !MULTI_SEAT_TYPES.has(electionType)) return undefined;
  const totalVotesCast = enriched.reduce((s, ec) => s + (newTotals[ec.candidateId] ?? 0), 0);
  if (totalVotesCast === 0) return undefined;

  const minShare = getMultiSeatMinShare(electionType);
  const groupKey = (ec: EnrichedCandidate) =>
    ec.party && ec.party !== "independent" ? `party:${ec.party}` : `cand:${ec.candidateId}`;
  const votesByGroup = new Map<string, number>();
  for (const ec of enriched) {
    const k = groupKey(ec);
    votesByGroup.set(k, (votesByGroup.get(k) ?? 0) + (newTotals[ec.candidateId] ?? 0));
  }
  const eligible = enriched.filter(
    (ec) => (votesByGroup.get(groupKey(ec)) ?? 0) / totalVotesCast >= minShare,
  );

  const pool =
    eligible.length > 0
      ? eligible
      : [...enriched]
          .sort((a, b) => (newTotals[b.candidateId] ?? 0) - (newTotals[a.candidateId] ?? 0))
          .slice(0, Math.min(totalSeats, enriched.length));
  const poolVotes = pool.reduce((s, ec) => s + (newTotals[ec.candidateId] ?? 0), 0);
  if (poolVotes === 0) return undefined;

  const seats: Record<string, number> = {};
  for (const ec of enriched) seats[ec.candidateId] = 0;

  const allocations = pool.map((ec) => {
    const votes = newTotals[ec.candidateId] ?? 0;
    const exactSeats = (votes / poolVotes) * totalSeats;
    return {
      candidateId: ec.candidateId,
      floor: Math.floor(exactSeats),
      remainder: exactSeats - Math.floor(exactSeats),
    };
  });

  let allocated = 0;
  for (const a of allocations) {
    seats[a.candidateId] = a.floor;
    allocated += a.floor;
  }

  const remaining = totalSeats - allocated;
  if (remaining > 0) {
    const sorted = [...allocations].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < remaining && i < sorted.length; i++) {
      const sid = sorted[i]!.candidateId;
      seats[sid] = (seats[sid] ?? 0) + 1;
    }
  }

  return seats;
}

export { MULTI_SEAT_TYPES, getMultiSeatMinShare };
