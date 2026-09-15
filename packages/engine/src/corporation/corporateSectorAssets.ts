import type { WorldState } from "../types.js";
import type { CorporationType } from "./types.js";

/**
 * Native's persisted asset identity port of AHDGame CorporateSector at
 * e364c04954ed628beef73a993a8e9e156650a31e, db/types/corporation.ts.
 * Native still has one aggregate corporation per country/industry. Until the
 * regional economy split lands, each aggregate explicitly retains national,
 * unallocated scope instead of inventing state ownership.
 */
export interface CorporateSectorAsset {
  id: string;
  corporationId: string;
  countryId: string;
  stateId: string | null;
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
  validateCorporateSectorAssets(world, { [asset.id]: asset });
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
  const assets: Record<string, CorporateSectorAsset> = {};
  for (const corporation of Object.values(world.corporations).sort((a, b) => a.id.localeCompare(b.id))) {
    const id = `corporate-sector:${corporation.countryId}:${corporation.sectorType}:${corporation.id}`;
    assets[id] = {
      id,
      corporationId: corporation.id,
      countryId: corporation.countryId,
      stateId: null,
      sectorType: corporation.sectorType,
      workers: 0,
      representingUnionId: null,
      forSale: null,
    };
  }
  validateCorporateSectorAssets(world, assets);
  return assets;
}

export function validateCorporateSectorAssets(
  world: WorldState,
  assets: Record<string, CorporateSectorAsset>,
): void {
  const tuples = new Set<string>();
  for (const [key, asset] of Object.entries(assets)) {
    if (key !== asset.id) throw new Error(`Corporate sector key does not match id: ${key}`);
    const corporation = world.corporations[asset.corporationId];
    if (!corporation || corporation.countryId !== asset.countryId || corporation.sectorType !== asset.sectorType) {
      throw new Error(`Corporate sector ${asset.id} has an invalid corporation reference`);
    }
    if (asset.stateId !== null && world.regions[asset.stateId]?.countryId !== asset.countryId) {
      throw new Error(`Corporate sector ${asset.id} has an invalid region reference`);
    }
    const tuple = `${asset.corporationId}\u0000${asset.countryId}\u0000${asset.stateId ?? "national"}\u0000${asset.sectorType}`;
    if (tuples.has(tuple)) throw new Error(`Duplicate corporate sector identity: ${asset.id}`);
    tuples.add(tuple);
  }
}

/** Lazy materialization preserves the serialized shape and hashes of untouched schema-44 worlds. */
export function corporateSectorAssets(world: WorldState): Record<string, CorporateSectorAsset> {
  const assets = world.corporateSectors ?? seedCorporateSectorAssets(world);
  validateCorporateSectorAssets(world, assets);
  world.corporateSectors = assets;
  return assets;
}
