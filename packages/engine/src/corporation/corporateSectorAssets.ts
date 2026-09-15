import type { WorldState } from "../types.js";
import type { CorporationType } from "./types.js";

/**
 * Native's persisted asset identity port of AHDGame CorporateSector at
 * e364c04954ed628beef73a993a8e9e156650a31e, db/types/corporation.ts.
 * Native still has one aggregate corporation per country/industry. Until the
 * regional economy split lands, each aggregate is assigned deterministically
 * across its country's sorted region roster without splitting its turn math.
 */
export interface CorporateSectorAsset {
  id: string;
  corporationId: string;
  countryId: string;
  stateId: string;
  sectorType: CorporationType;
  workers: number;
  representingUnionId: string | null;
  forSale: { priceAnchor: number } | null;
}

export interface CorporateSectorProjection extends CorporateSectorAsset {
  revenue: number;
  profitMargin: number;
  targetGrowthRate: number;
  currentGrowthRate: number;
}

/** Live economic projection; Corporation remains the turn-math owner in this slice. */
export function projectCorporateSector(world: WorldState, asset: CorporateSectorAsset): CorporateSectorProjection {
  const corporation = world.corporations[asset.corporationId];
  if (!corporation || corporation.countryId !== asset.countryId || corporation.sectorType !== asset.sectorType) {
    throw new Error(`Corporate sector ${asset.id} has an invalid corporation reference`);
  }
  return {
    ...asset,
    revenue: corporation.revenue,
    profitMargin: corporation.profitMargin,
    targetGrowthRate: corporation.targetGrowthRate,
    currentGrowthRate: corporation.currentGrowthRate,
  };
}

export function seedCorporateSectorAssets(world: WorldState): Record<string, CorporateSectorAsset> {
  const regionsByCountry = new Map<string, string[]>();
  for (const region of Object.values(world.regions)) {
    const ids = regionsByCountry.get(region.countryId) ?? [];
    ids.push(region.id);
    regionsByCountry.set(region.countryId, ids);
  }
  for (const ids of regionsByCountry.values()) ids.sort();

  const assets: Record<string, CorporateSectorAsset> = {};
  const countryOffsets = new Map<string, number>();
  for (const corporation of Object.values(world.corporations).sort((a, b) => a.id.localeCompare(b.id))) {
    const regions = regionsByCountry.get(corporation.countryId);
    if (!regions?.length) throw new Error(`Cannot seed corporate sector without a region for ${corporation.countryId}`);
    const offset = countryOffsets.get(corporation.countryId) ?? 0;
    const stateId = regions[offset % regions.length]!;
    countryOffsets.set(corporation.countryId, offset + 1);
    const id = `corporate-sector:${corporation.id}:${stateId}`;
    assets[id] = {
      id,
      corporationId: corporation.id,
      countryId: corporation.countryId,
      stateId,
      sectorType: corporation.sectorType,
      workers: 0,
      representingUnionId: null,
      forSale: null,
    };
  }
  return assets;
}
