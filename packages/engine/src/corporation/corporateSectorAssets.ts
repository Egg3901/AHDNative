import type { WorldState } from "../types.js";
import type { CorporationType } from "./types.js";

/**
 * Native's persisted asset identity port of AHDGame CorporateSector at
 * e364c04954ed628beef73a993a8e9e156650a31e, db/types/corporation.ts.
 * Native still has one aggregate corporation per country/industry. Until the
 * regional economy split lands, each aggregate explicitly retains national,
 * unallocated scope instead of inventing state ownership.
 */
/**
 * Sector owner. "corporation" is the #293 default: the recorded
 * `corporationId` operates and owns the sector. "player" records a #295
 * player acquisition: the buyer paid the listed asking price from personal
 * cash, the seller corporation was credited, the listing cleared, and the
 * recorded corporation keeps operating the sector (it remains the turn-math
 * SSOT — Native has one aggregate corporation per country/sector, so no
 * buyer corporation can receive the asset). Routing operating income to the
 * player owner (dividends/claims) is explicitly out of scope.
 */
export type CorporateSectorOwner = "corporation" | "player";

export interface CorporateSectorAsset {
  id: string;
  corporationId: string;
  countryId: string;
  stateId: string | null;
  sectorType: CorporationType;
  workers: number;
  representingUnionId: string | null;
  forSale: { priceAnchor: number } | null;
  owner: CorporateSectorOwner;
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
      owner: "corporation",
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
    // #294: the for-sale listing is persisted content, so a stored value that
    // is neither null nor a positive finite asking price fails closed here
    // (and therefore at the save boundary, which validates through this
    // function). Unknown extra fields are ignored for forward compatibility.
    validateSectorForSale(asset);
    validateSectorOwner(asset);
    const tuple = `${asset.corporationId}\u0000${asset.countryId}\u0000${asset.stateId ?? "national"}\u0000${asset.sectorType}`;
    if (tuples.has(tuple)) throw new Error(`Duplicate corporate sector identity: ${asset.id}`);
    tuples.add(tuple);
  }
}

/**
 * Strict for-sale content validation (#294). Null means unlisted; any listed
 * value must carry a positive finite asking price. A missing field, a
 * non-object, or a non-positive non-finite anchor is corruption, not a
 * defaultable absence — every seeded asset records the field explicitly.
 */
export function validateSectorForSale(asset: CorporateSectorAsset): void {
  const forSale = (asset as { forSale?: unknown }).forSale;
  if (forSale === null) return;
  if (typeof forSale !== "object" || forSale === null) {
    throw new Error(`Corporate sector ${asset.id} has an invalid for-sale listing`);
  }
  const priceAnchor = (forSale as { priceAnchor?: unknown }).priceAnchor;
  if (typeof priceAnchor !== "number" || !Number.isFinite(priceAnchor) || priceAnchor <= 0) {
    throw new Error(`Corporate sector ${asset.id} has an invalid for-sale price anchor`);
  }
}

/**
 * Strict ownership validation (#295). Every seeded asset records the field
 * explicitly; a missing or non-enum value is corruption, not a defaultable
 * absence. Saves written before #295 carry materialized assets without the
 * field — those are backfilled to "corporation" at the save boundary
 * (save.ts, same additive pattern as the campaign spend-stock backfill), so
 * this strict check only ever sees current-shape records.
 */
export function validateSectorOwner(asset: CorporateSectorAsset): void {
  const owner = (asset as { owner?: unknown }).owner;
  if (owner !== "corporation" && owner !== "player") {
    throw new Error(`Corporate sector ${asset.id} has an invalid owner`);
  }
}

/**
 * Backfill pre-#295 materialized assets that predate the owner field. Missing
 * degrades to the #293 default ("corporation"); a present but invalid value
 * is left for validateSectorOwner to fail closed on.
 */
export function backfillSectorOwner(assets: Record<string, CorporateSectorAsset>): void {
  for (const asset of Object.values(assets)) {
    if ((asset as { owner?: unknown }).owner === undefined) {
      asset.owner = "corporation";
    }
  }
}

/** Lazy materialization preserves the serialized shape and hashes of untouched schema-44 worlds. */
export function corporateSectorAssets(world: WorldState): Record<string, CorporateSectorAsset> {
  const assets = world.corporateSectors ?? seedCorporateSectorAssets(world);
  validateCorporateSectorAssets(world, assets);
  world.corporateSectors = assets;
  return assets;
}
