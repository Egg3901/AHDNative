/**
 * Debate Prep roll.
 * Ports src/lib/stats/debatePrep.ts rollDebatePrep at mainline values
 * (AHDGame 36192953d src/lib/stats/statsConstants.ts: DEBATE_PREP_ACTION_COST=1,
 * DEBATE_PREP_SUCCESS_CHANCE=0.15, STAT_MIN=1, STAT_MAX=10).
 *
 * Debate is intentionally outside the generic use-growth/idle-decay system:
 * it moves only through Debate Prep attempts (here) and debate participation,
 * and decays on a real-time 72h clock in mainline. Native ports the prep
 * attempt only; see ENGINE-ADAPTATIONS.md for the turn-clock mapping.
 *
 * Deterministic pure function; the caller supplies the RNG draw.
 */

export const STAT_MIN = 1;
export const STAT_MAX = 10;
export const DEBATE_PREP_ACTION_COST = 1;
export const DEBATE_PREP_SUCCESS_CHANCE = 0.15;

export interface DebatePrepResult {
  success: boolean;
  /** Debate value after the attempt (unchanged on failure or at cap). */
  debate: number;
}

/**
 * Resolve one Debate Prep attempt. `rng` returns a float in [0, 1).
 * Success (`rng() < 15%`) raises Debate by 1, clamped at the cap.
 */
export function rollDebatePrep(rng: () => number, currentDebate: number): DebatePrepResult {
  const success = rng() < DEBATE_PREP_SUCCESS_CHANCE;
  if (!success) return { success: false, debate: currentDebate };
  return { success: true, debate: Math.min(STAT_MAX, currentDebate + 1) };
}
