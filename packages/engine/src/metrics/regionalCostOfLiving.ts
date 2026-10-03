import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { rngFromSeed } from "../rng.js";
import { REGIONAL_COST_OF_LIVING_SEEDS } from "./regionalCostOfLivingSeeds.js";

// Source pin AHDGame 0538f4264354eeb837dc1b0b47639e74591fca17:
// src/lib/metricEngine/registry/economic.ts costOfLivingNode and
// src/lib/metricEngine/coexistence.ts evalNode. stateEffectsPhase runs this
// after policyEffects, before demographic flows.
const BOUNDS: readonly [number, number] = [40, 200];
const INERTIA = 0.95;

function clamp(value: number): number {
  return Math.max(BOUNDS[0], Math.min(BOUNDS[1], value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function targetFor(world: WorldState, regionId: string): number {
  const urbanization = world.regionalMetrics[regionId]?.["population.urbanizationRate"]?.value;
  return 100 + ((urbanization ?? 55) - 55) * 0.3;
}

function randomizedUsSeeds(world: WorldState): Record<string, number> {
  if (world.meta.era !== "1991" && world.meta.era !== "2019") return {};
  const centers = REGIONAL_COST_OF_LIVING_SEEDS[`US:${world.meta.era}`] ?? {};
  // Game generateStateMetrics randomize(base, 5) is draw 4 of 66 per
  // state. Replay the same private seed tape as tfpSeed without consuming
  // founding/turn RNG or decoupling cost of living from its other leaves.
  const rng = rngFromSeed(`${world.meta.seed}:tfp-leaves`);
  const values: Record<string, number> = {};
  for (const [regionId, center] of Object.entries(centers)) {
    for (let drawIndex = 0; drawIndex < 66; drawIndex++) {
      const draw = rng.next();
      if (drawIndex === 4) values[regionId] = Math.round((center + (draw - 0.5) * 10) * 10) / 10;
    }
  }
  return values;
}

/** Seed only new worlds. Older saves retain the source's true missing-baseline state until their next ordinary turn. */
export function seedRegionalCostOfLiving(world: WorldState): void {
  const usSeeds = randomizedUsSeeds(world);
  for (const regionId of Object.keys(world.regionalMetrics)) {
    const metrics = world.regionalMetrics[regionId]!;
    if (metrics["economic.costOfLiving"] !== undefined) continue;
    const countryId = world.regions[regionId]?.countryId;
    const value = countryId === "US" && usSeeds[regionId] !== undefined
      ? usSeeds[regionId]
      : countryId ? REGIONAL_COST_OF_LIVING_SEEDS[`${countryId}:${world.meta.era}`]?.[regionId] : undefined;
    if (value === undefined) continue;
    metrics["economic.costOfLiving"] = { value };
  }
}

/**
 * Game metricEngine's economic.costOfLiving node: urbanization target, 0.95
 * inertia, 40..200 bounds and two decimals. A policy contribution is the
 * persisted value-minus-simBaseline delta and is retained across the EMA.
 */
export function runRegionalCostOfLiving(world: WorldState): void {
  for (const [regionId, metrics] of Object.entries(world.regionalMetrics)) {
    const target = targetFor(world, regionId);
    const row = metrics["economic.costOfLiving"];
    const previousValue = row && Number.isFinite(row.value) ? row.value : target;
    const previousBaseline = row && Number.isFinite(row.simBaseline) ? row.simBaseline! : target;
    const policyDelta = previousValue - previousBaseline;
    const baseline = round2(clamp(INERTIA * previousBaseline + (1 - INERTIA) * target));
    const value = baseline + policyDelta;
    if (!Number.isFinite(value)) {
      const fallback = row && Number.isFinite(row.value) ? row.value : BOUNDS[0];
      metrics["economic.costOfLiving"] = { value: round2(clamp(fallback)), simBaseline: fallback };
    } else {
      metrics["economic.costOfLiving"] = { value: round2(clamp(value)), simBaseline: baseline };
    }
  }
}

export const regionalCostOfLivingPhase: TurnPhase = {
  name: "regionalCostOfLiving",
  run(world) {
    runRegionalCostOfLiving(world);
  },
};
