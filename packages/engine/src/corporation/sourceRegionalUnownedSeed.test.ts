import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";

describe("source regional unowned-market seed", () => {
  it("seeds exact source local receipts by live region without national duplicates", () => {
    const world = createWorld({ era: "1953", countryId: "UK", homeRegionId: "LON", playerName: "Tester", seed: "source-market-seed" });

    expect(world.unownedSectors["UK:LON:manufacturing"]).toEqual({
      countryId: "UK",
      regionId: "LON",
      sectorType: "manufacturing",
      revenue: 241_818,
    });
    expect(world.unownedSectors["UK:SCO:manufacturing"]?.revenue).toBe(250_000);
    expect(world.unownedSectors["UK:WAL:manufacturing"]?.revenue).toBe(98_000);
    expect(world.unownedSectors["UK:NIR:manufacturing"]?.revenue).toBe(66_600);

    const ukPools = Object.values(world.unownedSectors).filter((pool) => pool.countryId === "UK");
    expect(Object.values(world.unownedSectors).filter((pool) => pool.regionId !== undefined)).toHaveLength(2_295);
    expect(ukPools).toHaveLength(Object.values(world.regions).filter((region) => region.countryId === "UK" && !region.corporationHeadquartersOnly).length * 17);
    expect(ukPools.every((pool) => pool.regionId !== undefined)).toBe(true);
    expect(world.unownedSectors["UK:manufacturing"]).toBeUndefined();

    // Corporate source-parent fan-out remains available to the secession
    // transition; only the unowned market representation changes here.
    expect(Object.values(world.corporateSectors ?? {}).some((asset) => asset.countryId === "UK" && asset.stateId === "SCO")).toBe(true);
    expect(Object.values(world.corporateSectors ?? {}).some((asset) => asset.countryId === "UK" && asset.stateId === "WAL")).toBe(true);
  });

  it("does not reseed economic history in an existing world or on save reload", () => {
    const world = createWorld({ era: "1953", countryId: "UK", homeRegionId: "LON", playerName: "Tester", seed: "source-market-history" });
    const pool = world.unownedSectors["UK:LON:manufacturing"]!;
    pool.revenue = 123_456;
    const changed = structuredClone(world.unownedSectors);

    const restored = deserializeSave(serializeSave(world, "2026-10-03T00:00:00Z"));
    expect(restored.unownedSectors).toEqual(changed);
    expect(restored.unownedSectors["UK:LON:manufacturing"]?.revenue).toBe(123_456);
  });
});
