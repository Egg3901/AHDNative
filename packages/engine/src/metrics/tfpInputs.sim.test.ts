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
 * aggregated into nationalMetrics. The two macro-root leaves are read from the
 * previous national row; four political-board leaves are read from the current
 * board after its dynamics phase. Default US worlds seed the recorded roots
 * from the Game pin (see tfpDefaultInputs.test.ts and metrics/tfpSeed.ts). This
 * suite still proves the persisted-row aggregation contract:
 *
 *  1. createWorld records per-region US source for the six leaves.
 *  2. On worlds without a source political board, when a region records a
 *     leaf nationalMetrics aggregates it population-weighted and it reaches
 *     tfpBasket. A source board, when present, is authoritative for the four
 *     inputs Game reads from that board.
 *  3. The aggregation is era-gated: broadbandAccess (active 1998+) is omitted
 *     from a pre-1998 national row even when a region records it.
 *  4. Two default worlds with the same seed stay byte-identical.
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
  it("default US worlds seed the six Game TFP paths on every US region", () => {
    for (const opts of [OPTS_1953, OPTS_1979, OPTS_1991, OPTS_2019]) {
      const world = createWorld(opts);
      const us = regionsOf(world, "US");
      expect(us.length).toBeGreaterThan(0);
      expect(Object.keys(world.regionalMetrics).length).toBeGreaterThan(0);
      for (const region of us) {
        for (const path of ALL_PATHS) {
          expect(world.regionalMetrics[region.id]?.[path]?.value, `${opts.era} ${region.id} ${path}`).toEqual(
            expect.any(Number),
          );
        }
      }
      advanceTurn(world);
      const row = nationalRow(world, "US");
      for (const path of opts.era === "2019" ? ALL_PATHS : PATHS_1953) {
        expect(row[path]?.value, `${opts.era} ${path}`).toEqual(expect.any(Number));
      }
      if (opts.era !== "2019") {
        expect(row[TFP_METRIC_PATHS.broadbandAccess], `${opts.era} broadband`).toBeUndefined();
      }
    }
  });

  it("aggregates a recorded regional leaf into nationalMetrics (population-weighted) and it reaches tfpBasket", () => {
    const world = createWorld(OPTS_1953);
    // Isolate the persisted macro-metric fallback used by legacy saves that
    // predate the source political board. Current board-backed inputs are
    // verified independently in tfpPoliticalBoard.test.ts.
    delete world.regionalPoliticalMetrics;
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
    delete world.regionalPoliticalMetrics;
    const regions = regionsOf(world, "US").sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
    const big = regions[0]!;
    const small = regions[regions.length - 1]!;
    world.regionalMetrics[big.id] = { [TFP_METRIC_PATHS.urbanizationRate]: { value: 90 } };
    world.regionalMetrics[small.id] = { [TFP_METRIC_PATHS.urbanizationRate]: { value: 20 } };
    advanceTurn(world);

    const value = nationalRow(world, "US")[TFP_METRIC_PATHS.urbanizationRate]!.value;
    let weightedSum = 0;
    let weightTotal = 0;
    for (const region of regionsOf(world, "US")) {
      const recorded = world.regionalMetrics[region.id]?.[TFP_METRIC_PATHS.urbanizationRate]?.value;
      if (typeof recorded !== "number" || !Number.isFinite(recorded)) continue;
      const weight = region.population ?? 0;
      if (!(weight > 0)) continue;
      weightedSum += recorded * weight;
      weightTotal += weight;
    }
    expect(value).toBeCloseTo(weightedSum / weightTotal, 3);
    expect(value).not.toBe(55);
  });

  it("era-gates broadbandAccess: a 2019 world aggregates all six, a 1953 world never does", () => {
    const modern = createWorld(OPTS_2019);
    delete modern.regionalPoliticalMetrics;
    for (const path of ALL_PATHS) recordRegionalLeaf(modern, "US", path, 60);
    advanceTurn(modern);
    const modernRow = nationalRow(modern, "US");
    for (const path of ALL_PATHS) {
      expect(modernRow[path]?.value, path).toBe(60);
    }

    const vintage = createWorld(OPTS_1953);
    delete vintage.regionalPoliticalMetrics;
    recordRegionalLeaf(vintage, "US", TFP_METRIC_PATHS.broadbandAccess, 60);
    advanceTurn(vintage);
    expect(nationalRow(vintage, "US")[TFP_METRIC_PATHS.broadbandAccess]).toBeUndefined();
  });

  it("flows the recorded input into potential growth at the turn boundary", () => {
    const control = createWorld(OPTS_1953);
    const treated = createWorld(OPTS_1953);
    delete control.regionalPoliticalMetrics;
    delete treated.regionalPoliticalMetrics;
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
    // raises potential, so the output gap falls versus the baseline control.
    // The unemployment signal is rounded to 4dp here, so this small source
    // vector can produce the same recorded rate in both worlds.
    advanceTurn(control);
    advanceTurn(treated);
    expect(treated.countries["US"]!.economy.outputGap).toBeLessThan(
      control.countries["US"]!.economy.outputGap,
    );
    expect(Number.isFinite(treated.countries["US"]!.economy.unemploymentRate)).toBe(true);
  });

  it("keeps two same-seed default worlds byte-identical after turns", () => {
    const a = createWorld(OPTS_1953);
    const b = createWorld(OPTS_1953);
    for (let i = 0; i < 3; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const row = nationalRow(a, "US");
    for (const path of PATHS_1953) expect(row[path]?.value, path).toEqual(expect.any(Number));
  });

  it("persists recorded regional rows through save/load and still aggregates", () => {
    const world = createWorld(OPTS_1953);
    delete world.regionalPoliticalMetrics;
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
