/**
 * Org sanctions — Native port of the pure half of
 * src/lib/internationalOrganizations/sanctions.ts (buildOrganizationSanctionEmbargoes).
 *
 * A passed sanctions resolution makes every member except the target embargo the
 * target on the chosen commodity (block, both directions). Native stores these
 * on the passed resolution's org (InternationalOrgState.embargoes) rather than a
 * standalone `tradeEmbargoes` collection, so no new top-level WorldState field
 * (and therefore no schema bump) is needed.
 *
 * GAP (named): the reference's embargo rows are read by the tariff/trade layer
 * each turn. Native has no trade-embargo consumer (see the issue report), so a
 * passed sanction's embargoes are recorded and lifted on schedule but do not yet
 * gate trade — the same PORT-STUB status the reference's own file doc gives the
 * Directive/aid effects.
 */
import type { TradeEmbargo } from "./types.js";

export interface BuildSanctionEmbargoesParams {
  resolutionId: string;
  targetCountryId: string;
  commodity: string | "all";
  members: string[];
  currentTurn: number;
  /** Turn the embargoes lift; omitted = durable until repealed. */
  expiresTurn?: number | undefined;
}

/**
 * Build the org-origin embargo documents a passed sanctions resolution enacts.
 * Pure — no world mutation — so the fan-out is unit-testable. Source:
 * buildOrganizationSanctionEmbargoes.
 */
export function buildOrganizationSanctionEmbargoes(params: BuildSanctionEmbargoesParams): TradeEmbargo[] {
  const { resolutionId, targetCountryId, commodity, members, currentTurn, expiresTurn } = params;
  return members
    .filter((m) => m !== targetCountryId)
    .map((m) => ({
      sourceCountry: m,
      targetCountry: targetCountryId,
      commodity,
      direction: "both" as const,
      mode: "block" as const,
      origin: "organization" as const,
      ...(expiresTurn !== undefined ? { expiresTurn } : {}),
      createdTurn: currentTurn,
      sourceResolutionId: resolutionId,
    }));
}

/** Lift all embargoes a sanctions resolution enacted. Source: liftOrganizationSanctions. */
export function liftOrganizationSanctions(embargoes: TradeEmbargo[], resolutionId: string): void {
  for (let i = embargoes.length - 1; i >= 0; i--) {
    if (embargoes[i]!.sourceResolutionId === resolutionId) embargoes.splice(i, 1);
  }
}
