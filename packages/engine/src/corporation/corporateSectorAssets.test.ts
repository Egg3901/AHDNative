import { describe, expect, it } from "vitest";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { projectCorporateSector } from "./corporateSectorAssets.js";

describe("#293 corporate-sector asset core", () => {
  it("seeds one stable region-bound asset per aggregate Native corporation", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "issue-293", playerName: "Alex" });
    const assets = Object.values(world.corporateSectors ?? {});
    expect(assets).toHaveLength(Object.keys(world.corporations).length);
    expect(new Set(assets.map((asset) => asset.id)).size).toBe(assets.length);
    for (const asset of assets) {
      const corporation = world.corporations[asset.corporationId]!;
      expect(corporation).toBeDefined();
      expect(projectCorporateSector(world, asset)).toMatchObject({
        countryId: corporation.countryId,
        sectorType: corporation.sectorType,
        revenue: corporation.revenue,
        profitMargin: corporation.profitMargin,
        targetGrowthRate: corporation.targetGrowthRate,
        currentGrowthRate: corporation.currentGrowthRate,
        workers: 0,
        representingUnionId: null,
        forSale: null,
      });
      expect(world.regions[asset.stateId]?.countryId).toBe(asset.countryId);
      expect(world.unownedSectors[`${asset.countryId}:${asset.sectorType}`]).not.toBe(asset as never);
    }
  });

  it("is deterministic and survives the public save boundary", () => {
    const options = { era: "1953", countryId: "US", seed: "issue-293-save", playerName: "Alex" } as const;
    const world = createWorld(options);
    expect(createWorld(options).corporateSectors).toEqual(world.corporateSectors);
    const restored = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    expect(restored.corporateSectors).toEqual(world.corporateSectors);
  });
});
