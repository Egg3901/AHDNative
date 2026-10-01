import { describe, expect, it } from "vitest";
import {
  legacyPoliticalHalfFromBoard,
} from "../politicalMetrics/sourceRuntime.mjs";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { TURN_PHASES } from "../phases/registry.js";
import { macroCountryTurnPhase, sourceTfpGrowthPhase } from "../phases/macroCountryTurn.js";
import { politicalCabinetResidualPhase } from "../politicalMetrics/phases.js";
import { rngFromSeed } from "../rng.js";
import { createWorld } from "../world.js";
import type { WorldState } from "../types.js";

const POLITICAL_TFP_PATHS = [
  "education.workforceSkill",
  "infrastructure.transportEfficiency",
  "infrastructure.broadbandAccess",
  "infrastructure.powerGridReliability",
] as const;

function gameProjectedRegionValue(world: WorldState, regionId: string, path: string): number | undefined {
  const board = world.regionalPoliticalMetrics?.[regionId];
  if (!board || board.countryId !== world.regions[regionId]?.countryId) return undefined;
  const [category, metricId] = path.split(".");
  if (!category || !metricId) return undefined;
  const year = Number(world.meta.date.slice(0, 4));
  return legacyPoliticalHalfFromBoard(board.values, { countryId: board.countryId, year })
    ?.[category]?.[metricId]?.value;
}

function gameWeightedProjection(world: WorldState, countryId: string, path: string): number | undefined {
  let total = 0;
  let weight = 0;
  for (const region of Object.values(world.regions)) {
    const population = region.population ?? 0;
    if (region.countryId !== countryId || !(population > 0)) continue;
    const value = gameProjectedRegionValue(world, region.id, path);
    if (value === undefined) continue;
    total += value * population;
    weight += population;
  }
  return weight > 0 ? Math.round((total / weight) * 1000) / 1000 : undefined;
}

describe("#40 source political board TFP bridge", () => {
  it("advances the current political board once before macro reads its TFP inputs", () => {
    const control = createWorld({
      era: "1953", countryId: "US", seed: "tfp-board-same-turn", playerName: "Tester",
    });
    const treated = createWorld({
      era: "1953", countryId: "US", seed: "tfp-board-same-turn", playerName: "Tester",
    });
    const boardIndex = TURN_PHASES.findIndex(phase => phase.name === "politicalMetricsDynamics");
    const macroIndex = TURN_PHASES.findIndex(phase => phase.name === "macroCountryTurn");
    const consumerIndex = TURN_PHASES.findIndex(phase => phase.name === "sourceTfpGrowth");
    expect(boardIndex).toBeGreaterThanOrEqual(0);
    expect(macroIndex).toBeGreaterThanOrEqual(0);
    expect(consumerIndex).toBeGreaterThan(macroIndex);
    expect(boardIndex).toBeLessThan(consumerIndex);

    for (const board of Object.values(treated.regionalPoliticalMetrics ?? {})) {
      if (board.countryId === "US") board.values["education.adultSkills"] = 100;
    }
    advanceTurn(control);
    advanceTurn(treated);

    // The source TFP/growth correction executes this same turn using the
    // post-dynamics board. Reading only the prior nationalMetrics row would
    // leave these seeded worlds equal.
    expect(treated.countries.US?.economy.outputGap)
      .not.toBe(control.countries.US?.economy.outputGap);
  });

  it("applies only the TFP growth delta after intermediate phase effects", () => {
    const control = createWorld({
      era: "1953", countryId: "US", seed: "tfp-board-preserve-middle-phases", playerName: "Tester",
    });
    const treated = createWorld({
      era: "1953", countryId: "US", seed: "tfp-board-preserve-middle-phases", playerName: "Tester",
    });
    macroCountryTurnPhase.run(control, rngFromSeed("tfp-board-preserve-middle-phases"));
    macroCountryTurnPhase.run(treated, rngFromSeed("tfp-board-preserve-middle-phases"));

    const treatedEconomy = treated.countries.US!.economy;
    treatedEconomy.growthRate += 0.02;
    treatedEconomy.unemploymentRate += 0.01;
    treatedEconomy.outputGap += 0.02;
    treatedEconomy.gdp *= 1.05;

    politicalCabinetResidualPhase.run(control, rngFromSeed("political-control"));
    politicalCabinetResidualPhase.run(treated, rngFromSeed("political-treated"));
    sourceTfpGrowthPhase.run(control, rngFromSeed("unused-control"));
    sourceTfpGrowthPhase.run(treated, rngFromSeed("unused-treated"));

    expect(treated.countries.US!.economy.growthRate - control.countries.US!.economy.growthRate)
      .toBeCloseTo(0.02, 4);
    expect(treated.countries.US!.economy.unemploymentRate - control.countries.US!.economy.unemploymentRate)
      .toBeCloseTo(0.01, 4);
    expect(treated.countries.US!.economy.outputGap - control.countries.US!.economy.outputGap)
      .toBeCloseTo(0.02, 3);
    expect(treated.countries.US!.economy.gdp / control.countries.US!.economy.gdp)
      .toBeCloseTo(1.05, 3);
  });

  it("uses Game's per-region board conversion before the national basket reads it", () => {
    const world = createWorld({
      era: "2019", countryId: "UK", seed: "tfp-board-bridge-2019", playerName: "Tester",
    });

    // Source oracle vector: the current Game political board for London maps to
    // these exact legacy-unit TFP inputs at 2019. This conversion is independent
    // of the Native national aggregation below.
    expect(gameProjectedRegionValue(world, "LON", POLITICAL_TFP_PATHS[0])).toBe(54.78);
    expect(gameProjectedRegionValue(world, "LON", POLITICAL_TFP_PATHS[1])).toBe(59.3);
    expect(gameProjectedRegionValue(world, "LON", POLITICAL_TFP_PATHS[2])).toBe(98.755);
    expect(gameProjectedRegionValue(world, "LON", POLITICAL_TFP_PATHS[3])).toBeCloseTo(99.8855, 10);

    for (const path of POLITICAL_TFP_PATHS) {
      expect(world.nationalMetrics.UK?.[path]?.value, path)
        .toBe(gameWeightedProjection(world, "UK", path));
    }
  });

  it("evolves source-projected leaves on ordinary turns and resumes the same saved continuation", () => {
    const live = createWorld({
      era: "2019", countryId: "UK", seed: "tfp-board-turn-save", playerName: "Tester",
    });
    const startSkill = gameProjectedRegionValue(live, "LON", POLITICAL_TFP_PATHS[0]);
    advanceTurn(live);
    const resumed = deserializeSave(serializeSave(live, "2026-10-02T00:00:00.000Z"));
    advanceTurn(live);
    advanceTurn(resumed);

    const endSkill = gameProjectedRegionValue(live, "LON", POLITICAL_TFP_PATHS[0]);
    expect(endSkill).not.toBe(startSkill);
    for (const path of POLITICAL_TFP_PATHS) {
      expect(live.nationalMetrics.UK?.[path]?.value, path)
        .toBe(gameWeightedProjection(live, "UK", path));
      expect(resumed.nationalMetrics.UK?.[path]?.value, `reload ${path}`)
        .toBe(live.nationalMetrics.UK?.[path]?.value);
    }
    expect(resumed.countries.UK?.economy).toEqual(live.countries.UK?.economy);
  });
});
