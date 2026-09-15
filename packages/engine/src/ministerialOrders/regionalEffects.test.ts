import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { serializeSave, deserializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { runMinisterialOrders } from "./phases.js";

const OPTIONS = { era: "1953", countryId: "US", seed: "issue-275", playerName: "Alex" } as const;

describe("#275 regional ministerial order consequences", () => {
  it("aggregates and caps active effects against an existing authoritative regional metric", () => {
    const world = createWorld(OPTIONS);
    world.regionalMetrics.AL = { "economic.unemploymentRate": { value: 10 } };
    world.ministerialOrders = ["one", "two"].map((id) => ({
      id,
      countryId: "US",
      characterId: "player",
      active: true,
      effects: [{ metric: "economic.unemploymentRate", modifier: -0.05, scope: "regional" as const, regionId: "AL" }],
      issuedAtTurn: 0,
    }));

    const result = runMinisterialOrders(world);

    expect(world.regionalMetrics.AL["economic.unemploymentRate"]?.value).toBe(9.92);
    expect(result).toMatchObject({ regionalMetricsUpdated: 1, regionsUpdated: ["AL"], rejectedRegionalEffects: [] });
    expect(world.ministerialOrders.every((order) => order.lastAppliedTurn === 0)).toBe(true);
  });

  it("rejects missing, cross-country, and unsupported targets without creating state", () => {
    const world = createWorld(OPTIONS);
    world.regionalMetrics.AL = { "economic.unemploymentRate": { value: 10 } };
    world.ministerialOrders = [
      { id: "missing", countryId: "US", characterId: "player", active: true, effects: [{ metric: "economic.unemploymentRate", modifier: -0.04, scope: "regional" as const }], issuedAtTurn: 0 },
      { id: "foreign", countryId: "US", characterId: "player", active: true, effects: [{ metric: "economic.unemploymentRate", modifier: -0.04, scope: "regional" as const, regionId: "LON" }], issuedAtTurn: 0 },
      { id: "unsupported", countryId: "US", characterId: "player", active: true, effects: [{ metric: "social.imaginary", modifier: 0.04, scope: "regional" as const, regionId: "AL" }], issuedAtTurn: 0 },
    ];

    const before = structuredClone(world.regionalMetrics);
    const result = runMinisterialOrders(world);

    expect(world.regionalMetrics).toEqual(before);
    expect(result.rejectedRegionalEffects).toEqual([
      { orderId: "missing", metric: "economic.unemploymentRate", reason: "targetRequired" },
      { orderId: "foreign", metric: "economic.unemploymentRate", regionId: "LON", reason: "invalidRegion" },
      { orderId: "unsupported", metric: "social.imaginary", regionId: "AL", reason: "unsupportedMetric" },
    ]);
    expect(world.regionalMetrics.LON).toBeUndefined();
  });

  it("applies before policy effects, then persists the changed region through save/reload", () => {
    const world = createWorld(OPTIONS);
    world.regionalMetrics.AL = { "economic.unemploymentRate": { value: 10 } };
    world.ministerialOrders = [{
      id: "persisted",
      countryId: "US",
      characterId: "player",
      active: true,
      effects: [{ metric: "economic.unemploymentRate", modifier: -0.04, scope: "regional", regionId: "AL" }],
      issuedAtTurn: 0,
    }];

    const report = advanceTurn(world);
    expect(report.phaseTimings.findIndex((phase) => phase.name === "ministerialOrders"))
      .toBeLessThan(report.phaseTimings.findIndex((phase) => phase.name === "policyEffects"));
    const restored = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    expect(restored.regionalMetrics.AL).toEqual(world.regionalMetrics.AL);
  });

  it("expires a regional order at the exclusive boundary without mutating its target", () => {
    const world = createWorld(OPTIONS);
    world.meta.turn = 1;
    world.regionalMetrics.AL = { "economic.unemploymentRate": { value: 10 } };
    world.ministerialOrders = [{
      id: "expired",
      countryId: "US",
      characterId: "player",
      active: true,
      effects: [{ metric: "economic.unemploymentRate", modifier: -0.04, scope: "regional", regionId: "AL" }],
      issuedAtTurn: 0,
      duration: 1,
      expiresTurn: 1,
    }];

    const result = runMinisterialOrders(world);

    expect(world.regionalMetrics.AL["economic.unemploymentRate"]?.value).toBe(10);
    expect(world.ministerialOrders[0]).toMatchObject({ active: false, status: "expired" });
    expect(result.rejectedRegionalEffects).toEqual([
      { orderId: "expired", metric: "economic.unemploymentRate", regionId: "AL", reason: "inactive" },
    ]);
  });
});
