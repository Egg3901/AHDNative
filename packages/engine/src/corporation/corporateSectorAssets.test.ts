import { describe, expect, it } from "vitest";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { corporateSectorAssets, projectCorporateSector } from "./corporateSectorAssets.js";

const PINNED_1953_ASSET_VECTOR = "DD:agriculture,DD:automobiles,DD:chemical_industries,DD:construction,DD:defense,DD:energy,DD:entertainment,DD:extraction,DD:financial,DD:healthcare,DD:logistics,DD:manufacturing,DD:media,DD:real_estate,DD:retail,DD:technology,DD:telecommunications,RU:agriculture,RU:chemical_industries,RU:construction,RU:defense,RU:energy,RU:extraction,RU:financial,RU:healthcare,RU:logistics,RU:manufacturing,RU:media,RU:real_estate,RU:retail,RU:telecommunications,UK:agriculture,UK:automobiles,UK:chemical_industries,UK:construction,UK:defense,UK:energy,UK:entertainment,UK:extraction,UK:financial,UK:healthcare,UK:logistics,UK:manufacturing,UK:media,UK:real_estate,UK:retail,UK:telecommunications,US:agriculture,US:automobiles,US:chemical_industries,US:construction,US:defense,US:energy,US:entertainment,US:extraction,US:financial,US:healthcare,US:logistics,US:manufacturing,US:media,US:real_estate,US:retail,US:telecommunications";

describe("#293 corporate-sector asset core", () => {
  it("seeds one stable region-bound asset per aggregate Native corporation", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "issue-293", playerName: "Alex" });
    expect(world.corporateSectors).toBeUndefined();
    const assets = Object.values(corporateSectorAssets(world));
    expect(assets.map((asset) => `${asset.countryId}:${asset.sectorType}`).sort().join(",")).toBe(PINNED_1953_ASSET_VECTOR);
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
      expect(asset.stateId).toBeNull();
      expect(asset.id).toBe(`corporate-sector:${asset.countryId}:${asset.sectorType}:${asset.corporationId}`);
      expect(world.unownedSectors[`${asset.countryId}:${asset.sectorType}`]).not.toBe(asset as never);
    }
  });

  it("is deterministic and survives the public save boundary", () => {
    const options = { era: "1953", countryId: "US", seed: "issue-293-save", playerName: "Alex" } as const;
    const world = createWorld(options);
    const assets = corporateSectorAssets(world);
    expect(corporateSectorAssets(createWorld(options))).toEqual(assets);
    const restored = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    expect(corporateSectorAssets(restored)).toEqual(assets);
  });

  it("rejects corrupted persisted identity and references", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "issue-293-corrupt", playerName: "Alex" });
    corporateSectorAssets(world);
    const raw = JSON.parse(serializeSave(world, "2026-09-15T00:00:00.000Z")) as any;
    const key = Object.keys(raw.world.corporateSectors)[0]!;
    const corruptions = [
      (save: any) => { save.world.corporateSectors[key].countryId = "UK"; },
      (save: any) => { save.world.corporateSectors[key].stateId = "UK-R1"; },
      (save: any) => { save.world.corporateSectors[`${key}-duplicate`] = { ...save.world.corporateSectors[key], id: `${key}-duplicate` }; },
      (save: any) => { save.world.corporateSectors.wrong = save.world.corporateSectors[key]; delete save.world.corporateSectors[key]; },
    ];
    for (const corrupt of corruptions) {
      const candidate = structuredClone(raw);
      corrupt(candidate);
      expect(() => deserializeSave(JSON.stringify(candidate))).toThrow(/Corporate sector|Duplicate corporate sector/);
    }
  });
});
