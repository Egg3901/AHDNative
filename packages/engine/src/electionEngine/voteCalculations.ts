/**
 * Vote calculation helpers shared by primary and general election
 * distributors.
 *
 * The live tally only needs effective favorability from this module. The
 * state level vote potential helpers remain in the nested tally module.
 */

/**
 * Calculate effective favorability for one demographic archetype.
 *
 * Source: `src/lib/electionEngine/voteCalculations.ts` at
 * `d4baf899fd8bd529099f03d7410807143604e2e5`.
 */
export function calcEffectiveFavorability(
  baseFavorability: number,
  archetypeApproval: number | undefined,
): number {
  const adjustment = (archetypeApproval ?? 0) * 0.5;
  return Math.max(0, Math.min(100, baseFavorability + adjustment));
}
