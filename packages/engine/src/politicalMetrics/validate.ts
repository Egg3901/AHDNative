import type { WorldState } from "../types.js";
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Keep recorded political boards attached to their actual jurisdiction. */
export function validatePoliticalState(world: WorldState): void {
  if (world.regionalPoliticalMetrics !== undefined && !record(world.regionalPoliticalMetrics)) {
    throw new Error("Political board store is invalid");
  }
  for (const [regionId, board] of Object.entries(world.regionalPoliticalMetrics ?? {})) {
    if (!record(board) || !world.regions[regionId] || board.countryId !== world.regions[regionId]?.countryId) {
      throw new Error(`Political board ${regionId} country does not match its region`);
    }
    if (!record(board.values)) throw new Error(`Political board ${regionId} values are invalid`);
    for (const [metricId, value] of Object.entries(board.values)) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error(`Political board ${regionId} value ${metricId} is outside its score scale`);
      }
    }
  }
}
