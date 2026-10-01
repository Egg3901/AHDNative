import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { executeAction } from "../actions/execute.js";
import { deserializeSave, serializeSave } from "../save.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { SECTOR_EXPANSION_BASE_COST_ANCHOR } from "./operations.js";

const options = { seed: "regional-extraction-entry", playerName: "Tester", countryId: "US", era: "2019" } as const;

describe("regional extraction operation entry", () => {
  it("opens and saves a source resource operation from the public CEO action", () => {
    const world = createWorld(options);
    const corporation = world.corporations["US-extraction"]!;
    corporation.ceoId = "player";
    corporation.ceoType = "player";
    corporation.ceoVacant = false;
    corporation.liquidCapital = 1_000_000;
    const before = corporation.liquidCapital;

    const result = executeAction(world, "player", "expandRegionalExtraction", { regionId: "TX" });

    expect(result.ok).toBe(true);
    expect(world.corporations["US-extraction"]!.liquidCapital).toBe(before - SECTOR_EXPANSION_BASE_COST_ANCHOR);
    expect(Object.values(corporateSectorAssets(world))).toContainEqual(expect.objectContaining({
      corporationId: "US-extraction", countryId: "US", stateId: "TX", sectorType: "extraction", workers: 500,
    }));
    const reloaded = deserializeSave(serializeSave(world));
    expect(Object.values(corporateSectorAssets(reloaded))).toContainEqual(expect.objectContaining({
      corporationId: "US-extraction", countryId: "US", stateId: "TX", sectorType: "extraction", workers: 500,
    }));
  });

  it("rejects an NPC or vacant CEO, a no-deposit region, and a duplicate without charging the company", () => {
    const world = createWorld(options);
    const corporation = world.corporations["US-extraction"]!;
    corporation.liquidCapital = 1_000_000;
    const before = corporation.liquidCapital;
    expect(executeAction(world, "player", "expandRegionalExtraction", { regionId: "TX" }).ok).toBe(false);
    corporation.ceoId = "player";
    corporation.ceoType = "player";
    corporation.ceoVacant = true;
    expect(executeAction(world, "player", "expandRegionalExtraction", { regionId: "TX" }).ok).toBe(false);
    corporation.ceoVacant = false;
    expect(executeAction(world, "player", "expandRegionalExtraction", { regionId: "DC" }).ok).toBe(false);
    expect(executeAction(world, "player", "expandRegionalExtraction", { regionId: "TX" }).ok).toBe(true);
    expect(executeAction(world, "player", "expandRegionalExtraction", { regionId: "TX" }).ok).toBe(false);
    expect(corporation.liquidCapital).toBe(before - SECTOR_EXPANSION_BASE_COST_ANCHOR);
  });
});
