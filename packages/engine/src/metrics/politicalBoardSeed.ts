import type { WorldState } from "../types.js";
import { POLITICAL_BOARD_SEEDS } from "./politicalBoardSeeds.js";
import { getCatalog, lawTargets, structuralResidual } from "../politicalMetrics/sourceRuntime.mjs";

/** Actual Game seeder output for regions represented by this Native preset. */
export function seedPoliticalBoards(world: WorldState): void {
  const boards = world.regionalPoliticalMetrics ??= {};
  const source = POLITICAL_BOARD_SEEDS[world.meta.era];
  if (!source) return;
  for (const [regionId, row] of Object.entries(source)) {
    if (world.regions[regionId]?.countryId !== row.countryId) continue;
    const catalog = getCatalog(row.countryId);
    const nationalLevels = new Map<string, number>();
    const regionalLevels = new Map<string, number>();
    for (const law of catalog) {
      if (law.kind === "tax") continue;
      if (law.allowedScope === "regional") {
        regionalLevels.set(law.id, law.baselineLevel ?? 0);
      } else {
        nationalLevels.set(law.id, law.baselineLevel ?? 0);
        // `both` laws start with no regional enactment; only source regional
        // sidecars carry an authored regional baseline.
        regionalLevels.set(law.id, 0);
      }
    }
    const national = lawTargets(row.countryId, nationalLevels);
    const regional = lawTargets(row.countryId, regionalLevels);
    const residuals = Object.fromEntries(Object.entries(row.values).map(([metricId, value]) => [
      metricId,
      structuralResidual(value, national[metricId] ?? 0, regional[metricId] ?? 0),
    ]));
    boards[regionId] = { countryId: row.countryId, values: { ...row.values }, residuals };
  }
}
