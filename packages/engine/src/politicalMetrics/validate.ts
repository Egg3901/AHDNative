import type { WorldState } from "../types.js";

/** Keep recorded political boards attached to their actual jurisdiction. */
export function validatePoliticalState(world: WorldState): void {
  for (const [regionId, board] of Object.entries(world.regionalPoliticalMetrics ?? {})) {
    if (board.countryId !== world.regions[regionId]?.countryId) {
      throw new Error(`Political board ${regionId} country does not match its region`);
    }
  }
}
