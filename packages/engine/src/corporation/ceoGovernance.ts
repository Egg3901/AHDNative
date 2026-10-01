import type { Corporation } from "./types.js";

/**
 * Reconcile a stored shareholder ballot against the live share register.
 * Mainline routes tally current share ownership on every ballot operation,
 * protect an incumbent on a tie, and clear offers that are no longer leading.
 * The offline engine currently has only NPC and player share accounts.
 */
export function reconcileCeoAppointment(corp: Corporation): string | null {
  const liveShares = new Map<string, number>();
  for (const holder of corp.shareholders) {
    if (Number.isFinite(holder.shares) && holder.shares > 0) {
      liveShares.set(holder.holder, (liveShares.get(holder.holder) ?? 0) + holder.shares);
    }
  }

  // A holder has one current ballot. Collapse old duplicate rows in input
  // order, then apply that holder's current register weight (never saved weight).
  const latest = new Map<string, string>();
  for (const vote of corp.ceoVotes ?? []) {
    if ((vote.voterId === "player" || vote.voterId === "npc") && vote.candidateId) {
      latest.set(vote.voterId, vote.candidateId);
    }
  }
  const tally = new Map<string, number>();
  for (const [voterId, candidateId] of latest) {
    const weight = liveShares.get(voterId) ?? 0;
    if (weight > 0) tally.set(candidateId, (tally.get(candidateId) ?? 0) + weight);
  }

  const incumbent = corp.ceoVacant === true || corp.ceoType === "npp" ? null : corp.ceoId ?? null;
  let leader: string | null = null;
  let high = 0;
  for (const [candidateId, votes] of tally) {
    if (votes > high || (votes === high && candidateId === incumbent)) {
      leader = candidateId;
      high = votes;
    }
  }

  if (!leader || leader === incumbent) {
    delete corp.pendingCeoId;
    return null;
  }
  corp.pendingCeoId = leader;
  return leader;
}
