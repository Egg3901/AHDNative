import type { WorldState } from "../types.js";
import { anchorToLocal, rateForLocalBalance } from "../forex/conversion.js";
import { getEraNominalScale } from "../commodity/constants.js";
import { calculateSectorWorkers, initialRepresentingUnionId, validateCorporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import type { CorporateSectorAsset } from "../corporation/corporateSectorAssets.js";

/** Mainline AHDGame corporations.ts SECTOR_EXPANSION_BASE_COST. */
export const SECTOR_EXPANSION_BASE_COST_ANCHOR = 100_000;

export type ExpandRegionalExtractionResult =
  | { ok: true; assetId: string; expansionCostAnchor: number }
  | { ok: false; error: string };

/**
 * Record a source-backed greenfield extraction operation. This is the
 * single-player counterpart to AHDGame's CEO-only expandSector command: the
 * destination must be a represented region with a source resource deposit,
 * the country's extraction company must have a seated player CEO, and the
 * company pays the source land/permit entry fee. Native settlement then uses
 * the recorded operation and deposit for regional royalties/depletion.
 *
 * Native currently represents each industry's production ledger at national
 * scope; this operation record establishes the source-authored (company,
 * region, industry) eligibility tuple without duplicating national production.
 */
export function expandRegionalExtraction(
  world: WorldState,
  regionId: string,
): ExpandRegionalExtractionResult {
  const region = world.regions[regionId];
  if (!region) return { ok: false, error: `Unknown region ${regionId}` };
  const hasDeposit = Object.values(world.stateResourceCapacities[regionId]?.resources ?? {}).some(
    (capacity) => Number.isFinite(capacity) && capacity > 0,
  );
  if (!hasDeposit) return { ok: false, error: `No source extraction resource is recorded in ${regionId}` };

  const corporationId = `${region.countryId}-extraction`;
  const corporation = world.corporations[corporationId];
  if (!corporation || corporation.sectorType !== "extraction") {
    return { ok: false, error: `No extraction corporation operates in ${region.countryId}` };
  }
  if (corporation.ceoId !== "player" || corporation.ceoVacant === true) {
    return { ok: false, error: "Only the active extraction corporation CEO may expand operations" };
  }

  const existing = Object.values(world.corporateSectors ?? {}).some(
    (asset) => asset.corporationId === corporationId && asset.sectorType === "extraction" && asset.stateId === regionId,
  );
  if (existing) return { ok: false, error: `An extraction operation already exists in ${regionId}` };

  const expansionCostAnchor = Math.round(SECTOR_EXPANSION_BASE_COST_ANCHOR * getEraNominalScale(world.meta.era));
  const expansionCost = anchorToLocal(expansionCostAnchor, rateForLocalBalance(world, corporation.countryId));
  if (corporation.liquidCapital < expansionCost) {
    return { ok: false, error: `The corporation needs ${expansionCost} in available capital to expand` };
  }

  const assetId = `corporate-sector:${region.countryId}:extraction:${corporationId}:${regionId}`;
  const representingUnionId = initialRepresentingUnionId(world, region.countryId, "extraction");
  const unionization = representingUnionId ? world.unions[representingUnionId]?.unionization ?? 0 : 0;
  const asset: CorporateSectorAsset = {
    id: assetId,
    corporationId,
    countryId: region.countryId,
    stateId: regionId,
    sectorType: "extraction",
    workers: calculateSectorWorkers(1_000_000), // Game DEFAULT_SECTOR_STARTING_REVENUE at a neutral workforce skill.
    representingUnionId,
    unionization: Math.max(0, Math.min(100, unionization)),
    wageLevel: 1,
    workerExpectationIndex: null,
    strikeStartedAtTurn: null,
    strikeCooldownUntilTurn: null,
    forSale: null,
    owner: "corporation",
  };
  const assets = { ...(world.corporateSectors ?? {}), [assetId]: asset };
  validateCorporateSectorAssets(world, assets);

  corporation.liquidCapital -= expansionCost;
  world.corporateSectors = assets;
  return { ok: true, assetId, expansionCostAnchor };
}
