import type { WorldState } from "../types.js";
import { MINISTERIAL_TARGET_SEEDS } from "./ministerialTargetSeeds.js";

/** Seed only the source-authored regional rows needed by these portfolios. */
export function seedMinisterialTargets(world: WorldState): void {
  for (const region of Object.values(world.regions)) {
    const value = MINISTERIAL_TARGET_SEEDS[`${region.countryId}:${world.meta.era}`]?.[region.id];
    if (value === undefined) continue;
    const metrics = world.regionalMetrics[region.id] ??= {};
    metrics["economic.unemploymentRate"] = { value };
  }
}
