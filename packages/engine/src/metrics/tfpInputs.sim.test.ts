import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { WorldState } from "../types.js";
import { TFP_METRIC_PATHS, tfpBasket } from "../demographics/laborForce.js";

/**
 * Issue #40 — TFP basket input gate.
 *
 * The six exact AHDGame tfpBasket leaves (laborForce.ts TFP_METRIC_PATHS) are
 * read by macroCountryTurnPhase from the PREV-turn nationalMetrics row. This
 * suite proves, through the public createWorld / advanceTurn / save boundary:
 *
 *  1. A default world records NO per-region source for the six leaves, so they
 *     stay absent and the basket keeps the TFP_BASELINE fallback. No synthetic
 *     seed and no national stand-in is injected (the rejected approach).
 *  2. When a region DOES record one of the six leaves in the real regional
 *     policy store (WorldState.regionalMetrics, schema v45), nationalMetrics
 *     aggregates it population-weighted and it reaches tfpBasket.
 *  3. The aggregation is era-gated exactly like the rest of nationalMetrics:
 *     broadbandAccess (active 1998+) is omitted from a pre-1998 world even when
 *     a region records it.
 *  4. The aggregation is a strict no-op (no new keys, byte-identical worlds)
 *     when no region records a leaf, so existing world hashes are unchanged.
 *
 * The per-region store is written by the real regional-scope policy path
 * (policyEffects/phases.ts `world.regionalMetrics[regionId] ??= {}`); this
 * suite records the same rows directly, which is the recorded state the engine
 * actually persists.
 */

const OPTS_1953 = { seed: "tfp-inputs-1953", playerName: "Tester", countryId: "US", era: "1953" } as const;
const OPTS_1979 = { seed: "tfp-inputs-1979", playerName: "Tester", countryId: "US", era: "1979" } as const;
const OPTS_1991 = { seed: "tfp-inputs-1991", playerName: "Tester", countryId: "US", era: "1991" } as const;
const OPTS_2019 = { seed: "tfp-inputs-2019", playerName: "Tester", countryId: "US", era: "2019" } as const;

const ALL_PATHS = Object.values(TFP_METRIC_PATHS);
const PATHS_1953 = ALL_PATHS.filter((p) => !p.endsWith("broadbandAccess"));

function regionsOf(world: WorldState, countryId: string): WorldState["regions"][string][] {
  return Object.values(world.regions).filter((r) => r.countryId === countryId);
}

/** Simulate the regional-scope policy store writing one leaf for every region. */
function recordRegionalLeaf(world: WorldState, countryId: string, path: string, value: number): void {
  for (const region of regionsOf(world, countryId)) {
    const row = (world.regionalMetrics[region.id] ??= {});
    row[path] = { value };
  }
}

function nationalRow(world: WorldState, countryId: string): Record<string, { value: number }> {
  return world.nationalMetrics[countryId] ?? {};
}

describe("#40 TFP basket input gate (public turn boundary)", () => {
  it("default worlds record no per-region source, so the six leaves stay absent", () => {
    for (const opts of [OPTS_1953, OPTS_1979, OPTS_1991, OPTS_2019]) {
      const world = createWorld(opts);
      // The regional policy store starts empty (no enacted regional law).
      expect(Object.keys(world.regionalMetrics)).toEqual([]);
      advanceTurn(world);
      const row = nationalRow(world, "US");
      for (const path of ALL_PATHS) {
        expect(row[path], `${opts.era} ${path}`).toBeUndefined();
      }
    }
  });

  it("aggregates a recorded regional leaf into nationalMetrics (population-weighted) and it reaches tfpBasket", () => {
    const world = createWorld(OPTS_1953);
    for (const path of PATHS_1953) recordRegionalLeaf(world, "US", path, 40);
    advanceTurn(world);

    const row = nationalRow(world, "US");
    for (const path of PATHS_1953) {
      expect(row[path]?.value, path).toBe(40);
    }
    // broadbandAccess is era-inactive before 1998 (metricActivation window).
    expect(row[TFP_METRIC_PATHS.broadbandAccess]).toBeUndefined();

    // The aggregated national row, fed to tfpBasket the way macroCountryTurn
    // does, moves TFP off the 1.2 baseline.
    const basket = tfpBasket({
      rdIntensity: row[TFP_METRIC_PATHS.rdIntensity]!.value,
      workforceSkill: row[TFP_METRIC_PATHS.workforceSkill]!.value,
      transportEfficiency: row[TFP_METRIC_PATHS.transportEfficiency]!.value,
      powerGridReliability: row[TFP_METRIC_PATHS.powerGridReliability]!.value,
      urbanizationRate: row[TFP_METRIC_PATHS.urbanizationRate]!.value,
    });
    expect(basket).not.toBe(1.2);
    expect(basket).toBeGreaterThan(0.2);
    expect(basket).toBeLessThan(2.6);
  });

  it("weights the aggregate by region population, not a flat average", () => {
    const world = createWorld(OPTS_1953);
    const regions = regionsOf(world, "US").sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
    const big = regions[0]!;
    const small = regions[regions.length - 1]!;
    world.regionalMetrics[big.id] = { [TFP_METRIC_PATHS.urbanizationRate]: { value: 90 } };
    world.regionalMetrics[small.id] = { [TFP_METRIC_PATHS.urbanizationRate]: { value: 20 } };
    advanceTurn(world);

    const value = nationalRow(world, "US")[TFP_METRIC_PATHS.urbanizationRate]!.value;
    const expected =
      (90 * (big.population ?? 0) + 20 * (small.population ?? 0)) /
      ((big.population ?? 0) + (small.population ?? 0));
    expect(value).toBeCloseTo(expected, 3);
    // Population-weighted, so it sits far above a flat (90+20)/2 = 55 midpoint.
    expect(value).toBeGreaterThan(55);
  });

  it("era-gates broadbandAccess: a 2019 world aggregates all six, a 1953 world never does", () => {
    const modern = createWorld(OPTS_2019);
    for (const path of ALL_PATHS) recordRegionalLeaf(modern, "US", path, 60);
    advanceTurn(modern);
    const modernRow = nationalRow(modern, "US");
    for (const path of ALL_PATHS) {
      expect(modernRow[path]?.value, path).toBe(60);
    }

    const vintage = createWorld(OPTS_1953);
    recordRegionalLeaf(vintage, "US", TFP_METRIC_PATHS.broadbandAccess, 60);
    advanceTurn(vintage);
    expect(nationalRow(vintage, "US")[TFP_METRIC_PATHS.broadbandAccess]).toBeUndefined();
  });

  it("flows the recorded input into potential growth at the turn boundary", () => {
    const control = createWorld(OPTS_1953);
    const treated = createWorld(OPTS_1953);
    // High source values per the GROWTH-PARITY.md vectors.
    recordRegionalLeaf(treated, "US", TFP_METRIC_PATHS.rdIntensity, 4.5);
    recordRegionalLeaf(treated, "US", TFP_METRIC_PATHS.workforceSkill, 90);
    recordRegionalLeaf(treated, "US", TFP_METRIC_PATHS.transportEfficiency, 90);
    recordRegionalLeaf(treated, "US", TFP_METRIC_PATHS.powerGridReliability, 99.9);
    recordRegionalLeaf(treated, "US", TFP_METRIC_PATHS.urbanizationRate, 92);

    // Turn 1 is identical: macroCountryTurn reads the (still empty) prev-turn
    // national row, then the tail phase aggregates the regional rows.
    advanceTurn(control);
    advanceTurn(treated);
    expect(treated.countries["US"]!.economy.gdp).toBe(control.countries["US"]!.economy.gdp);
    expect(nationalRow(treated, "US")[TFP_METRIC_PATHS.rdIntensity]!.value).toBe(4.5);

    // Turn 2: macroCountryTurn now sees the aggregated high-TFP row. Higher TFP
    // raises potential, so the output gap falls and Okun unemployment rises
    // versus the baseline control (same sector signal, same seed).
    advanceTurn(control);
    advanceTurn(treated);
    expect(treated.countries["US"]!.economy.outputGap).toBeLessThan(
      control.countries["US"]!.economy.outputGap,
    );
    expect(treated.countries["US"]!.economy.unemploymentRate).toBeGreaterThan(
      control.countries["US"]!.economy.unemploymentRate,
    );
  });

  it("is a strict no-op when no region records a leaf: identical worlds, no new keys", () => {
    const a = createWorld(OPTS_1953);
    const b = createWorld(OPTS_1953);
    for (let i = 0; i < 3; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // The aggregation added no TFP keys to the default rebuild.
    const row = nationalRow(a, "US");
    for (const path of ALL_PATHS) expect(row[path], path).toBeUndefined();
  });

  it("persists recorded regional rows through save/load and still aggregates", () => {
    const world = createWorld(OPTS_1953);
    recordRegionalLeaf(world, "US", TFP_METRIC_PATHS.workforceSkill, 70);
    const loaded = deserializeSave(serializeSave(world, "2026-09-12T00:00:00Z"));
    expect(Object.keys(loaded.regionalMetrics).length).toBeGreaterThan(0);

    advanceTurn(world);
    advanceTurn(loaded);
    expect(nationalRow(loaded, "US")[TFP_METRIC_PATHS.workforceSkill]?.value).toBe(70);
    expect(nationalRow(loaded, "US")[TFP_METRIC_PATHS.workforceSkill]?.value).toBe(
      nationalRow(world, "US")[TFP_METRIC_PATHS.workforceSkill]?.value,
    );
  });
});
