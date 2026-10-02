import type { WorldState } from "../types.js";
import type { Corporation } from "./types.js";

type ExecutiveTakingEligibility =
  | { takeable: true; triggers: ["npc"] | ["distress"] }
  | { takeable: false; triggers: []; reason: string };

/** Current Game eligibility/privatizationShares at cb66acdf; source turns. */
export const FINANCIAL_DISTRESS_GRACE_TURNS = 72;
export const DISTRESS_VACANT_CEO_TURNS = 72;
export const RENATIONALIZE_COOLDOWN_TURNS = 168;

/**
 * Source userId-origin classification is separate from management/shareholders.
 * All legacy Native issuers are procedurally NPC-founded (founding.ts); a
 * player CEO never changes that origin. Imported/privatized player origins
 * must be explicitly recorded, with their source clocks preserved.
 */
export function executiveTakingEligibility(world: WorldState, corporation: Corporation): ExecutiveTakingEligibility {
  if (corporation.privatizedAtTurn != null && world.meta.turn - corporation.privatizedAtTurn < RENATIONALIZE_COOLDOWN_TURNS) {
    return { takeable: false, triggers: [], reason: "This corporation was recently privatized and cannot be re-nationalized yet." };
  }
  if ((corporation.nationalizationOwnerKind ?? "npc") === "npc") {
    return { takeable: true, triggers: ["npc"] };
  }
  const hasDefaultedBond = Object.values(world.bonds).some(bond => bond.corporationId === corporation.id && bond.defaulted && !bond.matured);
  const financialMature = (corporation.liquidCapital < 0 || hasDefaultedBond)
    && corporation.financialDistressSinceTurn != null
    && world.meta.turn - corporation.financialDistressSinceTurn >= FINANCIAL_DISTRESS_GRACE_TURNS;
  const vacancyMature = corporation.ceoVacant === true && corporation.ceoVacantSinceTurn != null
    && world.meta.turn - corporation.ceoVacantSinceTurn >= DISTRESS_VACANT_CEO_TURNS;
  return financialMature || vacancyMature
    ? { takeable: true, triggers: ["distress"] }
    : { takeable: false, triggers: [], reason: "Executive power can only nationalize failing player firms after the source distress grace; a solvent player corporation requires legislative authorization." };
}

/** Source trackFinancialDistress, after corporation cash settles. No RNG. */
export function trackPlayerCorporationDistress(world: WorldState): void {
  const defaulted = new Set(Object.values(world.bonds).filter(bond => bond.defaulted && !bond.matured).map(bond => bond.corporationId));
  for (const corporation of Object.values(world.corporations)) {
    if (corporation.nationalizationOwnerKind !== "player" || corporation.countryOwnerId) continue;
    if (corporation.liquidCapital < 0 || defaulted.has(corporation.id)) {
      corporation.financialDistressSinceTurn ??= world.meta.turn;
    } else {
      delete corporation.financialDistressSinceTurn;
    }
  }
}

/** Historical absence stays absent; future/malformed clocks refuse. */
export function validateNationalizationEligibilityState(world: WorldState): void {
  for (const corporation of Object.values(world.corporations)) {
    if (corporation.nationalizationOwnerKind !== undefined && corporation.nationalizationOwnerKind !== "npc" && corporation.nationalizationOwnerKind !== "player") {
      throw new Error("Invalid nationalization owner origin");
    }
    for (const key of ["financialDistressSinceTurn", "ceoVacantSinceTurn", "privatizedAtTurn"] as const) {
      const value = corporation[key];
      if (value != null && (!Number.isInteger(value) || value < 0 || value > world.meta.turn)) throw new Error(`Invalid nationalization clock: ${key}`);
    }
  }
}
