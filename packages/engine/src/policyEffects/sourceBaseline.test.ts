import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { SOURCE_METRIC_LAWS } from "../legislation/catalog.js";
import { catalogPolicyOptionAnnualCost, rebuildPolicyBudgets } from "./budget.js";

describe("source political baseline seeding", () => {
  it("persists current-source national baselines and prices a source armed-forces option", () => {
    const world = createWorld({
      seed: "source-policy-baseline",
      playerName: "Source Baseline",
      countryId: "US",
      era: "1953",
      mode: "hos",
    });
    const armedForces = SOURCE_METRIC_LAWS.find((law) => law.id === "us.defense.armedForces.primary");
    expect(armedForces).toMatchObject({ baselineLevel: 4, budgetCostClass: "gdpFraction" });
    const baselineId = "source-baseline:us.defense.armedForces.primary";
    expect(world.policyLedger[baselineId]).toMatchObject({
      legislationTypeId: "us.defense.armedForces.primary",
      policyOptionId: "4",
      sourcePolicyOptionId: "l4",
      effectDirection: 1,
      scope: "national",
      countryId: "US",
      enactedTurn: 0,
    });
    expect(world.enactedLaws).toContainEqual(expect.objectContaining({
      id: "us.defense.armedForces.primary",
      billId: baselineId,
      level: 4,
      scope: "national",
    }));

    expect(world.budgets.US!.gdp).toBe(387_000_000_000);
    const baselineSpend = world.budgets.US!.spending.total;
    rebuildPolicyBudgets(world);
    expect(world.budgets.US!.spending.total).toBe(baselineSpend);
    expect(catalogPolicyOptionAnnualCost(armedForces!, "l3", world.budgets.US!.gdp, world.budgets.US!.population, 1953))
      .toBe(21_439_800_000);
    expect(catalogPolicyOptionAnnualCost(armedForces!, "l4", world.budgets.US!.gdp, world.budgets.US!.population, 1953))
      .toBe(29_257_200_000);

    const restored = deserializeSave(serializeSave(world, "2026-10-04T00:00:00.000Z"));
    expect(restored.policyLedger[baselineId]).toEqual(world.policyLedger[baselineId]);
    expect(restored.enactedLaws).toEqual(world.enactedLaws);
  });

  it("seeds the source's regional level-zero row for a both-scope law", () => {
    const world = createWorld({
      seed: "source-policy-regional-baseline",
      playerName: "Source Baseline",
      countryId: "US",
      era: "1953",
      mode: "hos",
    });
    const california = world.regions.US_CA;
    expect(california).toBeDefined();
    const regionalId = "source-baseline:US_CA:us.environment.conservation.primary";
    expect(world.policyLedger[regionalId]).toMatchObject({
      legislationTypeId: "us.environment.conservation.primary",
      policyOptionId: "0",
      sourcePolicyOptionId: "l0",
      scope: "regional",
      regionId: "US_CA",
      countryId: "US",
    });
    expect(world.enactedLaws.some((law) => law.id === "us.environment.conservation.primary" && law.scope === "regional"))
      .toBe(false);
  });
});
