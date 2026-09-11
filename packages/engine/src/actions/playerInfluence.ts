import type { WorldState } from '../types.js';

/**
 * Player reputation at the action-refresh boundary. Authority: AHDGame
 * d4baf899 shared/constants/formulas.ts and src/lib/turn/actionRefresh.ts.
 * Position NI uses the highest tier, unlike stacking office action bonuses.
 * Read actual persisted holders; HoS play mode alone does not hold an office.
 * Congress leadership remains unavailable because Native has no per-chamber
 * elected-official holder records. Central-bank chair grants AP in Game, not
 * a standalone NI tier.
 */
export function playerNationalInfluenceGain(world: WorldState): number {
  const player = world.player;
  const seat = player.legislativeSeat;
  const holdsKnownSeat = seat != null && world.legislatures[seat.countryId]?.chambers
    .some(chamber => chamber.key === seat.chamberKey);
  let position = holdsKnownSeat ? 1 : 0;

  for (const executive of Object.values(world.executives)) {
    if (executive.presidentId === 'player') position = Math.max(position, 2.5);
    if (executive.vicePresidentId === 'player') position = Math.max(position, 2);
  }
  for (const government of Object.values(world.governments)) {
    if (government.status === 'formed' && government.pmPoliticianId === 'player') {
      position = Math.max(position, 2.5);
    }
  }
  if (Object.values(world.governors).some(governor => governor.governorId === 'player')) {
    position = Math.max(position, 1);
  }
  if (world.cabinetMembers.some(member => member.characterId === 'player')) {
    position = Math.max(position, 1);
  }
  for (const party of Object.values(world.parties)) {
    if (party.chairId === 'player') position = Math.max(position, 2);
    else if (party.viceChairId === 'player' || party.treasurerId === 'player') {
      position = Math.max(position, 1.5);
    }
  }
  if (world.supremeCourtSeats.some(seat => seat.justiceMode === 'character' && seat.justiceId === 'player')) {
    position = Math.max(position, 2);
  }

  return Math.max(0, Math.min(100, player.politicalInfluence)) / 100 + position;
}
