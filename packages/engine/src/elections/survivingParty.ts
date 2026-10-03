import type { WorldState } from "../types.js";

/** Follow the source party-merge chain before seating an election winner. */
export function survivingElectionPartyId(world: WorldState, partyId: string | null | undefined): string | null | undefined {
  if (partyId == null) return partyId;
  let current = partyId;
  for (let depth = 0; depth < 16; depth += 1) {
    const target = world.parties[current]?.mergedIntoPartyId;
    if (target == null || target === current) return current;
    current = target;
  }
  return current;
}
