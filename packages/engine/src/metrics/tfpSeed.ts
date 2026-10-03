/**
 * TFP leaf seed — AHDGame pin 08820d108bf986d519aed28c2963690dd772c652.
 *
 * Ports the six tfpBasket paths Game writes at seed time:
 *   economic.rdIntensity, education.workforceSkill,
 *   infrastructure.transportEfficiency / broadbandAccess / powerGridReliability,
 *   population.urbanizationRate
 *
 * US 1953/1979 are authored (no Math.random). US 2019 generateStateMetrics
 * consumes 66 randomize() draws per state in Game `states` array order;
 * Native preserves that stream through rngFromSeed(`${seed}:tfp-leaves`)
 * so founding/turn RNG is not stolen. Era presets then replace rdIntensity
 * and transportEfficiency. US 1991 = jittered 2019 + broadband 0 +
 * urbanization clamp(v-3, 50, 100) + 1991 presets.
 *
 * Other playable country/era combos use source-executed authored leaves.
 */

import type { WorldState } from "../types.js";
import { rngFromSeed, type WorldRng } from "../rng.js";
import { TFP_METRIC_PATHS } from "../demographics/laborForce.js";
import { AUTHORED_TFP_LEAVES, type TfpLeaves } from "./tfpAuthoredLeaves.js";
import sourceEraTfp from "./tfpSourceEraFixtures.json";

export type { TfpLeaves };

// Source regional metric seeders retain their 2019 base/metric lane where a
// 1999/2007/2023 country metric bundle is absent. US is handled separately
// because those presets have dedicated source state-metric rows.
const SOURCE_2019_METRIC_FALLBACK_ERAS = new Set(["1999", "2007", "2023"]);
const SOURCE_ERA_TFP_LEAVES: Record<string, Record<string, TfpLeaves>> =
  Object.fromEntries(sourceEraTfp.eras.map((era) => [
    String(era.year),
    Object.fromEntries(era.rows.map((row) => [row.stateId, row.metrics])),
  ]));

type Archetype = "TECH" | "NEMA" | "RUST" | "SOUTH" | "PLAINS" | "MOUNTAIN";

/** Game src/lib/countries/us/data/usStates.ts `states` array order at the pin. */
const US_STATE_ORDER = [
  "CT", "DE", "MA", "MD", "ME", "NH", "NJ", "NY", "PA", "RI", "VT",
  "AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "SC", "TN", "VA", "WV",
  "IA", "IL", "IN", "KS", "MI", "MN", "MO", "ND", "NE", "OH", "SD", "WI",
  "AZ", "NM", "NV", "OK", "TX", "UT",
  "AK", "CA", "CO", "HI", "ID", "MT", "OR", "WA", "WY",
  "DC",
] as const;

const STATE_ARCHETYPE: Record<string, Archetype> = {
  CA: "TECH", WA: "TECH", MA: "TECH", NY: "TECH", CO: "TECH", OR: "TECH",
  CT: "NEMA", NH: "NEMA", VT: "NEMA", ME: "NEMA", RI: "NEMA", NJ: "NEMA",
  MD: "NEMA", DE: "NEMA", HI: "NEMA", VA: "NEMA", MN: "NEMA", DC: "NEMA",
  PA: "RUST", OH: "RUST", MI: "RUST", IL: "RUST", IN: "RUST", WI: "RUST", MO: "RUST",
  AL: "SOUTH", AR: "SOUTH", KY: "SOUTH", LA: "SOUTH", MS: "SOUTH", SC: "SOUTH",
  TN: "SOUTH", GA: "SOUTH", NC: "SOUTH", WV: "SOUTH", OK: "SOUTH", FL: "SOUTH", TX: "SOUTH",
  IA: "PLAINS", KS: "PLAINS", NE: "PLAINS", ND: "PLAINS", SD: "PLAINS",
  MT: "MOUNTAIN", ID: "MOUNTAIN", WY: "MOUNTAIN", UT: "MOUNTAIN", NV: "MOUNTAIN",
  AZ: "MOUNTAIN", NM: "MOUNTAIN", AK: "MOUNTAIN",
};

type OverlayPair = { rdIntensity: number; transportEfficiency: number };

function expandOverlay(
  national: OverlayPair,
  archetypes: Partial<Record<Archetype, Partial<OverlayPair>>>,
  overrides: Record<string, Partial<OverlayPair>>,
): Record<string, OverlayPair> {
  const out: Record<string, OverlayPair> = {};
  for (const [state, archetype] of Object.entries(STATE_ARCHETYPE)) {
    out[state] = {
      ...national,
      ...(archetypes[archetype] ?? {}),
      ...(overrides[state] ?? {}),
    };
  }
  return out;
}

const OVERLAY_1953 = expandOverlay(
  { rdIntensity: 0.6, transportEfficiency: 42 },
  {
    TECH: { rdIntensity: 1.0 },
    NEMA: { transportEfficiency: 52 },
    SOUTH: { transportEfficiency: 32 },
    PLAINS: { transportEfficiency: 38 },
    MOUNTAIN: { transportEfficiency: 35 },
  },
  {
    CA: { rdIntensity: 1.2 },
    NY: { transportEfficiency: 65 },
    WV: { transportEfficiency: 28 },
    AK: { transportEfficiency: 20 },
    MA: { rdIntensity: 1.5 },
  },
);

const OVERLAY_2019 = expandOverlay(
  { rdIntensity: 2.8, transportEfficiency: 50 },
  {
    TECH: { rdIntensity: 4.0, transportEfficiency: 62 },
    NEMA: { rdIntensity: 3.0, transportEfficiency: 58 },
    RUST: { rdIntensity: 2.4 },
    SOUTH: { rdIntensity: 2.0 },
    PLAINS: { rdIntensity: 2.0, transportEfficiency: 42 },
    MOUNTAIN: { rdIntensity: 2.2, transportEfficiency: 40 },
  },
  {
    CA: { rdIntensity: 4.2 },
    NY: { rdIntensity: 3.6, transportEfficiency: 80 },
    MA: { rdIntensity: 4.5 },
    WA: { rdIntensity: 4.0 },
    CO: { rdIntensity: 3.2 },
    TX: { rdIntensity: 2.4 },
    WV: { rdIntensity: 1.4 },
    MS: { rdIntensity: 1.5 },
    UT: { rdIntensity: 2.6 },
    AK: { transportEfficiency: 30 },
    DC: { rdIntensity: 3.5, transportEfficiency: 78 },
  },
);

const OVERLAY_1991 = expandOverlay(
  { rdIntensity: 2.6, transportEfficiency: 50 },
  {
    TECH: { rdIntensity: 3.2 },
    NEMA: { rdIntensity: 2.8 },
    SOUTH: { rdIntensity: 1.8 },
  },
  {
    CA: { rdIntensity: 3.4 },
    NY: { rdIntensity: 3.0, transportEfficiency: 78 },
    MA: { rdIntensity: 3.6 },
    WV: { rdIntensity: 1.2 },
    MS: { rdIntensity: 1.3 },
    DC: { rdIntensity: 3.0, transportEfficiency: 75 },
  },
);

const INCOME_1953: Record<string, number> = {
  AL: 2200, AK: 4800, AZ: 3400, AR: 2000, CA: 4500, CO: 3800, CT: 4800, DE: 4200,
  DC: 4200, FL: 3200, GA: 2600, HI: 3800, ID: 3200, IL: 4300, IN: 4000, IA: 3600,
  KS: 3500, KY: 2800, LA: 2800, ME: 2900, MD: 4200, MA: 4200, MI: 4200, MN: 3800,
  MS: 1800, MO: 3600, MT: 3400, NE: 3500, NV: 4300, NH: 3600, NJ: 4500, NM: 2900,
  NY: 4400, NC: 2600, ND: 3200, OH: 4100, OK: 3200, OR: 3900, PA: 3900, RI: 4000,
  SC: 2400, SD: 3000, TN: 2600, TX: 3300, UT: 3500, VT: 3000, VA: 3200, WA: 4200,
  WV: 2900, WI: 3900, WY: 4000,
};

const URBANIZATION_1953: Record<string, number> = {
  AL: 44, AK: 36, AZ: 56, AR: 33, CA: 81, CO: 63, CT: 78, DE: 63, DC: 100, FL: 65,
  GA: 45, HI: 69, ID: 42, IL: 77, IN: 60, IA: 48, KS: 53, KY: 36, LA: 55, ME: 40,
  MD: 69, MA: 84, MI: 71, MN: 55, MS: 28, MO: 61, MT: 36, NE: 47, NV: 57, NH: 57,
  NJ: 87, NM: 50, NY: 86, NC: 34, ND: 26, OH: 70, OK: 51, OR: 54, PA: 71, RI: 92,
  SC: 37, SD: 33, TN: 44, TX: 63, UT: 65, VT: 36, VA: 47, WA: 63, WV: 35, WI: 58,
  WY: 50,
};

const INCOME_1979: Record<string, number> = {
  AL: 14400, AK: 28000, AZ: 15600, AR: 12100, CA: 18800, CO: 17800, CT: 20500,
  DE: 19100, DC: 16500, FL: 14600, GA: 15300, HI: 20100, ID: 15600, IL: 19500,
  IN: 17800, IA: 16800, KS: 16400, KY: 14000, LA: 15500, ME: 13900, MD: 21300,
  MA: 18500, MI: 19800, MN: 18200, MS: 11800, MO: 16200, MT: 15000, NE: 16200,
  NV: 19000, NH: 17000, NJ: 21500, NM: 13200, NY: 18500, NC: 14300, ND: 15500,
  OH: 18500, OK: 16000, OR: 16800, PA: 17800, RI: 16500, SC: 14000, SD: 14800,
  TN: 13900, TX: 17500, UT: 16500, VT: 14500, VA: 16500, WA: 18800, WV: 14500,
  WI: 18000, WY: 19500,
};

const URBANIZATION_1979: Record<string, number> = {
  AL: 60, AK: 64, AZ: 84, AR: 52, CA: 91, CO: 81, CT: 79, DE: 71, DC: 100, FL: 84,
  GA: 62, HI: 87, ID: 54, IL: 83, IN: 64, IA: 59, KS: 67, KY: 51, LA: 69, ME: 48,
  MD: 80, MA: 84, MI: 71, MN: 67, MS: 47, MO: 68, MT: 53, NE: 63, NV: 85, NH: 52,
  NJ: 89, NM: 72, NY: 84, NC: 48, ND: 49, OH: 73, OK: 67, OR: 68, PA: 70, RI: 87,
  SC: 54, SD: 46, TN: 60, TX: 80, UT: 84, VT: 34, VA: 66, WA: 74, WV: 36, WI: 64,
  WY: 63,
};

/** [educationTier, infrastructureTier, urbanization] from usStateMetrics.ts stateConfigs. */
const CONFIG_2019: Record<string, readonly [number, number, number]> = {
  CT: [5, 4, 88], DE: [4, 4, 84], MA: [5, 4, 92], MD: [4, 4, 87], ME: [4, 3, 39],
  NH: [4, 4, 60], NJ: [4, 4, 95], NY: [4, 5, 88], PA: [4, 3, 79], RI: [4, 3, 91],
  VT: [5, 3, 39], AL: [2, 2, 59], AR: [2, 2, 56], FL: [3, 3, 92], GA: [3, 3, 76],
  KY: [2, 2, 59], LA: [2, 2, 73], MS: [1, 2, 50], NC: [3, 3, 66], SC: [2, 3, 66],
  TN: [2, 3, 66], VA: [4, 4, 76], WV: [2, 2, 49], IA: [4, 3, 64], IL: [4, 4, 88],
  IN: [3, 3, 73], KS: [4, 3, 74], MI: [3, 3, 75], MN: [5, 4, 74], MO: [3, 3, 70],
  ND: [4, 3, 60], NE: [4, 3, 74], OH: [3, 3, 78], SD: [4, 2, 57], WI: [4, 3, 70],
  AZ: [3, 3, 90], NM: [2, 2, 78], NV: [2, 3, 94], OK: [2, 2, 66], TX: [3, 3, 85],
  UT: [4, 4, 91], AK: [3, 2, 66], CA: [4, 4, 95], CO: [5, 4, 87], HI: [4, 3, 92],
  ID: [3, 3, 71], MT: [3, 2, 56], OR: [4, 3, 81], WA: [4, 4, 84], WY: [3, 2, 65],
  // DC is in Game `states` but omitted from stateConfigs; generateStateMetrics uses this default.
  DC: [3, 3, 70],
};

const WORKFORCE_SKILL_2019 = [40, 50, 60, 70, 80] as const;
const BROADBAND_2019 = [68, 76, 84, 91, 96] as const;
const GRID_2019 = [99.0, 99.4, 99.7, 99.85, 99.95] as const;
const GRID_1953 = [97.5, 98.0, 98.8, 99.2, 99.6] as const;
const GRID_1979 = [98.6, 99.0, 99.4, 99.65, 99.85] as const;

/** Game generateStateMetrics randomize() call count per state. */
const US_2019_RANDOMIZE_COUNT = 66;
const US_2019_RD_DRAW = 8;
const US_2019_SKILL_DRAW = 16;
const US_2019_BROADBAND_DRAW = 25;
const US_2019_TRANSIT_DRAW = 26;
const US_2019_GRID_DRAW = 28;
const US_2019_URBAN_DRAW = 58;

function clampIndex(tierZeroBased: number): number {
  return Math.max(0, Math.min(4, tierZeroBased));
}

function incomeTier1953(income: number): number {
  if (income >= 4200) return 5;
  if (income >= 3800) return 4;
  if (income >= 3200) return 3;
  if (income >= 2600) return 2;
  return 1;
}

function econTier1979(income: number): number {
  if (income >= 19500) return 5;
  if (income >= 17500) return 4;
  if (income >= 15500) return 3;
  if (income >= 13800) return 2;
  return 1;
}

function eduTier1979(income: number): number {
  if (income >= 19500) return 5;
  if (income >= 17800) return 4;
  if (income >= 16000) return 3;
  if (income >= 14000) return 2;
  return 1;
}

function applyOverlay(build: TfpLeaves, overlay: OverlayPair | undefined): TfpLeaves {
  if (!overlay) return build;
  return {
    ...build,
    rdIntensity: overlay.rdIntensity,
    transportEfficiency: overlay.transportEfficiency,
  };
}

function leaves1953(stateId: string): TfpLeaves {
  const income = INCOME_1953[stateId] ?? 3900;
  const et = incomeTier1953(income) - 1;
  const ed = et;
  const leanMod = (et - 2) * 2;
  const infra = clampIndex(et);
  const urban = URBANIZATION_1953[stateId] ?? 64;
  const publicTransit = Math.round(urban * 0.4 + infra * 3);
  return applyOverlay({
    rdIntensity: 0.4 + ed * 0.15,
    workforceSkill: 42 + leanMod * 2,
    transportEfficiency: Math.max(20, Math.min(95, publicTransit)),
    broadbandAccess: 0,
    powerGridReliability: GRID_1953[infra]!,
    urbanizationRate: urban,
  }, OVERLAY_1953[stateId]);
}

function leaves1979(stateId: string): TfpLeaves {
  const income = INCOME_1979[stateId] ?? 16461;
  const et = econTier1979(income) - 1;
  const leanMod = (et - 2) * 2;
  const infra = clampIndex(et);
  const urban = URBANIZATION_1979[stateId] ?? 73.7;
  const publicTransit = Math.round(urban * 0.45 + infra * 4);
  return applyOverlay({
    rdIntensity: 0.9 + (eduTier1979(income) - 1) * 0.2,
    workforceSkill: 50 + leanMod * 2,
    transportEfficiency: Math.max(20, Math.min(95, publicTransit)),
    broadbandAccess: 0,
    powerGridReliability: GRID_1979[infra]!,
    urbanizationRate: urban,
  }, OVERLAY_2019[stateId]);
}

/** Game randomize(base, variance) with Native rng.next() in place of Math.random. */
function randomizeDraw(draw: number, base: number, variance: number): number {
  const variation = (draw - 0.5) * 2 * variance;
  return Math.round((base + variation) * 10) / 10;
}

function jitterRaw2019(rng: WorldRng, stateId: string): TfpLeaves {
  const config = CONFIG_2019[stateId] ?? ([3, 3, 70] as const);
  const edu = clampIndex(config[0] - 1);
  const infra = clampIndex(config[1] - 1);
  const urban = config[2];
  const draws: number[] = [];
  for (let i = 0; i < US_2019_RANDOMIZE_COUNT; i++) draws.push(rng.next());
  const publicTransit = randomizeDraw(draws[US_2019_TRANSIT_DRAW]!, urban * 0.5 + infra * 5, 5);
  return {
    rdIntensity: randomizeDraw(draws[US_2019_RD_DRAW]!, 1.5 + edu * 0.4, 0.3),
    workforceSkill: randomizeDraw(draws[US_2019_SKILL_DRAW]!, WORKFORCE_SKILL_2019[edu]!, 5),
    transportEfficiency: Math.max(20, Math.min(95, publicTransit)),
    broadbandAccess: randomizeDraw(draws[US_2019_BROADBAND_DRAW]!, BROADBAND_2019[infra]!, 3),
    powerGridReliability: randomizeDraw(draws[US_2019_GRID_DRAW]!, GRID_2019[infra]!, 0.1),
    urbanizationRate: randomizeDraw(draws[US_2019_URBAN_DRAW]!, urban, 2),
  };
}

function leaves2019(rng: WorldRng, stateId: string): TfpLeaves {
  return applyOverlay(jitterRaw2019(rng, stateId), OVERLAY_2019[stateId]);
}

function leaves1991(rng: WorldRng, stateId: string): TfpLeaves {
  const modern = jitterRaw2019(rng, stateId);
  return applyOverlay({
    ...modern,
    broadbandAccess: 0,
    urbanizationRate: Math.max(50, Math.min(100, modern.urbanizationRate - 3)),
  }, OVERLAY_1991[stateId]);
}

function writeLeaves(world: WorldState, regionId: string, leaves: TfpLeaves): void {
  const row = (world.regionalMetrics[regionId] ??= {});
  row[TFP_METRIC_PATHS.rdIntensity] = { value: leaves.rdIntensity };
  row[TFP_METRIC_PATHS.workforceSkill] = { value: leaves.workforceSkill };
  row[TFP_METRIC_PATHS.transportEfficiency] = { value: leaves.transportEfficiency };
  row[TFP_METRIC_PATHS.broadbandAccess] = { value: leaves.broadbandAccess };
  row[TFP_METRIC_PATHS.powerGridReliability] = { value: leaves.powerGridReliability };
  row[TFP_METRIC_PATHS.urbanizationRate] = { value: leaves.urbanizationRate };
}

export function usTfpLeavesFor(era: string, stateId: string, rng?: WorldRng): TfpLeaves | null {
  if (era === "1953") return leaves1953(stateId);
  if (era === "1979") return leaves1979(stateId);
  if (era === "1991") return rng ? leaves1991(rng, stateId) : null;
  if (era === "2019") return rng ? leaves2019(rng, stateId) : null;
  return SOURCE_ERA_TFP_LEAVES[era]?.[stateId] ?? null;
}

/** Write the six Game TFP paths onto every region Game supplies for this era. */
export function seedTfpLeaves(world: WorldState): void {
  const era = world.meta.era;
  const rng = rngFromSeed(`${world.meta.seed}:tfp-leaves`);
  const usJittered = new Map<string, TfpLeaves>();
  if (era === "2019" || era === "1991") {
    for (const stateId of US_STATE_ORDER) {
      usJittered.set(stateId, era === "2019" ? leaves2019(rng, stateId) : leaves1991(rng, stateId));
    }
  }
  for (const region of Object.values(world.regions)) {
    let leaves: TfpLeaves | null = null;
    if (region.countryId === "US") {
      leaves = usJittered.get(region.id) ?? usTfpLeavesFor(era, region.id);
    } else {
      leaves = AUTHORED_TFP_LEAVES[region.countryId]?.[era]?.[region.id]
        ?? (SOURCE_2019_METRIC_FALLBACK_ERAS.has(era)
          ? AUTHORED_TFP_LEAVES[region.countryId]?.["2019"]?.[region.id] ?? null
          : null);
    }
    if (!leaves) continue;
    writeLeaves(world, region.id, leaves);
  }
}
