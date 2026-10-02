import type { WorldState } from "../types.js";
import {
  aggregateNationalPoliticalMetrics, categoryScore, overallScore,
  getCategoryDisplayName, getMetricDisplayName,
  POLITICAL_METRIC_CATEGORIES, POLITICAL_METRIC_FAMILIES,
} from "./sourceRuntime.mjs";

export interface PoliticalMetricRegionView { regionId: string; name: string; value: number }
export interface PoliticalMetricView {
  id: string; name: string; description: string; lean: number; value: number;
  cabinet: number;
  cabinetSources: { id: string; value: number }[];
  regions: PoliticalMetricRegionView[];
}
export interface PoliticalCategoryView { id: string; name: string; score: number; metrics: PoliticalMetricView[] }
export interface PoliticalRegistryView { overall: number; categories: PoliticalCategoryView[] }
const round1 = (value: number) => Math.round(value * 10) / 10;

/** Game's political destination uses population-weighted recorded boards. */
export function politicalMetricsForCountry(world: WorldState, countryId: string): PoliticalRegistryView | undefined {
  // These are the source registry's four authored display vocabularies. Other
  // seeded boards still participate in dynamics and source approval consumers.
  if (!["US", "UK", "RU", "DD"].includes(countryId)) return undefined;
  const boards = Object.entries(world.regionalPoliticalMetrics ?? {})
    .filter(([id, board]) => board.countryId === countryId && world.regions[id]?.countryId === countryId);
  if (!boards.length) return undefined;
  const populations = new Map(boards.map(([id]) => [id, world.regions[id]?.population ?? 0]));
  const national = aggregateNationalPoliticalMetrics(boards.map(([id, board]) => ({ _id: id, values: board.values })), populations);
  const population = Object.values(world.regions).filter(region => region.countryId === countryId)
    .reduce((sum, region) => sum + (region.population ?? 0), 0);
  const mean = (value: (id: string, board: typeof boards[number][1]) => number) => population > 0
    ? boards.reduce((sum, [id, board]) => sum + value(id, board) * (populations.get(id) ?? 0), 0) / population : 0;
  return {
    overall: round1(overallScore(national)),
    categories: POLITICAL_METRIC_CATEGORIES.map(category => ({
      id: category.id, name: getCategoryDisplayName(countryId, category.id), score: round1(categoryScore(national, category.id)),
      metrics: POLITICAL_METRIC_FAMILIES.filter(family => family.categoryId === category.id).map(family => {
        const sourceIds = new Set(boards.flatMap(([, board]) => Object.keys(board.cabinetResidualsBySource ?? {})));
        return {
          id: family.id, name: getMetricDisplayName(countryId, family.id), description: family.description,
          lean: family.lean, value: round1(national[family.id] ?? 0),
          cabinet: round1(mean((_, board) => board.cabinetResiduals?.[family.id] ?? 0)),
          cabinetSources: [...sourceIds].map(id => ({ id, value: round1(mean((_, board) => board.cabinetResidualsBySource?.[id]?.[family.id] ?? 0)) }))
            .filter(source => source.value !== 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)),
          regions: boards.map(([id, board]) => ({ regionId: id, name: world.regions[id]?.name ?? id, value: round1(board.values[family.id] ?? 0) })).sort((a, b) => b.value - a.value),
        };
      }),
    })),
  };
}
