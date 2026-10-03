import type { WorldState } from "../types.js";
import { sociMultiplier } from "../economy/stateOwnershipConcentration.js";
import type { CompensationTier } from "./nationalizationCompensation.js";
import type { NationalizationTrigger } from "./pendingNationalizations.js";

const CONFIDENCE_WEIGHT: Record<CompensationTier, number> = { fair: 0.1, discounted: 0.55, seizure: 1 };
const POLITICAL_WEIGHT: Record<CompensationTier, number> = { fair: 0.5, discounted: 0.75, seizure: 1 };

/** Game's executive route passes a null governing party, hence neutral ideology.
 * Legislative notices retain their governing party and political framing.
 * Distress rescues and monopoly breakups are popular; NPC takings are neutral.
 * Leader-confidence state is not yet represented by Native's executive model. */
export function applyExecutiveTakingConsequences(
  world: WorldState,
  countryId: string,
  triggers: readonly NationalizationTrigger[],
  tier: CompensationTier,
  valuationAnchor: number,
  compensationAnchor: number,
  governingPartyId: string | null = null,
): { confidenceBefore: number; confidenceAfter: number } {
  const budget = world.budgets[countryId]!;
  const raw = budget.investorConfidence;
  const confidenceBefore = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 70;
  if (!triggers.some(trigger => trigger !== "npc" && trigger !== "unowned")) return { confidenceBefore, confidenceAfter: confidenceBefore };

  const concentration = sociMultiplier(budget.stateOwnershipConcentration ?? 0);
  const valuation = Math.max(0, valuationAnchor);
  const paidRatio = valuation > 0 ? Math.max(0, Math.min(1, compensationAnchor / valuation)) : 1;
  const party = governingPartyId ? world.parties[governingPartyId] : undefined;
  const economic = party?.countryId === countryId ? party.economicPosition : undefined;
  const ideology = typeof economic === "number" && Number.isFinite(economic) ? 1 + Math.max(-1, Math.min(1, economic / 5)) * 0.5 : 1;
  const popular = triggers.includes("distress") || triggers.includes("monopoly");
  const hit = Math.max(0, 8 * concentration * ideology * (popular ? 0.25 : 1) + 12 * CONFIDENCE_WEIGHT[tier] * (1 - paidRatio) * ideology);
  const confidenceAfter = Math.max(0, confidenceBefore - hit);
  if (hit > 0) {
    budget.investorConfidence = confidenceAfter;
    budget.investorConfidenceUpdatedAtTurn = world.meta.turn;
  }

  // Game applyLegacyTrustDelta converts publicTrust's quality span of 60
  // to governance.integrity board points, capped at 12. This event changes
  // the value; law residuals and their equilibrium are preserved.
  const trustDelta = (popular ? 3 - 4 * (concentration - 1) : -4 * ideology * concentration) * POLITICAL_WEIGHT[tier];
  if (Math.abs(trustDelta) >= 0.001) {
    const boardDelta = Math.max(-12, Math.min(12, trustDelta / 60 * 100));
    for (const board of Object.values(world.regionalPoliticalMetrics ?? {})) {
      const current = board.values["governance.integrity"];
      if (board.countryId === countryId && typeof current === "number" && Number.isFinite(current)) {
        board.values["governance.integrity"] = Math.max(0, Math.min(100, current + boardDelta));
      }
    }
  }
  return { confidenceBefore, confidenceAfter };
}
