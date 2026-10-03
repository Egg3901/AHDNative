import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";

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
  return clamp(100 + ((Number.isFinite(urbanization) ? urbanization! : 55) - 55) * 0.3);
}

/** Seed only new worlds. Older saves retain the source's true missing-baseline state until their next ordinary turn. */
export function seedRegionalCostOfLiving(world: WorldState): void {
  for (const regionId of Object.keys(world.regionalMetrics)) {
    const metrics = world.regionalMetrics[regionId]!;
    if (metrics["economic.costOfLiving"] !== undefined) continue;
    const target = round2(targetFor(world, regionId));
    metrics["economic.costOfLiving"] = { value: target, simBaseline: target };
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
    metrics["economic.costOfLiving"] = {
      value: round2(clamp(baseline + policyDelta)),
      simBaseline: baseline,
    };
  }
}

export const regionalCostOfLivingPhase: TurnPhase = {
  name: "regionalCostOfLiving",
  run(world) {
    runRegionalCostOfLiving(world);
  },
};
