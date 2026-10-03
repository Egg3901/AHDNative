import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { deserializeSave, projectSaveToV42, serializeSave } from "../save.js";
import { classifyMinisterialOrders } from "../ministerialOrders/catalog.js";
import { rngFromSeed } from "../rng.js";
import type { WorldState } from "../types.js";
import {
  TFP_METRIC_PATHS,
  TFP_REFERENCE_INPUTS,
  tfpBasket,
  type TfpBasketInputs,
} from "../demographics/laborForce.js";
import { AUTHORED_TFP_LEAVES, type TfpLeaves } from "./tfpAuthoredLeaves.js";
import { gameRepo, loadGameTree, overlayedLeaves, TFP_GAME_PIN } from "./tfpGameOracle.js";
import tfpGameFixtures from "./tfpGameFixtures.json";
const sourceCombos: Readonly<Record<string, Readonly<Record<string, TfpLeaves>>>> = tfpGameFixtures.combos;

/**
 * Issue #40 / #106 — default-world TFP inputs from AHDGame seed formulas at
 * 08820d108bf986d519aed28c2963690dd772c652, covering every Native playable
 * country/era Game actually supplies.
 */

const PATHS = TFP_METRIC_PATHS;
const ALL_PATHS = Object.values(PATHS);
const SAVED_AT = "2026-10-01T00:00:00.000Z";
const PLAYABLE: ReadonlyArray<{ era: string; countryId: string }> = [
  { era: "1953", countryId: "US" }, { era: "1953", countryId: "UK" },
  { era: "1953", countryId: "RU" }, { era: "1953", countryId: "DD" },
  { era: "1979", countryId: "US" }, { era: "1979", countryId: "UK" },
  { era: "1979", countryId: "RU" }, { era: "1979", countryId: "DD" },
  { era: "1991", countryId: "US" }, { era: "1991", countryId: "UK" },
  { era: "1991", countryId: "BR" }, { era: "1991", countryId: "CN" },
  { era: "1991", countryId: "IE" },
  { era: "2019", countryId: "US" }, { era: "2019", countryId: "UK" },
  { era: "2019", countryId: "CN" }, { era: "2019", countryId: "IE" },
];

function opts(countryId: string, era: string, seed = `tfp-default-${era}-${countryId}`) {
  return { seed, playerName: "Tester", countryId, era };
}

function fixtureKey(countryId: string, era: string): string {
  if (countryId === "US" && (era === "2019" || era === "1991")) return `US:${era}:tfp-source-us-${era}`;
  return `${countryId}:${era}`;
}

function fixtureSeed(countryId: string, era: string): string {
  if (countryId === "US" && (era === "2019" || era === "1991")) return `tfp-source-us-${era}`;
  return `tfp-default-${era}-${countryId}`;
}

function countryRegions(world: WorldState, countryId: string): WorldState["regions"][string][] {
  return Object.values(world.regions).filter((region) => region.countryId === countryId);
}

function leaf(world: WorldState, regionId: string, path: string): number | undefined {
  return world.regionalMetrics[regionId]?.[path]?.value;
}

function regionLeaves(world: WorldState, regionId: string): TfpLeaves {
  return {
    rdIntensity: leaf(world, regionId, PATHS.rdIntensity)!,
    workforceSkill: leaf(world, regionId, PATHS.workforceSkill)!,
    transportEfficiency: leaf(world, regionId, PATHS.transportEfficiency)!,
    broadbandAccess: leaf(world, regionId, PATHS.broadbandAccess)!,
    powerGridReliability: leaf(world, regionId, PATHS.powerGridReliability)!,
    urbanizationRate: leaf(world, regionId, PATHS.urbanizationRate)!,
  };
}

function nationalTfp(world: WorldState, countryId: string): TfpBasketInputs {
  const row = world.nationalMetrics[countryId] ?? {};
  const rdIntensity = row[PATHS.rdIntensity]?.value;
  const workforceSkill = row[PATHS.workforceSkill]?.value;
  const transportEfficiency = row[PATHS.transportEfficiency]?.value;
  const broadbandAccess = row[PATHS.broadbandAccess]?.value;
  const powerGridReliability = row[PATHS.powerGridReliability]?.value;
  const urbanizationRate = row[PATHS.urbanizationRate]?.value;
  return {
    ...(rdIntensity === undefined ? {} : { rdIntensity }),
    ...(workforceSkill === undefined ? {} : { workforceSkill }),
    ...(transportEfficiency === undefined ? {} : { transportEfficiency }),
    ...(broadbandAccess === undefined ? {} : { broadbandAccess }),
    ...(powerGridReliability === undefined ? {} : { powerGridReliability }),
    ...(urbanizationRate === undefined ? {} : { urbanizationRate }),
  };
}

function expectSeededCountry(world: WorldState, countryId: string, era: string): void {
  const regions = countryRegions(world, countryId);
  expect(regions.length, `${era} ${countryId} regions`).toBeGreaterThan(0);
  for (const region of regions) {
    for (const path of ALL_PATHS) {
      const value = leaf(world, region.id, path);
      expect(value, `${era} ${countryId} ${region.id} ${path}`).toEqual(expect.any(Number));
      expect(Number.isFinite(value)).toBe(true);
    }
  }
  const basket = tfpBasket(nationalTfp(world, countryId));
  expect(basket).not.toBe(1.2);
  expect(basket).toBeGreaterThan(0.2);
  expect(basket).toBeLessThan(2.6);
}

describe("#40/#106 default TFP seed at createWorld", () => {
  it("seeds the six Game paths on every playable country/era Game supplies", () => {
    for (const { era, countryId } of PLAYABLE) {
      const world = createWorld(opts(countryId, era));
      expectSeededCountry(world, countryId, era);
    }
  });

  it("matches source-executed authored leaves for non-US playable combos", () => {
    expect(AUTHORED_TFP_LEAVES.UK?.["1953"]?.LON).toEqual({
      rdIntensity: 0.8, workforceSkill: 72, transportEfficiency: 65,
      broadbandAccess: 97, powerGridReliability: 99.6, urbanizationRate: 100,
    });
    expect(AUTHORED_TFP_LEAVES.DD?.["1953"]?.BB).toEqual({
      rdIntensity: 1, workforceSkill: 60, transportEfficiency: 66,
      broadbandAccess: 0, powerGridReliability: 88, urbanizationRate: 38,
    });
    expect(AUTHORED_TFP_LEAVES.RU?.["1953"]?.CEN).toEqual({
      rdIntensity: 2.5, workforceSkill: 70, transportEfficiency: 60,
      broadbandAccess: 0, powerGridReliability: 99, urbanizationRate: 58,
    });
    expect(AUTHORED_TFP_LEAVES.CN?.["2019"]?.HD).toEqual({
      rdIntensity: 3.5, workforceSkill: 74, transportEfficiency: 92,
      broadbandAccess: 94, powerGridReliability: 99.8, urbanizationRate: 82,
    });
    expect(AUTHORED_TFP_LEAVES.IE?.["1991"]?.DUB).toEqual({
      rdIntensity: 1.2, workforceSkill: 82, transportEfficiency: 50,
      broadbandAccess: 0, powerGridReliability: 99.9, urbanizationRate: 96,
    });
    expect(AUTHORED_TFP_LEAVES.BR?.["1991"]?.SUDESTE).toEqual({
      rdIntensity: 0.9, workforceSkill: 58, transportEfficiency: 35,
      broadbandAccess: 0, powerGridReliability: 98.5, urbanizationRate: 92,
    });
    for (const { era, countryId } of PLAYABLE) {
      if (countryId === "US") continue;
      const world = createWorld(opts(countryId, era));
      const expected = AUTHORED_TFP_LEAVES[countryId]?.[era];
      expect(expected, `${countryId} ${era} authored table`).toBeDefined();
      for (const region of countryRegions(world, countryId)) {
        expect(regionLeaves(world, region.id), `${era} ${region.id}`).toEqual(expected![region.id]);
      }
    }
  });

  it("matches committed source-executed fixtures for every playable combo", () => {
    expect(tfpGameFixtures.pin).toBe(TFP_GAME_PIN);
    for (const { era, countryId } of PLAYABLE) {
      const world = createWorld(opts(countryId, era, fixtureSeed(countryId, era)));
      const expected = sourceCombos[fixtureKey(countryId, era)];
      expect(expected, `${countryId} ${era} fixture`).toBeDefined();
      for (const region of countryRegions(world, countryId)) {
        expect(regionLeaves(world, region.id), `${era} ${region.id}`).toEqual(expected![region.id]);
      }
    }
  });

  it("ports deterministic US 1953/1979 Game formulas including CA/MS vectors", () => {
    const us1953 = createWorld(opts("US", "1953"));
    expect(regionLeaves(us1953, "CA")).toEqual({
      rdIntensity: 1.2, workforceSkill: 50, transportEfficiency: 42,
      broadbandAccess: 0, powerGridReliability: 99.6, urbanizationRate: 81,
    });
    expect(regionLeaves(us1953, "MS")).toEqual({
      rdIntensity: 0.6, workforceSkill: 34, transportEfficiency: 32,
      broadbandAccess: 0, powerGridReliability: 97.5, urbanizationRate: 28,
    });
    const us1979 = createWorld(opts("US", "1979"));
    expect(regionLeaves(us1979, "CA")).toEqual({
      rdIntensity: 4.2, workforceSkill: 54, transportEfficiency: 62,
      broadbandAccess: 0, powerGridReliability: 99.65, urbanizationRate: 91,
    });
  });

  it("uses a dedicated tfp-leaves RNG stream so founding RNG is not stolen", () => {
    const a = createWorld(opts("US", "2019", "tfp-rng-a"));
    const b = createWorld(opts("US", "2019", "tfp-rng-b"));
    expect(JSON.stringify(regionLeaves(a, "CA"))).not.toBe(JSON.stringify(regionLeaves(b, "CA")));
    const again = createWorld(opts("US", "2019", "tfp-rng-a"));
    expect(regionLeaves(again, "CA")).toEqual(regionLeaves(a, "CA"));
    expect(a.meta.rng).toEqual(again.meta.rng);
  });

  it("era-gates national broadband: 2019 aggregates it, 1953/1979/1991 do not", () => {
    const modern = createWorld(opts("US", "2019"));
    expect(modern.nationalMetrics["US"]?.[PATHS.broadbandAccess]?.value).toEqual(expect.any(Number));
    for (const era of ["1953", "1979", "1991"] as const) {
      const vintage = createWorld(opts("US", era));
      expect(vintage.nationalMetrics["US"]?.[PATHS.broadbandAccess], era).toBeUndefined();
    }
  });

  it("persists seeded leaves through save/reload and keeps tfpBasket off 1.2", () => {
    const world = createWorld(opts("UK", "1953"));
    const before = regionLeaves(world, "LON");
    const basket = tfpBasket(nationalTfp(world, "UK"));
    const loaded = deserializeSave(serializeSave(world, SAVED_AT));
    expect(regionLeaves(loaded, "LON")).toEqual(before);
    expect(tfpBasket(nationalTfp(loaded, "UK"))).toBe(basket);
  });

  it("refuses historical v42 export of a fresh world whose TFP inputs the old turn engine drops", () => {
    const world = createWorld({ seed: "v42-interchange-v1", playerName: "Validator", countryId: "US", era: "1953" });
    const projected = projectSaveToV42(serializeSave(world, "2026-09-10T00:00:00.000Z"));
    expect(projected).toMatchObject({ ok: false, error: expect.stringContaining("Regional metric records") });
  });

  it("does not invent TFP leaves when loading an authentic v42 save", async () => {
    const { readFileSync } = await import("node:fs");
    const { gunzipSync } = await import("node:zlib");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const fixture = join(dirname(fileURLToPath(import.meta.url)), "../../../../fixtures/v42-1953-US.save.json.gz");
    const world = deserializeSave(gunzipSync(readFileSync(fixture)).toString("utf8"));
    expect(Object.keys(world.regionalMetrics).length).toBe(0);
    expect(tfpBasket(nationalTfp(world, "US"))).toBe(1.2);
    expect(tfpBasket(TFP_REFERENCE_INPUTS)).toBe(1.2);
  });

  it("does not treat an injected arbitrary metric as a supported ministerial consumer", () => {
    const world = createWorld(opts("US", "1953"));
    world.nationalMetrics["US"]!["infrastructure.publicTransit"] = { value: 40 };
    const classified = classifyMinisterialOrders(world, "US", "secretary_of_transportation");
    const transit = classified.find((order) => order.id === "public_transit_expansion");
    expect(transit?.availability).toBe("blocked");
    if (transit?.availability === "blocked") {
      expect(transit.blocker).toBe("unsupportedMetric:infrastructure.publicTransit");
    }
    const skills = classifyMinisterialOrders(world, "US", "secretary_of_education")
      .find((order) => order.id === "workforce_skills_initiative");
    expect(skills?.availability).toBe("supported");
  });
});

const repo = gameRepo();

describe.skipIf(!repo)("#40/#106 source-executed Game pin vectors", () => {
  it("non-US authored tables match git-show of Game stateMetrics + presets", () => {
    const load = loadGameTree(repo!);
    const cases: Array<{
      countryId: string; era: string; metrics: string; exportName: string;
      presets?: string; presetExport?: string; apply1991?: boolean;
    }> = [
      { countryId: "UK", era: "1953", metrics: "src/lib/countries/uk/data/ukStateMetrics.ts", exportName: "ukStateMetrics", presets: "src/lib/countries/uk/data/ukMetricPresets1953.ts", presetExport: "ukMetricPresets1953" },
      { countryId: "UK", era: "1979", metrics: "src/lib/countries/uk/data/ukStateMetrics.ts", exportName: "ukStateMetrics", presets: "src/lib/countries/uk/data/ukMetricPresets1979.ts", presetExport: "ukMetricPresets1979" },
      { countryId: "UK", era: "1991", metrics: "src/lib/countries/uk/data/ukStateMetrics.ts", exportName: "ukStateMetrics", presets: "src/lib/countries/uk/data/ukMetricPresets.ts", presetExport: "ukMetricPresets1991", apply1991: true },
      { countryId: "UK", era: "2019", metrics: "src/lib/countries/uk/data/ukStateMetrics.ts", exportName: "ukStateMetrics", presets: "src/lib/countries/uk/data/ukMetricPresets.ts", presetExport: "ukMetricPresets2019" },
      { countryId: "DD", era: "1953", metrics: "src/lib/countries/dd/data/ddStateMetrics1953.ts", exportName: "ddStateMetrics1953" },
      { countryId: "DD", era: "1979", metrics: "src/lib/countries/dd/data/ddStateMetrics.ts", exportName: "ddStateMetrics" },
      { countryId: "RU", era: "1953", metrics: "src/lib/countries/ru/data/ruStateMetrics.ts", exportName: "ruStateMetrics", presets: "src/lib/countries/ru/data/ruMetricPresets1953.ts", presetExport: "ruMetricPresets1953" },
      { countryId: "RU", era: "1979", metrics: "src/lib/countries/ru/data/ruStateMetrics.ts", exportName: "ruStateMetrics" },
      { countryId: "CN", era: "1991", metrics: "src/lib/countries/cn/data/cnStateMetrics.ts", exportName: "cnStateMetrics", presets: "src/lib/countries/cn/data/cnMetricPresets.ts", presetExport: "cnMetricPresets1991", apply1991: true },
      { countryId: "CN", era: "2019", metrics: "src/lib/countries/cn/data/cnStateMetrics.ts", exportName: "cnStateMetrics", presets: "src/lib/countries/cn/data/cnMetricPresets.ts", presetExport: "cnMetricPresets2019" },
      { countryId: "IE", era: "1991", metrics: "src/lib/countries/ie/data/ieStateMetrics.ts", exportName: "ieStateMetrics", presets: "src/lib/countries/ie/data/ieMetricPresets.ts", presetExport: "ieMetricPresets1991", apply1991: true },
      { countryId: "IE", era: "2019", metrics: "src/lib/countries/ie/data/ieStateMetrics.ts", exportName: "ieStateMetrics", presets: "src/lib/countries/ie/data/ieMetricPresets.ts", presetExport: "ieMetricPresets2019" },
      { countryId: "BR", era: "1991", metrics: "src/lib/countries/br/data/brStateMetrics.ts", exportName: "brStateMetrics", presets: "src/lib/countries/br/data/brMetricPresets.ts", presetExport: "brMetricPresets1991", apply1991: true },
    ];
    for (const entry of cases) {
      const docs = load(entry.metrics)[entry.exportName] as Array<Record<string, unknown>>;
      const overlays = entry.presets && entry.presetExport
        ? load(entry.presets)[entry.presetExport] as Record<string, Record<string, number>>
        : undefined;
      const expected = overlayedLeaves(docs, overlays, entry.apply1991);
      expect(AUTHORED_TFP_LEAVES[entry.countryId]?.[entry.era], `${entry.countryId} ${entry.era}`).toEqual(expected);
      expect(sourceCombos[`${entry.countryId}:${entry.era}`], `${entry.countryId} ${entry.era} fixture`).toEqual(expected);
    }
  });

  it("US 1953/1979 Native leaves match Game stateMetrics plus recorded overlays", () => {
    const load = loadGameTree(repo!);
    const docs1953 = load("src/lib/countries/us/data/usStateMetrics1953.ts").stateMetrics1953 as Array<Record<string, unknown>>;
    const overlay1953 = load("src/lib/countries/us/data/usMetricPresets1953.ts").usMetricPresets1953 as Record<string, Record<string, number>>;
    const expected1953 = overlayedLeaves(docs1953, overlay1953);
    const world1953 = createWorld(opts("US", "1953"));
    expect(regionLeaves(world1953, "CA")).toEqual(expected1953.CA);
    expect(regionLeaves(world1953, "MS")).toEqual(expected1953.MS);

    const docs1979 = load("src/lib/countries/us/data/usStateMetrics1979.ts").stateMetrics1979 as Array<Record<string, unknown>>;
    const overlay2019 = load("src/lib/countries/us/data/usMetricPresets.ts").usMetricPresets2019 as Record<string, Record<string, number>>;
    const expected1979 = overlayedLeaves(docs1979, overlay2019);
    const world1979 = createWorld(opts("US", "1979"));
    expect(regionLeaves(world1979, "CA")).toEqual(expected1979.CA);
  });

  it("US 2019/1991 Native leaves match Game generateStateMetrics with Native rng as Math.random", () => {
    const seed2019 = "tfp-source-us-2019";
    const rng2019 = rngFromSeed(`${seed2019}:tfp-leaves`);
    const load2019 = loadGameTree(repo!, () => rng2019.next());
    const docs2019 = load2019("src/lib/countries/us/data/usStateMetrics.ts").stateMetrics as Array<Record<string, unknown>>;
    const overlay2019 = load2019("src/lib/countries/us/data/usMetricPresets.ts").usMetricPresets2019 as Record<string, Record<string, number>>;
    const expected2019 = overlayedLeaves(docs2019, overlay2019);
    expect(tfpGameFixtures.combos["US:2019:tfp-source-us-2019"]).toEqual(expected2019);
    const world2019 = createWorld(opts("US", "2019", seed2019));
    expect(regionLeaves(world2019, "CA")).toEqual(expected2019.CA);
    expect(regionLeaves(world2019, "MS")).toEqual(expected2019.MS);
    expect(regionLeaves(world2019, "NY")).toEqual(expected2019.NY);

    const seed1991 = "tfp-source-us-1991";
    const rng1991 = rngFromSeed(`${seed1991}:tfp-leaves`);
    const load1991 = loadGameTree(repo!, () => rng1991.next());
    const docs1991 = load1991("src/lib/countries/us/data/usStateMetrics.ts").stateMetrics as Array<Record<string, unknown>>;
    const overlay1991 = load1991("src/lib/countries/us/data/usMetricPresets.ts").usMetricPresets1991 as Record<string, Record<string, number>>;
    const expected1991 = overlayedLeaves(docs1991, overlay1991, true);
    expect(tfpGameFixtures.combos["US:1991:tfp-source-us-1991"]).toEqual(expected1991);
    const world1991 = createWorld(opts("US", "1991", seed1991));
    expect(regionLeaves(world1991, "CA")).toEqual(expected1991.CA);
    expect(regionLeaves(world1991, "MS")).toEqual(expected1991.MS);
  });
});

describe("#40 first-turn potential uses the seeded basket", () => {
  it("moves first-turn US potential off the TFP 1.2 fallback", () => {
    const seeded = createWorld(opts("US", "1953"));
    const baseline = createWorld(opts("US", "1953"));
    baseline.nationalMetrics["US"] = {
      ...(baseline.nationalMetrics["US"] ?? {}),
      [PATHS.rdIntensity]: { value: TFP_REFERENCE_INPUTS.rdIntensity },
      [PATHS.workforceSkill]: { value: TFP_REFERENCE_INPUTS.workforceSkill },
      [PATHS.transportEfficiency]: { value: TFP_REFERENCE_INPUTS.transportEfficiency },
      [PATHS.powerGridReliability]: { value: TFP_REFERENCE_INPUTS.powerGridReliability },
      [PATHS.urbanizationRate]: { value: TFP_REFERENCE_INPUTS.urbanizationRate },
    };
    expect(tfpBasket(nationalTfp(seeded, "US"))).not.toBe(1.2);
    expect(tfpBasket(nationalTfp(baseline, "US"))).toBe(1.2);
    advanceTurn(seeded);
    advanceTurn(baseline);
    expect(seeded.countries["US"]!.economy.outputGap).not.toBe(baseline.countries["US"]!.economy.outputGap);
  });
});
