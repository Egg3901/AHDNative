import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { openBargainingCampaignAction } from "./actions.js";

describe("source regional cost-of-living lifecycle", () => {
  it("seeds from urbanization, advances with source inertia, and keeps local mandate inputs after reload", async () => {
    const world = createWorld({ seed: "col-source-lifecycle", playerName: "Test", countryId: "UK", era: "1953" });
    const stateId = "SCO";
    const urbanization = world.regionalMetrics[stateId]?.["population.urbanizationRate"]?.value ?? 55;
    const sourceTarget = 100 + (urbanization - 55) * 0.3;
    const seeded = world.regionalMetrics[stateId]?.["economic.costOfLiving"];
    expect(seeded).toEqual({ value: sourceTarget, simBaseline: sourceTarget });

    // Source phase contract: policy-adjusted delta is retained while the
    // simulated baseline moves 5% toward the urbanization-derived target.
    world.regionalMetrics[stateId]!["economic.costOfLiving"] = {
      value: sourceTarget + 4,
      simBaseline: sourceTarget,
    };
    world.regionalMetrics[stateId]!["population.urbanizationRate"] = { value: urbanization + 10 };
    const nextTarget = 100 + ((urbanization + 10) - 55) * 0.3;
    const expectedBaseline = Math.round((0.95 * sourceTarget + 0.05 * nextTarget) * 100) / 100;
    advanceTurn(world);
    const after = world.regionalMetrics[stateId]!["economic.costOfLiving"]!;
    expect(after.simBaseline).toBe(expectedBaseline);
    expect(after.value).toBe(expectedBaseline + 4);

    const loaded = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    const locals = Object.values(corporateSectorAssets(loaded)).filter(
      (asset) => asset.stateId === stateId && asset.sectorType === "manufacturing" && asset.countryId === "UK",
    );
    expect(locals.length).toBeGreaterThan(0);
    const union = loaded.unions["UK-manufacturing"]!;
    union.treasury = 5000;
    union.unionization = 100;
    const local = locals[0]!;
    const employerLocals = Object.values(corporateSectorAssets(loaded)).filter(
      (asset) => asset.corporationId === local.corporationId && asset.countryId === "UK" && asset.sectorType === "manufacturing",
    );
    for (const shop of employerLocals) {
      shop.unionization = 100;
      shop.wageLevel = 0.8;
      shop.workerExpectationIndex = 2;
    }
    loaded.budgets.UK!.unionLawBias = 50;
    const campaign = openBargainingCampaignAction(loaded, {
      unionId: union.id,
      employerCorporationId: local.corporationId,
      terms: { wageLevel: 0.8, agreementDurationTurns: 48, noStrikeTurns: 24 },
      turn: loaded.meta.turn,
    });
    const workers = employerLocals.reduce((sum, shop) => sum + Math.max(0, shop.workers), 0);
    const weightedGap = employerLocals.reduce((sum, shop) => {
      const cost = loaded.regionalMetrics[shop.stateId ?? ""]?.["economic.costOfLiving"]?.value ?? 100;
      const realWage = 0.8 / (cost / 100);
      return sum + Math.min(100, Math.max(0, (2 - realWage) / Math.max(0.8, realWage) * 400)) * shop.workers;
    }, 0) / workers;
    const expectedGrievance = Math.round(weightedGap * 100) / 100;
    expect(campaign.mandate.grievance).toBe(expectedGrievance);
  });

  it("keeps absent legacy baselines absent and rejects malformed present baselines", () => {
    const world = createWorld({ seed: "col-source-legacy", playerName: "Test", countryId: "UK", era: "1953" });
    const row = world.regionalMetrics.SCO!["economic.costOfLiving"]!;
    delete row.simBaseline;
    world.meta.schemaVersion = 65;
    const legacy = JSON.parse(serializeSave(world, "2026-10-03T00:00:00.000Z")) as {
      schemaVersion: number;
      world: typeof world;
    };
    legacy.schemaVersion = 65;
    const loaded = deserializeSave(JSON.stringify(legacy));
    expect(loaded.meta.schemaVersion).toBe(68);
    expect(loaded.regionalMetrics.SCO!["economic.costOfLiving"]?.simBaseline).toBeUndefined();

    loaded.regionalMetrics.SCO!["economic.costOfLiving"]!.simBaseline = 201;
    expect(() => deserializeSave(serializeSave(loaded, "2026-10-03T00:00:00.000Z"))).toThrow(/invalid regional cost-of-living metric/);
  });
});
