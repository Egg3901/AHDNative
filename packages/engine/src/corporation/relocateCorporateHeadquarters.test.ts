import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { executeAction } from "../actions/execute.js";
import { serializeSave, deserializeSave } from "../save.js";

function privateIssuer() {
  const world = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", seed: "corp-hq-relocation", playerName: "Alex" });
  const corp = world.corporations["US-manufacturing"]!;
  corp.isPrivate = true;
  corp.ceoId = "player";
  corp.ceoType = "player";
  corp.ceoVacant = false;
  corp.headquartersRegionId = "DC";
  corp.sharePrice = 20;
  corp.totalShares = 100_000;
  corp.liquidCapital = 500_000;
  const destination = Object.values(world.regions).find((region) => region.countryId === "US" && region.id !== "DC" && !region.corporationHeadquartersOnly)!;
  return { world, corp, destination };
}

describe("source direct corporate headquarters relocation", () => {
  it("charges 7% of market capitalization and vacates a CEO who does not move", () => {
    const { world, corp, destination } = privateIssuer();
    const cost = Math.round(corp.sharePrice * corp.totalShares * 0.07);
    expect(executeAction(world, "player", "relocateCorporateHeadquarters", {
      corporationId: corp.id, regionId: destination.id,
    })).toMatchObject({ ok: true });
    expect(corp.liquidCapital).toBe(500_000 - cost);
    expect(corp.headquartersRegionId).toBe(destination.id);
    expect(corp.ceoVacant).toBe(true);
    expect(corp.ceoVacantSinceTurn).toBe(world.meta.turn);
    const loaded = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(loaded.corporations[corp.id]?.headquartersRegionId).toBe(destination.id);
    expect(loaded.corporations[corp.id]?.ceoVacant).toBe(true);
  });

  it("refuses a public move without a matching passed vote and keeps the save unchanged", () => {
    const { world, corp, destination } = privateIssuer();
    delete corp.isPrivate;
    const before = serializeSave(world, "2026-10-02T00:00:00.000Z");
    expect(executeAction(world, "player", "relocateCorporateHeadquarters", {
      corporationId: corp.id, regionId: destination.id,
    })).toMatchObject({ ok: false, error: expect.stringContaining("passed shareholder relocation vote") });
    expect(serializeSave(world, "2026-10-02T00:00:00.000Z")).toBe(before);
  });
});
