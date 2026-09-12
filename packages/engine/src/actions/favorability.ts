/**
 * Favorability tiers and natural-decay helpers (single source of truth).
 *
 * Ported verbatim from the AHDGame reference at d4baf899:
 * - `FAVORABILITY_NATURAL_DECAY_THRESHOLD = 60`
 *   (shared/constants/formulas.ts:10).
 * - `calculateFavorabilityAboveThresholdPenalty`
 *   (shared/constants/formulas.ts:36-41): 0 at or below 60, else
 *   `(favorability - 60) * 0.05` per turn.
 * - The advertise action-point tier table from `getAdvertiseActionCost`
 *   (src/lib/actions.ts:213-220): `>= 85 -> 9`, `>= 70 -> 8`, `>= 50 -> 7`,
 *   `>= 30 -> 6`, else 5.
 *
 * The Profile/footer projections and the advertise cost gate read these, so the
 * displayed tier/decay and the charged cost can never drift from the reference.
 */

/** Favorability is stable at or below this value. Reference formulas.ts:10. */
export const FAVORABILITY_NATURAL_DECAY_THRESHOLD = 60;

/**
 * Per-turn favorability decay once above the natural threshold. Reference
 * formulas.ts:36-41. 60 -> 0, 70 -> -0.5, 80 -> -1.0, 90 -> -1.5, 100 -> -2.0.
 */
export function calculateFavorabilityAboveThresholdPenalty(favorability: number): number {
  const clamped = Math.max(0, Math.min(100, favorability));
  if (clamped <= FAVORABILITY_NATURAL_DECAY_THRESHOLD) return 0;
  return (clamped - FAVORABILITY_NATURAL_DECAY_THRESHOLD) * 0.05;
}

/** One offer-cost tier: an inclusive favorability floor and its advertise AP cost. */
export interface FavorabilityTier {
  min: number;
  cost: number;
}

/**
 * Advertise AP tiers by favorability, descending by floor. Reference
 * getAdvertiseActionCost (src/lib/actions.ts:213-220). The first entry whose
 * `min` is at or below the value is the current tier.
 */
export const FAVORABILITY_TIERS: readonly FavorabilityTier[] = [
  { min: 85, cost: 9 },
  { min: 70, cost: 8 },
  { min: 50, cost: 7 },
  { min: 30, cost: 6 },
  { min: 0, cost: 5 },
];

/** Action-point cost of the Advertise action at `favorability`. Reference actions.ts:213-220. */
export function advertiseActionCost(favorability: number): number {
  return favorabilityTierFor(favorability).cost;
}

/** The tier containing `favorability`; its `min` is the inclusive tier boundary. */
export function favorabilityTierFor(favorability: number): FavorabilityTier {
  const clamped = Math.max(0, Math.min(100, favorability));
  return FAVORABILITY_TIERS.find((tier) => clamped >= tier.min) ?? FAVORABILITY_TIERS[FAVORABILITY_TIERS.length - 1]!;
}
