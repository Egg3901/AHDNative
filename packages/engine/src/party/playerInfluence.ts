import type { PlayerCharacter, WorldState } from '../types.js';
import {
  PARTY_INFLUENCE_BASE_RATE, PARTY_INFLUENCE_DECAY_RATE, PARTY_INFLUENCE_MAX_BONUS,
  PARTY_INFLUENCE_MAX_PENALTY, PARTY_INFLUENCE_POOL_MULTIPLIER,
} from './constants.js';
import { computeBonusActions, computeClosenessScalar, computeInfamyPenalty, computeNewInfluence, computeTurnGain } from './partyInfluence.js';

/**
 * Game d4baf899 turn/partyInfluenceTurn.ts. The pool contains Characters,
 * never NPPs, so one local SP Character has a pool of three. The turn caller
 * passes its bootstrap Character snapshot; display callers use current state.
 * Leadership holders are read live, matching the reference phase's queries.
 */
export function projectPlayerPartyInfluence(world: WorldState, source: Readonly<PlayerCharacter> = world.player) {
  const party = source.partyId ? world.parties[source.partyId] : undefined;
  if (!party || party.countryId !== source.countryId) return null;
  const current = source.partyInfluence ?? 0;
  const closeness = computeClosenessScalar(
    source.policies?.economic ?? 0, source.policies?.social ?? 0,
    party.economicPosition, party.socialPosition,
  );
  const stateOrgs = Object.values(world.partyRegions);
  const activeCaucuses = world.caucuses.filter(caucus => caucus.disbandedAt === null);
  const leadership = (party.chairId === 'player' ? 5 : 0)
    + (party.viceChairId === 'player' ? 2 : 0)
    + (party.treasurerId === 'player' ? 2 : 0)
    + (party.committeeIds?.includes('player') ? 1 : 0)
    + (stateOrgs.some(org => org.chairId === 'player') ? 2 : 0)
    + (stateOrgs.some(org => org.viceChairId === 'player') ? 1 : 0)
    + (activeCaucuses.some(caucus => caucus.chairId === 'player') ? 2 : 0)
    + (activeCaucuses.some(caucus => caucus.viceChairId === 'player') ? 1 : 0);
  const infamyPenalty = computeInfamyPenalty(source.infamy, PARTY_INFLUENCE_MAX_PENALTY);
  const gain = computeTurnGain(closeness, leadership, infamyPenalty, PARTY_INFLUENCE_BASE_RATE);
  return {
    current, closeness, leadership, infamyPenalty, gain,
    next: computeNewInfluence(current, gain, PARTY_INFLUENCE_DECAY_RATE),
    bonusActions: computeBonusActions(current, current, PARTY_INFLUENCE_POOL_MULTIPLIER, closeness, PARTY_INFLUENCE_MAX_BONUS),
  };
}
