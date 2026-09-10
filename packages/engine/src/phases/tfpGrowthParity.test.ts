import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import type { WorldState } from "../types.js";
import { TFP_REFERENCE_INPUTS, tfpBasket } from "../demographics/laborForce.js";

const OPTS = { seed: "tfp-parity-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

/**
 * Exact AHDGame prev-turn metric paths into tfpBasket
 * (src/lib/metricEngine/phase.ts at e364c0495). Not invented aliases.
 */
const TFP_PATHS = {
  rdIntensity: "economic.rdIntensity",
  workforceSkill: "education.workforceSkill",
  transportEfficiency: "infrastructure.transportEfficiency",
  broadbandAccess: "infrastructure.broadbandAccess",
  powerGridReliability: "infrastructure.powerGridReliability",
  urbanizationRate: "population.urbanizationRate",
} as const;

function injectTfpMetrics(world: WorldState, countryId: string, inputs: Record<string, number>): void {
  const row = { ...(world.nationalMetrics[countryId] ?? {}) };
  for (const [field, value] of Object.entries(inputs)) {
    const path = TFP_PATHS[field as keyof typeof TFP_PATHS];
    if (path === undefined) continue;
    row[path] = { value };
  }
  world.nationalMetrics[countryId] = row;
}

describe("tfpBasket public advanceTurn / save-replay boundary", () => {
  it("default 1953 US has no TFP basket metrics, so the missing-input gate stays open", () => {
    const world = createWorld(OPTS);
    expect(world.nationalMetrics["US"]?.[TFP_PATHS.rdIntensity]).toBeUndefined();
    advanceTurn(world);
    const metrics = world.nationalMetrics["US"] ?? {};
    for (const path of Object.values(TFP_PATHS)) {
      expect(metrics[path], path).toBeUndefined();
    }
  });

  it("preserves baseline growth when prior-turn metrics are absent or at TFP_REFERENCE_INPUTS", () => {
    const absent = createWorld(OPTS);
    const reference = createWorld(OPTS);
    injectTfpMetrics(reference, "US", TFP_REFERENCE_INPUTS);
    expect(tfpBasket(TFP_REFERENCE_INPUTS)).toBe(1.2);

    advanceTurn(absent);
    advanceTurn(reference);

    expect(reference.countries["US"]!.economy.growthRate).toBe(absent.countries["US"]!.economy.growthRate);
    expect(reference.countries["US"]!.economy.outputGap).toBe(absent.countries["US"]!.economy.outputGap);
    expect(reference.countries["US"]!.economy.unemploymentRate).toBe(
      absent.countries["US"]!.economy.unemploymentRate,
    );
    expect(reference.countries["US"]!.economy.gdp).toBe(absent.countries["US"]!.economy.gdp);
  });

  it("materially different actual rdIntensity moves first-turn output gap and unemployment per upstream rules", () => {
    const high = createWorld(OPTS);
    const low = createWorld(OPTS);
    injectTfpMetrics(high, "US", { rdIntensity: 4.5 });
    injectTfpMetrics(low, "US", { rdIntensity: 0.5 });
    expect(tfpBasket({ rdIntensity: 4.5 })).toBeGreaterThan(tfpBasket({ rdIntensity: 0.5 }));
    expect(tfpBasket({ rdIntensity: 4.5 })).toBe(1.45);
    expect(tfpBasket({ rdIntensity: 0.5 })).toBe(0.95);

    advanceTurn(high);
    advanceTurn(low);

    const highEcon = high.countries["US"]!.economy;
    const lowEcon = low.countries["US"]!.economy;

    // outputGap starts at 0, so first-turn gdpGrowth equals the sector signal
    // and is independent of TFP. TFP still enters potential, so the gap and
    // Okun unemployment move. Higher potential => lower gap, higher unemployment
    // when growth is unchanged (growing further below a higher potential).
    expect(highEcon.growthRate).toBeCloseTo(lowEcon.growthRate, 10);
    expect(highEcon.outputGap).toBeLessThan(lowEcon.outputGap);
    expect(highEcon.unemploymentRate).toBeGreaterThan(lowEcon.unemploymentRate);
    expect(highEcon.outputGap).toBeGreaterThanOrEqual(-15);
    expect(lowEcon.outputGap).toBeLessThanOrEqual(15);

    // Gap carry: next turn's gdpGrowth = potential + (gap - prevGap)*48.
    // Default nationalMetrics rebuild drops TFP keys, so both worlds fall
    // back to TFP_BASELINE on turn 2; the remaining growth gap is the
    // upstream output-gap response to turn-1 potential, not a second TFP hit.
    advanceTurn(high);
    advanceTurn(low);
    expect(high.countries["US"]!.economy.growthRate).toBeGreaterThan(low.countries["US"]!.economy.growthRate);
  });

  it("save/load of injected prior-turn metrics yields the same first-turn US economy", () => {
    const live = createWorld(OPTS);
    injectTfpMetrics(live, "US", { rdIntensity: 4.5, urbanizationRate: 25 });
    const loaded = deserializeSave(serializeSave(live, "2026-09-10T00:00:00Z"));
    expect(loaded.nationalMetrics["US"]![TFP_PATHS.rdIntensity]!.value).toBe(4.5);
    expect(loaded.nationalMetrics["US"]![TFP_PATHS.urbanizationRate]!.value).toBe(25);

    advanceTurn(live);
    advanceTurn(loaded);

    expect(loaded.countries["US"]!.economy.growthRate).toBe(live.countries["US"]!.economy.growthRate);
    expect(loaded.countries["US"]!.economy.outputGap).toBe(live.countries["US"]!.economy.outputGap);
    expect(loaded.countries["US"]!.economy.unemploymentRate).toBe(live.countries["US"]!.economy.unemploymentRate);
    expect(loaded.countries["US"]!.economy.gdp).toBe(live.countries["US"]!.economy.gdp);
    expect(JSON.stringify(loaded.countries["US"]!.economy)).toBe(JSON.stringify(live.countries["US"]!.economy));
  });
});
