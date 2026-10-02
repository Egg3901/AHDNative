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
  budgets?: Record<string, { economicFactors: { gdpGrowth: number } }>;
  corporateSectors?: Record<string, {
    stateId: string | null;
    revenue?: number;
  }>;
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
  it("carries an enacted public education-spending change into the workforce TFP input", () => {
    const options = {
      era: "2019",
      countryId: "US",
      seed: "tfp-session-education-spending",
      playerName: "Tester",
      mode: "hos" as const,
    };
    const control = new GameSession();
    control.create(options);
    const treated = new GameSession();
    treated.create(options);
    const initial = JSON.parse(treated.serialize(SAVED_AT)) as {
      world: {
        budgets: Record<string, { spending: { byCategory: Record<string, number> } }>;
      };
    };
    const before = initial.world.budgets.US!.spending.byCategory.education ?? 0;
    expect(treated.act("adjustBudgetSpending", {
      budgetCategory: "education",
      budgetAmount: before + 500_000_000_000,
    }).ok).toBe(true);

    control.advance();
    treated.advance();
    // Source political dynamics uses the first observation to establish the
    // structural residual. The enacted spending enters its causal drift on the
    // following ordinary turn.
    control.advance();
    treated.advance();
    const controlSkill = sourceWeightedValue(control, "US", POLITICAL_PATHS[0]);
    const treatedSkill = sourceWeightedValue(treated, "US", POLITICAL_PATHS[0]);
    expect(treatedSkill).toBeGreaterThan(controlSkill);
    const treatedTfp = savedWorld(treated).nationalMetrics.US?.[POLITICAL_PATHS[0]]?.value;
    expect(treatedTfp).toBe(treatedSkill);
    expect(treatedTfp).not.toBe(savedWorld(control).nationalMetrics.US?.[POLITICAL_PATHS[0]]?.value);

    const controlWorld = savedWorld(control);
    const treatedWorld = savedWorld(treated);
    expect(treatedWorld.budgets?.US?.economicFactors.gdpGrowth)
      .toBe(treatedWorld.nationalMetrics.US?.["economic.gdpGrowth"]?.value);
    expect(controlWorld.budgets?.US?.economicFactors.gdpGrowth)
      .toBe(controlWorld.nationalMetrics.US?.["economic.gdpGrowth"]?.value);

    const resumed = new GameSession();
    resumed.load(treated.serialize(SAVED_AT));
    treated.advance();
    resumed.advance();
    const continuedSkill = sourceWeightedValue(treated, "US", POLITICAL_PATHS[0]);
    expect(savedWorld(resumed).nationalMetrics.US?.[POLITICAL_PATHS[0]]?.value)
      .toBe(savedWorld(treated).nationalMetrics.US?.[POLITICAL_PATHS[0]]?.value);
    expect(sourceWeightedValue(resumed, "US", POLITICAL_PATHS[0])).toBe(continuedSkill);
  }, 180_000);

  it("evolves the four source political leaves and preserves the two seed-only roots across turns/reload", () => {
    const session = new GameSession();
    session.create({ era: "2019", countryId: "UK", seed: "tfp-session-board-flow", playerName: "Tester" });
    const initialWorld = savedWorld(session);
    const startPoliticalInputs = Object.fromEntries(
      POLITICAL_PATHS.map((path) => [path, sourceWeightedValue(session, "UK", path)]),
    );
    const startRd = initialWorld.nationalMetrics.UK?.["economic.rdIntensity"]?.value;
    const startUrbanization = initialWorld.nationalMetrics.UK?.["population.urbanizationRate"]?.value;
    expect(session.regions({ regionId: "LON" }).selected?.politicalMetrics?.["education.adultSkills"]?.value)
      .toEqual(expect.any(Number));

    session.advance();
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    session.advance();
    resumed.advance();

    const liveWorld = savedWorld(session);
    const resumedWorld = savedWorld(resumed);
    const recordedRegionalRevenue = Object.values(liveWorld.corporateSectors ?? {})
      .filter((asset) => (asset.stateId === "SCO" || asset.stateId === "WAL") && (asset.revenue ?? 0) > 0);
    expect(recordedRegionalRevenue.length).toBeGreaterThan(0);
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

    for (const path of POLITICAL_PATHS) {
      expect(sourceWeightedValue(session, "UK", path), `evolved ${path}`)
        .not.toBe(startPoliticalInputs[path]);
    }
    expect(tfp?.["economic.rdIntensity"]?.value, "source R&D root has no turn writer")
      .toBe(startRd);
    expect(tfp?.["population.urbanizationRate"]?.value, "source urbanization root has no turn writer")
      .toBe(startUrbanization);
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
