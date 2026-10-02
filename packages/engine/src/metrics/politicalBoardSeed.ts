import type { WorldState } from "../types.js";
import { POLITICAL_BOARD_SEEDS } from "./politicalBoardSeeds.js";

/** Actual Game seeder output for regions represented by this Native preset. */
export function seedPoliticalBoards(world: WorldState): void {
  const boards = world.regionalPoliticalMetrics ??= {};
  const source = POLITICAL_BOARD_SEEDS[world.meta.era];
  if (!source) return;
  for (const [regionId, row] of Object.entries(source)) {
    if (world.regions[regionId]?.countryId !== row.countryId) continue;
    boards[regionId] = { countryId: row.countryId, values: { ...row.values } };
  }
}
