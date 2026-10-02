import type { WorldState } from "../types.js";

/** Source ElectedOfficial.seatsHeld is the vote and party-seat weight. */
export function heldSeatCount(holder: { seatsHeld?: number }): number {
  return holder.seatsHeld ?? 1;
}

export function chamberSeatWeights(world: WorldState, countryId: string, chamberKey: string, regionId?: string): Map<string, number> {
  const weights = new Map<string, number>();
  for (const politician of world.politicians) {
    if (politician.countryId === countryId && politician.chamberKey === chamberKey &&
      (regionId === undefined || politician.electedState === regionId)) {
      weights.set(politician.id, heldSeatCount(politician));
    }
  }
  const seat = world.player.legislativeSeat;
  if (seat?.countryId === countryId && seat.chamberKey === chamberKey &&
    (regionId === undefined || seat.regionId === regionId)) weights.set("player", heldSeatCount(seat));
  return weights;
}

/** Source tallySeatsByParty reads live offices, including party switches. */
export function liveChamberSeatsByParty(world: WorldState, countryId: string, chamberKey: string): Record<string, number> {
  const seats: Record<string, number> = {};
  for (const politician of world.politicians) {
    if (politician.countryId !== countryId || politician.chamberKey !== chamberKey || !politician.partyId) continue;
    seats[politician.partyId] = (seats[politician.partyId] ?? 0) + heldSeatCount(politician);
  }
  const seat = world.player.legislativeSeat;
  if (seat?.countryId === countryId && seat.chamberKey === chamberKey) {
    // Native uses null for independent membership; Game's office row uses
    // the independent party key, including after the public leave route.
    const partyId = world.player.partyId ?? "independent";
    seats[partyId] = (seats[partyId] ?? 0) + heldSeatCount(seat);
  }
  return seats;
}
