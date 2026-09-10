import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { executeAction } from "./execute.js";
import { serializeSave } from "../save.js";

function ready(funds = 25_000) {
  const world = createWorld({ era: "1953", countryId: "US", seed: "caucus-accounting", playerName: "Ada" });
  // Exact accounting boundary, not a simulated career.
  world.player.partyId = "US_DEM";
  world.player.funds = funds;
  world.player.actions = 9;
  return world;
}

describe("caucus founding through the public action", () => {
  it.each([25_000, 40_000, 50_000])("charges the single advertised 25k with %i available", (funds) => {
    const world = ready(funds);
    expect(executeAction(world, "player", "createCaucus", { caucusName: "Blue Dog", caucusTaxRate: 2.5 }).ok).toBe(true);
    expect(world.player.funds).toBe(funds - 25_000);
    expect(world.player.actions).toBe(5);
    expect(world.player.actionCounts.createCaucus).toBe(1);
    expect(world.caucuses).toEqual([expect.objectContaining({ name: "Blue Dog", taxRate: 2.5, memberIds: ["player"] })]);
  });
  it("rejects insufficient funds without changing the save", () => {
    const world = ready(24_999);
    const before = serializeSave(world, "2026-09-10T00:00:00.000Z");
    expect(executeAction(world, "player", "createCaucus", { caucusName: "Blue Dog" }).ok).toBe(false);
    expect(serializeSave(world, "2026-09-10T00:00:00.000Z")).toBe(before);
  });
  it.each([NaN, Infinity, -1, 6])("rejects invalid tax %s without changing the save", (tax) => {
    const world = ready();
    const before = serializeSave(world, "2026-09-10T00:00:00.000Z");
    expect(executeAction(world, "player", "createCaucus", { caucusName: "Blue Dog", caucusTaxRate: tax }).ok).toBe(false);
    expect(serializeSave(world, "2026-09-10T00:00:00.000Z")).toBe(before);
  });

});
