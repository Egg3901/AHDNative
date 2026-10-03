/** Source `src/lib/npp/rules/mergeNationalCap.ts` national merger selection. */
export interface MergeNppRank {
  id: string;
  politicalInfluence: number;
  favorability: number;
}

/**
 * Existing survivor NPPs always remain, including when the survivor already
 * exceeds capacity. Only incoming NPPs that passed regional selection compete
 * for the remaining national slots.
 */
export function selectNationalMergeNppCull({
  survivingNpps,
  incomingNpps,
  maxNpps,
}: {
  survivingNpps: readonly Pick<MergeNppRank, "id">[];
  incomingNpps: readonly MergeNppRank[];
  maxNpps: number;
}): string[] {
  if (!Number.isSafeInteger(maxNpps) || maxNpps < 0) {
    throw new Error("Invalid post-merger NPP capacity");
  }
  const remaining = Math.max(0, maxNpps - survivingNpps.length);
  return [...incomingNpps]
    .sort((a, b) => {
      const influence = finiteRank(b.politicalInfluence) - finiteRank(a.politicalInfluence);
      if (influence !== 0) return influence;
      const favorability = finiteRank(b.favorability) - finiteRank(a.favorability);
      if (favorability !== 0) return favorability;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(remaining)
    .map((npp) => npp.id);
}

function finiteRank(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
