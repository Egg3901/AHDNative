import {
  isTurnPhaseEnabled, calculateTaxAmount, getDonorBaseBonus, getFundGenerationRate,
  projectPlayerActionRefresh, projectPlayerPartyInfluence,
  type WorldState,
} from '@ahdclient/engine';

export interface ResourceDetailsView {
  actions: {
    base: number;
    seat: number;
    cabinet: number;
    chair: number;
    /** Seat + cabinet + chair, the total office AP bonus. */
    office: number;
    party?: number;
    penalty: number;
    threshold: number;
    cap: number;
    next: number;
    /** Base + office applied this turn, before the hoarding penalty. */
    refresh: number;
  };
  funds: { enabled: boolean; base: number; donor: number; office: number; tax: number; regularNet: number };
  /** Same projection the party-influence phase applies; null without a party. */
  partyInfluence: {
    current: number; closeness: number; leadership: number;
    infamyPenalty: number; gain: number; next: number; bonusActions: number;
  } | null;
  history: { turn: number; cash: number; savings: number; funds: number }[];
}

/** Mirrors the pinned player paths in actionRefresh and fundGenerationPhase.
 * NPC office/party bonuses must not be presented as player income.
 * This is the regular-generation quote at current influence, not a whole-turn forecast.
 */
export function projectResources(world: WorldState): ResourceDetailsView {
  const player = world.player;
  // Same authoritative projection the actionRefresh phase applies (#31), so
  // the footer/Profile breakdown always matches the actions actually granted.
  const refresh = projectPlayerActionRefresh(world);
  const partyDetail = projectPlayerPartyInfluence(world);
  const office = refresh.seatBonus + refresh.cabinetBonus + refresh.chairBonus;
  const party = partyDetail?.bonusActions ?? 0;
  // fundGenerationPhase uses this neutral population and a flat 5% member tax.
  const population = 5_000_000;
  const enabled = isTurnPhaseEnabled(world.featureFlags, "fundGeneration");
  const base = enabled ? getFundGenerationRate(population) : 0;
  const donor = enabled ? getDonorBaseBonus(player.donorBaseLevel, population, player.politicalInfluence) : 0;
  const tax = player.partyId && world.parties[player.partyId] ? calculateTaxAmount(base + donor, 5) : 0;
  return {
    actions: {
      base: refresh.base,
      seat: refresh.seatBonus,
      cabinet: refresh.cabinetBonus,
      chair: refresh.chairBonus,
      office,
      party,
      penalty: refresh.penalty,
      threshold: refresh.threshold,
      cap: refresh.cap,
      next: Math.min(refresh.cap, refresh.next + party),
      refresh: refresh.refresh,
    },
    funds: { enabled, base, donor, office: 0, tax, regularNet: base + donor - tax },
    partyInfluence: partyDetail
      ? {
        current: partyDetail.current, closeness: partyDetail.closeness, leadership: partyDetail.leadership,
        infamyPenalty: partyDetail.infamyPenalty, gain: partyDetail.gain, next: partyDetail.next,
        bonusActions: partyDetail.bonusActions,
      }
      : null,
    history: world.history.playerWealth.slice(-12).map(({ turn, cash, savings, funds }) => ({ turn, cash, savings, funds })),
  };
}
