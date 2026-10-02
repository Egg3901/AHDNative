/**
 * National metrics aggregation — port of src/lib/nationalMetrics.ts
 * computeNationalMetrics and src/lib/country/nationalMetrics.ts.
 *
 * Each country's national metrics are weighted aggregates of regional values.
 * Most metrics are population-weighted; gdpGrowth is GDP-weighted so larger
 * economies contribute proportionally. governance.budgetBalance and
 * governance.debtToGdp are budget-derived mirrors (surplus/gdp, debtToGdpRatio).
 *
 * Metric families ported (per mainline MetricCategoryId): economic,
 * education, healthcare, infrastructure, publicSafety, environment, social,
 * governance, population. MediaInformation is PORT-STUB (no source in solo).
 *
 * Activation gates: metric rows that are not active for (countryId, year) per
 * metricActivation.isMetricActive are omitted from that country's aggregation.
 * Source: src/lib/era/metricCatalog.ts METRIC_ERA_WINDOWS + isMetricActive.
 *
 * Blocked inputs (PORT-STUB with named blocker):
 *  - Per-state metric values for categories where solo has no StateMetrics store:
 *    E01_PER_STATE_METRICS — solo aggregates from Country.economy and budget
 *    mirrors for economic/governance; other families fall back to 0 and are
 *    marked stale until state-level metric evolution lands.
 *  - TFP basket leaves: the six exact AHDGame tfpBasket paths
 *    (demographics/laborForce.ts TFP_METRIC_PATHS) are aggregated from
 *    population-weighted regional inputs and gated by isMetricActive. The four
 *    metrics projected from Game's regional political board use the current
 *    board conversion when that source board exists; R&D intensity and
 *    urbanization, plus boardless legacy saves, use their recorded regional
 *    metric rows. This keeps the source authority and does not invent a
 *    national stand-in for a missing regional input.
 *  - Enacted-law/flagship-law lists for law-weighted signals: E02_LEGISLATION_LAW_TAGS
 *  - FTA/tariff pressure for cost-of-living: E03_TARIFF_FTA_COVERAGE (see inflationRecalc)
 *
 * Sources:
 *  - src/lib/nationalMetrics.ts computeNationalMetrics (weighted aggregation)
 *  - src/lib/nationalMetrics.ts METRIC_CATEGORIES, GDP_WEIGHTED_METRICS = {gdpGrowth}
 *  - src/lib/era/metricCatalog.ts isMetricActive
 *  - src/lib/country/nationalMetrics.ts aggregateNationalGdp incomeBandIndex pattern (not wired)
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { TFP_METRIC_PATHS } from "../demographics/laborForce.js";
import { isMetricActive } from "./metricActivation.js";
import { legacyPoliticalHalfFromBoard } from "../politicalMetrics/sourceRuntime.mjs";

export type MetricValue = { value: number };

export type NationalMetrics = Record<string, MetricValue>; // key "category.metric"

export const METRIC_CATEGORIES = [
  "economic",
  "education",
  "healthcare",
  "infrastructure",
  "publicSafety",
  "environment",
  "social",
  "governance",
  "population",
] as const;

export const GDP_WEIGHTED_METRICS = new Set<string>(["gdpGrowth"]);

// Game's macro phase reads these four TFP inputs from the current regional
// political board through politicalInputs.legacyUnit(). Only R&D intensity and
// urbanization remain in the macro metric store. The Native national macro
// keeps the same source values by aggregating the projected regional inputs.
const POLITICAL_TFP_PATHS = new Set<string>([
  TFP_METRIC_PATHS.workforceSkill,
  TFP_METRIC_PATHS.transportEfficiency,
  TFP_METRIC_PATHS.broadbandAccess,
  TFP_METRIC_PATHS.powerGridReliability,
]);

function currentYearFromDate(date: string): number | null {
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export function computeNationalMetricsForCountry(
  countryId: string,
  world: WorldState,
): NationalMetrics {
  const out: NationalMetrics = {};
  const year = currentYearFromDate(world.meta.date);
  const country = world.countries[countryId];
  if (!country) return out;

  // Economic family: from Country.economy (national source in solo).
  // These are population-independent national values, so we write them directly
  // rather than weighting — weighting matters only when per-region values exist
  // (E01 blocked: solo has no per-region economic StateMetrics).
  const econ = country.economy;
  const economicEntries: Array<[string, number]> = [
    ["economic.gdpGrowth", econ.growthRate * 100], // stored as fraction, display as %
    ["economic.inflationRate", econ.inflationRate * 100],
    ["economic.unemploymentRate", econ.unemploymentRate * 100],
    // gdp itself is a LEVEL, not a metric family member, but expose per-capita proxy via budget
  ];
  for (const [key, value] of economicEntries) {
    const metricId = key.split(".")[1]!;
    if (!isMetricActive(metricId, countryId, year)) continue;
    if (Number.isFinite(value)) out[key] = { value: Math.round(value * 1000) / 1000 };
  }

  // Governance mirrors from budget (mainline: surplus/gdp, debtToGdpRatio)
  const budget = world.budgets[countryId];
  if (budget && budget.gdp > 0) {
    const surplus = typeof budget.surplus === "number"
      ? budget.surplus
      : (budget.revenue?.total ?? 0) - (budget.spending?.total ?? 0);
    const balanceVal = (surplus / budget.gdp) * 100;
    if (isMetricActive("budgetBalance", countryId, year) && Number.isFinite(balanceVal)) {
      out["governance.budgetBalance"] = { value: Math.round(balanceVal * 1000) / 1000 };
    }
    // debtToGdpRatio is not computed in solo's budget (PORT-STUB E02), so governance.debtToGdp
    // is left absent unless a future fiscal wave populates it.
    const debtRatio = (budget as unknown as Record<string, unknown>).debtToGdpRatio as number | undefined;
    if (typeof debtRatio === "number" && Number.isFinite(debtRatio) && isMetricActive("debtToGdp", countryId, year)) {
      out["governance.debtToGdp"] = { value: Math.round(debtRatio * 100 * 1000) / 1000 };
    }
  }

  // ── TFP basket leaves (the six exact AHDGame tfpBasket paths) ────────────
  // Mainline's macro phase reads four leaves from the current political board
  // through legacyUnit; R&D intensity and urbanization are macro-metric roots.
  // The Native end-of-turn aggregate applies that same board conversion to the
  // four board-backed leaves, and uses recorded regional metric rows for the
  // two roots or when loading a world without source board state. Values remain
  // population-weighted and era-gated. No synthetic national stand-in: when no
  // region records a leaf it stays absent and macroCountryTurn falls back to
  // TFP_REFERENCE_INPUTS (TFP_BASELINE 1.2).
  const countryRegionIds = Object.values(world.regions)
    .filter((region) => region.countryId === countryId)
    .map((region) => region.id);
  for (const path of Object.values(TFP_METRIC_PATHS)) {
    const leaf = path.slice(path.lastIndexOf(".") + 1);
    if (!isMetricActive(leaf, countryId, year)) continue;
    let weightedSum = 0;
    let weightTotal = 0;
    for (const regionId of countryRegionIds) {
      let value: number | undefined;
      if (POLITICAL_TFP_PATHS.has(path)) {
        const board = world.regionalPoliticalMetrics?.[regionId];
        if (board?.countryId === countryId) {
          const [category, metricId] = path.split(".");
          const sourceMetrics = legacyPoliticalHalfFromBoard(board.values, {
            countryId,
            ...(year !== null ? { year } : {}),
          });
          const projected = category && metricId ? sourceMetrics?.[category]?.[metricId]?.value : undefined;
          if (typeof projected === "number" && Number.isFinite(projected)) value = projected;
        }
      }
      value ??= world.regionalMetrics?.[regionId]?.[path]?.value;
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const weight = world.regions[regionId]?.population ?? 0;
      if (!(weight > 0)) continue;
      weightedSum += value * weight;
      weightTotal += weight;
    }
    if (weightTotal > 0) {
      out[path] = { value: Math.round((weightedSum / weightTotal) * 1000) / 1000 };
    }
  }

  // Other families: PORT-STUB — no per-region source in solo yet.
  // We keep the keys absent rather than inventing zeros that would claim coverage.
  // Blockers: E01_PER_STATE_METRICS (stateMetrics store absent), E02_LEGISLATION_LAW_TAGS.

  return out;
}

export function computeNationalMetrics(world: WorldState): void {
  for (const countryId of Object.keys(world.countries).sort()) {
    world.nationalMetrics[countryId] = computeNationalMetricsForCountry(countryId, world);
  }
}

export const nationalMetricsPhase: TurnPhase = {
  name: "nationalMetrics",
  run(world) {
    computeNationalMetrics(world);
  },
};
