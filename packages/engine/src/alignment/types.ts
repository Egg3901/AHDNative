/**
 * Alignment pole configuration — port of src/lib/constants/alignmentEras.ts
 * AlignmentPoleId (subset) + src/lib/alignment/normalize.ts AlignmentShares.
 *
 * Mainline's full pole set is "WEST" | "EAST" | "WASHINGTON" | "MOSCOW" |
 * "BEIJING". The latter three are era-gated multipolar poles tied to the
 * Non-Aligned Movement (1961) and the Sino-Soviet split. Only WEST/EAST are
 * ported. B13 named blocker: multipolar poles are not ported even though
 * later-era packs (1979, 1991, 2019) are playable (issue #112 tracks the
 * alignment-drift remainder).
 */
export type AlignmentPoleId = "WEST" | "EAST";

/**
 * A nation's alignment is a set of shares, one per pole, plus a non-aligned
 * remainder — never a single scalar. Source: normalize.ts AlignmentShares.
 * INVARIANT: every share is a multiple of 0.01 in [0,100], and
 * sum(shares) + nonAligned === 100 (enforced by normalizeShares, the single
 * write path).
 */
export interface AlignmentShares {
  shares: Partial<Record<AlignmentPoleId, number>>;
  nonAligned: number;
}

export interface AlignmentRecord extends AlignmentShares {
  countryId: string;
  updatedTurn: number;
}
