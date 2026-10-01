import type { WorldState } from "../types.js";
import { anchorToLocal, rateForLocalBalance } from "../forex/conversion.js";
import { getEraNominalScale } from "../commodity/constants.js";
import { calculateSectorWorkers, corporateSectorAssets, initialRepresentingUnionId, validateCorporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import type { CorporateSectorAsset } from "../corporation/corporateSectorAssets.js";
import { capacityPricePerUnitAnchor, corporateSectorBasePrices } from "../corporation/plantCapacity.js";

/** Mainline AHDGame corporations.ts SECTOR_EXPANSION_BASE_COST. */
export const SECTOR_EXPANSION_BASE_COST_ANCHOR = 100_000;
/** Source facilityQuantum.ts plantSizeUnits("extraction"). */
export const EXTRACTION_STARTER_UNITS = 250;
/** Source capacityEconomy.ts: 96 authored turns, halved for founding. */
export const EXTRACTION_STARTER_BUILD_TURNS = 48;
/** Source capacityEconomy.ts CAPACITY_FOUNDING_DISCOUNT. */
export const EXTRACTION_FOUNDING_BUILD_DISCOUNT = 0.1;

export type ExpandRegionalExtractionResult =
  | { ok: true; assetId: string; expansionCostAnchor: number; starterBuildAnchor: number; starterOnlineTurn: number }
  | { ok: false; error: string };

/**
 * Record a source-backed greenfield extraction operation. This is the
 * single-player counterpart to AHDGame's CEO-only expandSector command. The
 * company pays the era-adjusted entry fee and the discounted first-facility
 * order, which begins at zero capacity and delivers over the source founding
 * build window. Production uses the recorded regional deposit and the plant
 * state survives save and reload.
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

  const existingAssets = corporateSectorAssets(world);
  const existing = Object.values(existingAssets).some(
    (asset) => asset.corporationId === corporationId && asset.sectorType === "extraction" && asset.stateId === regionId,
  );
  if (existing) return { ok: false, error: `An extraction operation already exists in ${regionId}` };

  const expansionCostAnchor = Math.round(SECTOR_EXPANSION_BASE_COST_ANCHOR * getEraNominalScale(world.meta.era));
  const capacityPrice = capacityPricePerUnitAnchor("extraction", corporateSectorBasePrices(world));
  const year = Number(world.meta.date.slice(0, 4));
  // Current commodity base prices already carry Native's source era nominal
  // conversion. Game's capacity list adds its independently authored price
  // column (capacityEconomy.capacityEraPriceIndex) on top of that unit basis.
  const starterBuildAnchor = Math.round(
    EXTRACTION_STARTER_UNITS * capacityPrice * sourceCapacityEraPriceIndex(year) * sourceFoundingCostModifiers(world, corporationId, regionId, existingAssets) * EXTRACTION_FOUNDING_BUILD_DISCOUNT,
  );
  const starterOnlineTurn = world.meta.turn + EXTRACTION_STARTER_BUILD_TURNS;
  const totalCostAnchor = expansionCostAnchor + starterBuildAnchor;
  const totalCost = anchorToLocal(totalCostAnchor, rateForLocalBalance(world, corporation.countryId));
  if (corporation.liquidCapital < totalCost) {
    return { ok: false, error: `The corporation needs ${totalCost} in available capital to expand and build its first extraction facility` };
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
    workers: calculateSectorWorkers(1_000_000), // Source newborn facility workforce before realized first-turn receipts.
    revenue: 0,
    capitalStock: 0,
    capacityBookAnchor: 0,
    producedUnits: 0,
    soldUnits: 0,
    soldFraction: 0,
    realizedRevenue: 0,
    buildQueue: [{
      unitsOrdered: EXTRACTION_STARTER_UNITS,
      costPaidAnchor: starterBuildAnchor,
      startTurn: world.meta.turn,
      onlineTurn: starterOnlineTurn,
      smooth: true,
    }],
    constructionInProgressAnchor: starterBuildAnchor,
    plantsStartTurn: world.meta.turn,
    representingUnionId,
    unionization: Math.max(0, Math.min(100, unionization)),
    wageLevel: 1,
    workerExpectationIndex: null,
    strikeStartedAtTurn: null,
    strikeCooldownUntilTurn: null,
    forSale: null,
    owner: "corporation",
  };
  const assets = { ...existingAssets, [assetId]: asset };
  validateCorporateSectorAssets(world, assets);

  corporation.liquidCapital -= totalCost;
  world.corporateSectors = assets;
  return { ok: true, assetId, expansionCostAnchor, starterBuildAnchor, starterOnlineTurn };
}

/** Source Game capacityEconomy.ts capacityEraPriceIndex, including its modern row. */
export function sourceCapacityEraPriceIndex(year: number): number {
  if (!Number.isFinite(year)) return 5;
  if (year < 1971) return 1;
  if (year < 1979) return 1.4;
  if (year < 1991) return 2.6;
  if (year < 1999) return 3.6;
  return 5;
}

/** Game capacityEconomy.computeBuildCost modifiers available in Native state. */
function sourceFoundingCostModifiers(
  world: WorldState,
  corporationId: string,
  regionId: string,
  assets: Record<string, CorporateSectorAsset>,
): number {
  const corporation = world.corporations[corporationId]!;
  const cell = Object.values(assets).filter((asset) => asset.countryId === corporation.countryId && asset.sectorType === "extraction");
  const nationalIds = new Set(cell.map((asset) => asset.corporationId));
  nationalIds.add(corporationId);
  const revenueByCompany = new Map<string, number>();
  for (const id of nationalIds) {
    const rows = cell.filter((asset) => asset.corporationId === id && typeof asset.revenue === "number" && Number.isFinite(asset.revenue));
    const revenue = rows.length > 0
      ? rows.reduce((sum, asset) => sum + Math.max(0, asset.revenue ?? 0), 0)
      : Math.max(0, world.corporations[id]?.revenue ?? 0);
    revenueByCompany.set(id, revenue);
  }
  const nationalRevenue = [...revenueByCompany.values()].reduce((sum, revenue) => sum + revenue, 0);
  const nationalShare = nationalRevenue > 0 ? (revenueByCompany.get(corporationId) ?? 0) / nationalRevenue * 100 : 0;
  const regionalRows = cell.filter((asset) => asset.stateId === regionId);
  const regionalRevenue = regionalRows.reduce((sum, asset) => sum + Math.max(0, asset.revenue ?? 0), 0);
  const ownedRegionalRevenue = regionalRows.filter((asset) => asset.corporationId === corporationId)
    .reduce((sum, asset) => sum + Math.max(0, asset.revenue ?? 0), 0);
  const regionalShare = regionalRevenue > 0 ? ownedRegionalRevenue / regionalRevenue * 100 : 0;
  const rivals = new Set(regionalRows.map((asset) => asset.corporationId).filter((id) => id !== corporationId)).size;
  const localDominance = sourceDominanceMultiplier(regionalShare, 50);
  const nationalDominance = sourceDominanceMultiplier(nationalShare, 30);
  const density = 0.35 + 0.65 * Math.min(rivals, 4) / 4;
  const dominance = 1 + (Math.max(localDominance, nationalDominance) - 1) * density;

  const stats = world.player.stats as ({ businessAcumen?: number } | undefined);
  const acumen = Number.isFinite(stats?.businessAcumen) ? stats!.businessAcumen! : 5.5;
  const primeRate = world.centralBanks[corporation.countryId]?.primeRate ?? 0;
  const rate = Math.max(0.5, 1 + (primeRate / 10) * Math.max(0, 1 - (acumen - 5.5) * 0.06));
  const acumenDiscount = Math.max(0.5, 1 - (acumen - 5.5) * 0.03);
  const metric = world.regionalMetrics[regionId]?.["economic.costOfLiving"]?.value;
  const costOfLiving = Number.isFinite(metric) && metric! > 0 ? metric! : 100;
  const host = Math.max(0.6, Math.min(1.6, costOfLiving / 100));
  // Tech growth-cost effects default to 1 because Native has no corporation
  // tech-tree contract yet. Source markets without an unlocked tree use 1 too.
  return dominance * rate * acumenDiscount * host;
}

function sourceDominanceMultiplier(sharePercent: number, threshold: number): number {
  const share = Math.max(0, Math.min(100, sharePercent));
  if (share <= threshold) return 1;
  const t = (share - threshold) / (100 - threshold);
  return 1 + 2 * t * t;
}
