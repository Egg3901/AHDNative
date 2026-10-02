import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "./world.js";
import { deserializeSave, serializeSave } from "./save.js";
import { corporateSectorAssets } from "./corporation/corporateSectorAssets.js";

function saveAtSchema(world: ReturnType<typeof createWorld>, schemaVersion: number): string {
  const saved = JSON.parse(serializeSave(world, "2026-10-02T00:00:00.000Z")) as {
    schemaVersion: number;
    world: { meta: { schemaVersion: number } };
  };
  saved.schemaVersion = schemaVersion;
  saved.world.meta.schemaVersion = schemaVersion;
  return JSON.stringify(saved);
}

describe("corporate strategy transition save boundary", () => {
  it("uses a new schema version for retool continuation", () => {
    expect(SCHEMA_VERSION).toBe(56);
  });

  it("preserves absent transition fields while migrating a pre-retool save", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "strategy-v53-absence", playerName: "Alex" });
    for (const asset of Object.values(corporateSectorAssets(world))) {
      delete asset.transitionFromStrategyId;
      delete asset.transitionStartTurn;
      delete asset.transitionCooldownUntilTurn;
      delete asset.retoolRescaleApplied;
    }

    const resumed = deserializeSave(saveAtSchema(world, 53));
    const assets = Object.values(corporateSectorAssets(resumed));
    expect(resumed.meta.schemaVersion).toBe(56);
    for (const asset of assets) {
      expect(asset.transitionFromStrategyId).toBeUndefined();
      expect(asset.transitionStartTurn).toBeUndefined();
      expect(asset.transitionCooldownUntilTurn).toBeUndefined();
      expect(asset.retoolRescaleApplied).toBeUndefined();
    }
  });

  it("retains a persisted transition while migrating from schema 55", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "strategy-v55-transition", playerName: "Alex" });
    const asset = Object.values(corporateSectorAssets(world)).find(row => row.sectorType === "extraction")!;
    asset.strategyId = "iron_mining";
    asset.transitionFromStrategyId = "standard";
    asset.transitionStartTurn = world.meta.turn;
    asset.transitionCooldownUntilTurn = world.meta.turn + 24;
    asset.retoolRescaleApplied = true;

    const resumed = deserializeSave(saveAtSchema(world, 55));
    expect(resumed.meta.schemaVersion).toBe(56);
    expect(resumed.corporateSectors?.[asset.id]).toEqual(asset);
  });
});
