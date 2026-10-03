import type { PoliticianPersonality } from "../types.js";

/**
 * Source: AHDGame `src/lib/partyWhips/whipSuccess.ts`.
 * Keep the per-official success curve separate from deterministic bill-vote
 * cross-pressure: hard whips roll once when issued, soft whips do not roll.
 */
export function hardNppWhipSuccessChance(
  personality: Pick<PoliticianPersonality, "loyalty" | "stubbornness"> | null | undefined,
  statecraftBonus: number,
): number {
  const loyaltyBonus = Math.round((personality?.loyalty ?? 50) * 0.35);
  const stubbornnessPenalty = Math.round((personality?.stubbornness ?? 50) * 0.18);
  return Math.max(40, Math.min(95, Math.round(55 + loyaltyBonus - stubbornnessPenalty + 15 + statecraftBonus)));
}
