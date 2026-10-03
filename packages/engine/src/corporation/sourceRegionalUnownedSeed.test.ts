import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { SOURCE_REGIONAL_UNOWNED_SEED } from "./sourceRegionalUnownedSeed.generated.js";
import { SOURCE_NPP_HQ_MARKET_SEED } from "./sourceNppHqMarketSeed.generated.js";

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
    const currentEraSourceRows = SOURCE_REGIONAL_UNOWNED_SEED[world.meta.era] ?? [];
    const rowsForLiveRegions = currentEraSourceRows.filter(([countryId, regionId]) =>
      world.regions[regionId]?.countryId === countryId &&
      world.regions[regionId]?.corporationHeadquartersOnly !== true,
    );
    const regionalPools = Object.values(world.unownedSectors).filter((pool) => pool.regionId !== undefined);
    const sourceHqRows = SOURCE_NPP_HQ_MARKET_SEED.filter((row) =>
      row.era === world.meta.era && world.regions[row.stateId]?.corporationHeadquartersOnly === true,
    );
    expect(regionalPools).toHaveLength(rowsForLiveRegions.length + sourceHqRows.length);
    expect(new Set(regionalPools.map((pool) => `${pool.countryId}:${pool.regionId}:${pool.sectorType}`)).size)
      .toBe(regionalPools.length);
    expect(ukPools).toHaveLength(Object.values(world.regions).filter((region) => region.countryId === "UK" && !region.corporationHeadquartersOnly).length * 17);
    expect(ukPools.every((pool) => pool.regionId !== undefined)).toBe(true);
    expect(world.unownedSectors["UK:manufacturing"]).toBeUndefined();

    // Fresh source NPP issuers start with one physical asset at their actual
    // headquarters. GDP-only placeholders are not kept as duplicate regional
    // assets; progressed pre-bootstrap saves retain their recorded history.
    const ukIssuers = Object.values(world.corporations).filter((corp) => corp.countryId === "UK" && corp.ceoType === "npp");
    expect(ukIssuers).toHaveLength(17);
    const ukIssuerAssets = Object.values(world.corporateSectors ?? {}).filter((asset) => ukIssuers.some((corp) => corp.id === asset.corporationId));
    expect(ukIssuerAssets).toHaveLength(17);
    expect(ukIssuerAssets.every((asset) => asset.countryId === "UK" && asset.stateId === "LON")).toBe(true);
    expect(Object.values(world.corporateSectors ?? {}).some((asset) => asset.countryId === "UK" && (asset.stateId === "SCO" || asset.stateId === "WAL"))).toBe(false);
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
