import type { AllocationMethod } from "./data/usPrimaryCalendar.js";

export interface DelegateAllocation {
  byCandidate: Record<string, number>;
  totalAwarded: number;
  nonViable: string[];
}

export const PR_VIABILITY_THRESHOLD = 0.15;

/** AHDGame src/lib/primaryDelegateAllocation.ts, pinned cb66acdf. */
export function allocateProportional(
  votesByCandidate: Record<string, number>,
  delegatesAvailable: number,
): DelegateAllocation {
  const entries = Object.entries(votesByCandidate).filter(([, votes]) => votes > 0);
  if (entries.length === 0 || delegatesAvailable <= 0) {
    return { byCandidate: {}, totalAwarded: 0, nonViable: [] };
  }

  const totalVotes = entries.reduce((sum, [, votes]) => sum + votes, 0);
  const viable = entries.filter(([, votes]) => votes / totalVotes >= PR_VIABILITY_THRESHOLD);
  const nonViable = entries.filter(([, votes]) => votes / totalVotes < PR_VIABILITY_THRESHOLD).map(([id]) => id);
  const pool = viable.length > 0 ? viable : entries;
  const poolTotal = pool.reduce((sum, [, votes]) => sum + votes, 0);
  const quotas = pool.map(([id, votes]) => {
    const exact = (votes / poolTotal) * delegatesAvailable;
    return { id, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  const byCandidate: Record<string, number> = {};
  for (const quota of quotas) byCandidate[quota.id] = quota.floor;
  let assigned = quotas.reduce((sum, quota) => sum + quota.floor, 0);
  const leftover = delegatesAvailable - assigned;
  if (leftover > 0) {
    const ranked = [...quotas].sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      return (votesByCandidate[b.id] ?? 0) - (votesByCandidate[a.id] ?? 0);
    });
    for (let index = 0; index < leftover && index < ranked.length; index += 1) {
      const candidateId = ranked[index]!.id;
      byCandidate[candidateId] = (byCandidate[candidateId] ?? 0) + 1;
      assigned += 1;
    }
  }
  return { byCandidate, totalAwarded: assigned, nonViable };
}

export function allocateWinnerTakeAll(
  votesByCandidate: Record<string, number>,
  delegatesAvailable: number,
  tiebreakPriority?: Record<string, number>,
): DelegateAllocation {
  const entries = Object.entries(votesByCandidate).filter(([, votes]) => votes > 0);
  if (entries.length === 0 || delegatesAvailable <= 0) {
    return { byCandidate: {}, totalAwarded: 0, nonViable: [] };
  }
  entries.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    if (tiebreakPriority) {
      const diff = (tiebreakPriority[b[0]] ?? 0) - (tiebreakPriority[a[0]] ?? 0);
      if (diff !== 0) return diff;
    }
    return a[0].localeCompare(b[0]);
  });
  const winner = entries[0]![0];
  return { byCandidate: { [winner]: delegatesAvailable }, totalAwarded: delegatesAvailable, nonViable: [] };
}

export function allocateDelegates(
  method: AllocationMethod,
  votesByCandidate: Record<string, number>,
  delegatesAvailable: number,
  tiebreakPriority?: Record<string, number>,
): DelegateAllocation {
  return method === "WTA"
    ? allocateWinnerTakeAll(votesByCandidate, delegatesAvailable, tiebreakPriority)
    : allocateProportional(votesByCandidate, delegatesAvailable);
}
