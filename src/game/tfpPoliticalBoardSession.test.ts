import { describe, expect, it } from "vitest";
import { tfpBasket } from "../../packages/engine/src/demographics/laborForce.js";
import { legacyPoliticalHalfFromBoard } from "../../packages/engine/src/politicalMetrics/sourceRuntime.mjs";
import { GameSession } from "./session.js";

const POLITICAL_PATHS = [
  "education.workforceSkill",
  "infrastructure.transportEfficiency",
  "infrastructure.broadbandAccess",
  "infrastructure.powerGridReliability",
] as const;
const SAVED_AT = "2026-10-02T00:00:00.000Z";

type SavedWorld = {
  meta: { date: string };
  nationalMetrics: Record<string, Record<string, { value: number }>>;
};

function savedWorld(session: GameSession): SavedWorld {
  return JSON.parse(session.serialize(SAVED_AT)).world as SavedWorld;
}

function sourceWeightedValue(session: GameSession, countryId: string, path: string): number {
  const [category, metricId] = path.split(".");
  if (!category || !metricId) throw new Error(`invalid metric path ${path}`);
  let total = 0;
  let population = 0;
  const world = savedWorld(session);
  for (const { id: regionId } of session.view().regions) {
    const region = session.regions({ regionId }).selected;
    if (region?.countryId !== countryId || !(region.population && region.population > 0)) continue;
    const values = Object.fromEntries(Object.entries(region.politicalMetrics ?? {})
      .map(([id, metric]) => [id, metric.value]));
    const source = legacyPoliticalHalfFromBoard(values, {
      countryId,
      year: Number(world.meta.date.slice(0, 4)),
    });
    const value = source?.[category]?.[metricId]?.value;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    total += value * region.population;
    population += region.population;
  }
  if (population <= 0) throw new Error(`no source board input for ${countryId} ${path}`);
  return Math.round((total / population) * 1000) / 1000;
}

describe("#40 TFP political inputs through the public saved session", () => {
  it("carries all six current Game basket leaves across normal turns and reload", () => {
    const session = new GameSession();
    session.create({ era: "2019", countryId: "UK", seed: "tfp-session-board-flow", playerName: "Tester" });
    const startSkill = sourceWeightedValue(session, "UK", POLITICAL_PATHS[0]);
    expect(session.regions({ regionId: "LON" }).selected?.politicalMetrics?.["education.adultSkills"]?.value)
      .toEqual(expect.any(Number));

    session.advance();
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    session.advance();
    resumed.advance();

    const liveWorld = savedWorld(session);
    const resumedWorld = savedWorld(resumed);
    const tfp = liveWorld.nationalMetrics.UK;
    for (const path of [
      "economic.rdIntensity",
      ...POLITICAL_PATHS,
      "population.urbanizationRate",
    ]) {
      expect(tfp?.[path]?.value, path).toEqual(expect.any(Number));
    }
    for (const path of POLITICAL_PATHS) {
      expect(tfp?.[path]?.value, path).toBe(sourceWeightedValue(session, "UK", path));
      expect(resumedWorld.nationalMetrics.UK?.[path]?.value, `reloaded ${path}`)
        .toBe(tfp?.[path]?.value);
    }

    const endSkill = sourceWeightedValue(session, "UK", POLITICAL_PATHS[0]);
    expect(endSkill).not.toBe(startSkill);
    const basket = tfpBasket({
      rdIntensity: tfp!["economic.rdIntensity"]!.value,
      workforceSkill: tfp!["education.workforceSkill"]!.value,
      transportEfficiency: tfp!["infrastructure.transportEfficiency"]!.value,
      broadbandAccess: tfp!["infrastructure.broadbandAccess"]!.value,
      powerGridReliability: tfp!["infrastructure.powerGridReliability"]!.value,
      urbanizationRate: tfp!["population.urbanizationRate"]!.value,
    });
    expect(basket).not.toBe(1.2);
    expect(resumedWorld.nationalMetrics.UK).toEqual(tfp);
  }, 180_000);
});
