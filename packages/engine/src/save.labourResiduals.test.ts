import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "./world.js";
import { deserializeSave, serializeSave } from "./save.js";

const OPTIONS = { seed: "labour-residual-save-v54", playerName: "Tester", countryId: "US", era: "1953" } as const;
const SAVED_AT = "2026-10-02T00:00:00.000Z";

describe("labour political residual save contract", () => {
  it("migrates a schema 53 snapshot forward without erasing its continuation state", () => {
    const world = createWorld(OPTIONS);
    world.regionalPoliticalMetrics!.CA!.labourResiduals = {
      "economy.workerSecurity": -0.6075,
      "society.civicLife": -0.324,
    };
    const parsed = JSON.parse(serializeSave(world, SAVED_AT));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    parsed.schemaVersion = 53;
    parsed.world.meta.schemaVersion = 53;

    const loaded = deserializeSave(JSON.stringify(parsed));
    expect(loaded.meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.regionalPoliticalMetrics?.CA?.labourResiduals).toEqual({
      "economy.workerSecurity": -0.6075,
      "society.civicLife": -0.324,
    });
  });

  it("rejects malformed persisted labour snapshots", () => {
    const world = createWorld(OPTIONS);
    const parsed = JSON.parse(serializeSave(world, SAVED_AT));
    parsed.world.regionalPoliticalMetrics.CA.labourResiduals = ["invalid"];
    expect(() => deserializeSave(JSON.stringify(parsed))).toThrow(/labour residuals are invalid/);
  });
});
