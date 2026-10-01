import type { TurnPhase } from "../phases/types.js";
import {
  addContributions,
  foldCabinetResidualsBySource,
  seedBySourceFromLegacy,
  sumCabinetResiduals,
} from "./cabinetResidual.js";

/** Game political dynamics consumes the previous ministerial snapshot. */
export const politicalCabinetResidualPhase: TurnPhase = {
  name: "politicalCabinetResiduals",
  run(world) {
    for (const [regionId, board] of Object.entries(world.regionalPoliticalMetrics ?? {})) {
      const region = world.regions[regionId];
      if (!region || region.countryId !== board.countryId) continue;
      const snapshot = world.politicalCabinetContributions?.[board.countryId];
      const contributions: Record<string, Record<string, number>> = {};
      if (snapshot && snapshot.turn < world.meta.turn) {
        for (const [source, value] of Object.entries(snapshot.sources)) {
          contributions[source] = addContributions(value.contribution, value.regional[regionId] ?? {});
        }
        if (Object.keys(snapshot.sources).length === 0) {
          const legacy = addContributions(snapshot.contribution, snapshot.regional[regionId] ?? {});
          if (Object.keys(legacy).length) contributions.legacy = legacy;
        }
      }
      const previous = board.cabinetResidualsBySource
        ?? seedBySourceFromLegacy(board.cabinetResiduals ?? {}, contributions);
      board.cabinetResidualsBySource = foldCabinetResidualsBySource(previous, contributions);
      board.cabinetResiduals = sumCabinetResiduals(board.cabinetResidualsBySource);
    }
  },
};
