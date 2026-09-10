import {
  isTurnPhaseEnabled, calculateTaxAmount, getDonorBaseBonus, getFundGenerationRate,
  MIN_BASE_ACTIONS_PER_TURN, ACTION_HOARD_PENALTY, ENERGY_BASE_ACTION_CAP, ENERGY_BASE_HOARD_THRESHOLD,
  type WorldState,
} from '@ahdclient/engine';

export interface ResourceDetailsView {
  actions: { base: number; office: number; penalty: number; threshold: number; cap: number; next: number };
  funds: { enabled: boolean; base: number; donor: number; office: number; tax: number; regularNet: number };
  history: { turn: number; cash: number; savings: number; funds: number }[];
}

/** Mirrors the pinned player paths in actionRefresh and fundGenerationPhase.
 * NPC office/party bonuses must not be presented as player income.
 * This is the regular-generation quote at current influence, not a whole-turn forecast.
 */
export function projectResources(world: WorldState): ResourceDetailsView {
  const player = world.player;
  const penalty = player.actions > ENERGY_BASE_HOARD_THRESHOLD ? ACTION_HOARD_PENALTY : 0;
  // fundGenerationPhase uses this neutral population and a flat 5% member tax.
  const population = 5_000_000;
  const enabled = isTurnPhaseEnabled(world.featureFlags, "fundGeneration");
  const base = enabled ? getFundGenerationRate(population) : 0;
  const donor = enabled ? getDonorBaseBonus(player.donorBaseLevel, population, player.politicalInfluence) : 0;
  const tax = player.partyId && world.parties[player.partyId] ? calculateTaxAmount(base + donor, 5) : 0;
  return {
    actions: { base: MIN_BASE_ACTIONS_PER_TURN, office: 0, penalty, threshold: ENERGY_BASE_HOARD_THRESHOLD,
      cap: ENERGY_BASE_ACTION_CAP, next: Math.min(ENERGY_BASE_ACTION_CAP, Math.max(0, player.actions - penalty + MIN_BASE_ACTIONS_PER_TURN)) },
    funds: { enabled, base, donor, office: 0, tax, regularNet: base + donor - tax },
    history: world.history.playerWealth.slice(-12).map(({ turn, cash, savings, funds }) => ({ turn, cash, savings, funds })),
  };
}
