import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { mandateFromLocals } from "./actions.js";

describe("source regional cost-of-living lifecycle", () => {
  it("seeds from urbanization, advances with source inertia, and carries the metric through save/reload", async () => {
    const world = createWorld({ seed: "col-source-lifecycle", playerName: "Test", countryId: "UK", era: "1953" });
    const stateId = "SCO";
    const urbanization = world.regionalMetrics[stateId]?.["population.urbanizationRate"]?.value ?? 55;
    const sourceTarget = 100 + (urbanization - 55) * 0.3;
    const seeded = world.regionalMetrics[stateId]?.["economic.costOfLiving"];
    expect(seeded).toEqual({ value: sourceTarget, simBaseline: sourceTarget });

    // Declared phase fixture: retain a +4 metric residual while the simulated
    // baseline moves 5% toward the urbanization-derived target. This is not a
    // claim that a public policy action produced the residual.
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
    const local = locals[0]!;
    const employerLocals = Object.values(corporateSectorAssets(loaded)).filter(
      (asset) => asset.corporationId === local.corporationId && asset.countryId === "UK" && asset.sectorType === "manufacturing",
    );
    for (const shop of employerLocals) {
      shop.wageLevel = 1;
      shop.workerExpectationIndex = 1;
    }
    // This is an explicit mandate-boundary fixture: the source metric was
    // produced by an ordinary turn and persisted through reload, while the
    // employer's local rows are configured to isolate their consumer.
    // No player leadership, treasury, law enactment, or campaign authority is
    // implied by this direct exported-domain seam.
    const relevantLocals = employerLocals.map((shop) => ({
      id: shop.id,
      corporationId: shop.corporationId,
      countryId: shop.countryId,
      sectorType: shop.sectorType,
      stateId: shop.stateId,
      workers: shop.workers,
      unionization: shop.unionization,
      wageLevel: shop.wageLevel,
      workerExpectationIndex: shop.workerExpectationIndex,
    }));
    const sourceCost = loaded.regionalMetrics[local.stateId ?? ""]?.["economic.costOfLiving"]?.value;
    expect(sourceCost).toBeGreaterThan(100);
    const mandate = mandateFromLocals(loaded, union, relevantLocals, union.treasury);

    // Game 0538's buildBargainingMandate uses realWage = wage / (COL / 100),
    // relativeGap = max(0, expectation - realWage) / max(0.8, realWage),
    // then clamps relativeGap * 400 and rounds the weighted score to 0.1.
    // At source COL 112 with wage/expectation 1/1, its bargaining.test.ts
    // vector yields exactly 48.0; this in-world value is similarly unsaturated.
    const expectedGrievance = Math.round(
      (relevantLocals.reduce((sum, shop) => {
        const cost = loaded.regionalMetrics[shop.stateId ?? ""]?.["economic.costOfLiving"]?.value ?? 100;
        const realWage = 100 / cost;
        return sum + (Math.max(0, 1 - realWage) / Math.max(0.8, realWage) * 400) * Math.max(0, shop.workers);
      }, 0) /
        relevantLocals.reduce((sum, shop) => sum + Math.max(0, shop.workers), 0)) * 10,
    ) / 10;
    expect(mandate.grievance).toBe(expectedGrievance);
    expect(mandate.grievance).toBeGreaterThan(0);
    expect(mandate.grievance).toBeLessThan(100);

    // Paired control changes only the persisted local COL reading. If the
    // reader is omitted, both mandates collapse to the neutral 100 baseline.
    const control = deserializeSave(serializeSave(loaded, "2026-10-03T00:00:00.000Z"));
    for (const shop of employerLocals) {
      if (shop.stateId) control.regionalMetrics[shop.stateId]!["economic.costOfLiving"]!.value = 100;
    }
    const controlLocals = relevantLocals.map((shop) => ({ ...shop }));
    const baselineControl = mandateFromLocals(
      control,
      control.unions[union.id]!,
      controlLocals,
      control.unions[union.id]!.treasury,
    );
    expect(baselineControl.grievance).toBe(0);
    expect(mandate.grievance).not.toBe(baselineControl.grievance);

    // Current saved player union lacks enough organized workers to open a
    // campaign, and bargaining is not registered in executeAction. Therefore
    // this does not claim an earned player action or public campaign journey.
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
