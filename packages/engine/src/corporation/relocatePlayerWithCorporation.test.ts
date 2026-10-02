import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { serializeSave, deserializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import { SOURCE_CHARACTER_RELOCATION_COOLDOWN_TURNS } from "./relocatePlayerWithCorporation.js";

function relocationWorld() {
  const world = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", seed: "ceo-relocation-source", playerName: "Alex" });
  const corp = world.corporations["US-manufacturing"]!;
  corp.ceoId = "player";
  corp.ceoType = "player";
  corp.ceoVacant = false;
  corp.headquartersRegionId = "DC";
  corp.sharePrice = 12;
  corp.totalShares = 100_000;
  corp.liquidCapital = 100_000;
  const destination = Object.values(world.regions).find((region) => region.countryId === "US" && region.id !== "DC" && !region.corporationHeadquartersOnly)!;
  return { world, corp, destination };
}

describe("source CEO relocation with corporation", () => {
  it("moves player and headquarters together, charges 7% of local market cap, and saves the cooldown", () => {
    const { world, corp, destination } = relocationWorld();
    const beforeCash = corp.liquidCapital;
    const expectedCost = Math.round(corp.sharePrice * corp.totalShares * 0.07);
    expect(executeAction(world, "player", "relocatePlayerWithCorporation", {
      corporationId: corp.id, regionId: destination.id,
    })).toMatchObject({ ok: true });
    expect(world.player.homeRegionId).toBe(destination.id);
    expect(corp.headquartersRegionId).toBe(destination.id);
    expect(corp.liquidCapital).toBe(beforeCash - expectedCost);
    expect(world.player.lastRelocatedTurn).toBe(world.meta.turn);

    const loaded = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(loaded.player.homeRegionId).toBe(destination.id);
    expect(loaded.player.lastRelocatedTurn).toBe(world.meta.turn);
    expect(loaded.corporations[corp.id]?.headquartersRegionId).toBe(destination.id);
    const returnRegion = Object.values(loaded.regions).find((region) => region.countryId === "US" && region.id !== destination.id && !region.corporationHeadquartersOnly)!;
    expect(executeAction(loaded, "player", "relocatePlayerWithCorporation", {
      corporationId: corp.id, regionId: returnRegion.id,
    })).toMatchObject({ ok: false, error: expect.stringContaining("cooldown") });
  });

  it("refuses an unaffordable move without changing either residence or corporate cash", () => {
    const { world, corp, destination } = relocationWorld();
    corp.liquidCapital = 1;
    const before = serializeSave(world, "2026-10-02T00:00:00.000Z");
    expect(executeAction(world, "player", "relocatePlayerWithCorporation", {
      corporationId: corp.id, regionId: destination.id,
    })).toMatchObject({ ok: false, error: expect.stringContaining("Insufficient corporate cash") });
    expect(serializeSave(world, "2026-10-02T00:00:00.000Z")).toBe(before);
  });

  it("uses the source 72-turn cooldown boundary", () => {
    const { world, corp, destination } = relocationWorld();
    world.player.lastRelocatedTurn = world.meta.turn - SOURCE_CHARACTER_RELOCATION_COOLDOWN_TURNS + 1;
    expect(executeAction(world, "player", "relocatePlayerWithCorporation", {
      corporationId: corp.id, regionId: destination.id,
    })).toMatchObject({ ok: false, error: expect.stringContaining("cooldown") });
    world.meta.turn += 1;
    expect(executeAction(world, "player", "relocatePlayerWithCorporation", {
      corporationId: corp.id, regionId: destination.id,
    })).toMatchObject({ ok: true });
  });
});
