import { anchorToLocal, getRateForCountry } from "../forex/conversion.js";
import type { WorldState } from "../types.js";
import { capacityPricePerUnitAnchor, corporateSectorBasePrices, SOURCE_DEFAULT_OPERATING_SUPPLY } from "./plantCapacity.js";
import { makeNppCapacityCashRecord, makeNppFoundingCashRecord } from "./corporateCashLedger.js";
import { isCorpStateOwned } from "../bonds/corporateBonds.js";
import { localToAnchor } from "../forex/conversion.js";
import type { UnownedSectorState } from "../economy/types.js";
import type { Corporation } from "./types.js";
import type { CorporateSectorAsset } from "./corporateSectorAssets.js";
import { calculateSectorWorkers, corporateSectorAssets, initialRepresentingUnionId } from "./corporateSectorAssets.js";
import { SOURCE_STATE_ADJACENCY } from "./sourceStateAdjacency.js";
import { getEraNominalScale } from "../commodity/constants.js";
import { NEUTRAL_STAT } from "../stats/characterStats.js";
import { CEO_ARCHETYPE_MODIFIERS, DEFAULT_PROFIT_MARGIN } from "./constants.js";
import { COMMODITY_BASE_PRICES, EXTRACTABLE_RESOURCES } from "../commodity/constants.js";
import { getSectorStrategy } from "./plantCapacity.js";

// Current Game capacityEconomy.CAPACITY_BUILD_TURNS, non-founding orders.
const BUILD_TURNS: Record<string, number> = {
  energy: 96, extraction: 96, chemical_industries: 84, manufacturing: 72,
  automobiles: 72, defense: 72, telecommunications: 60, real_estate: 60,
  construction: 48, healthcare: 48, agriculture: 48, logistics: 36,
  entertainment: 24, media: 24, financial: 24, technology: 24, retail: 12,
};

const FOUNDING_STARTER_UNITS: Record<string, number> = {
  financial: 6, media: 80, manufacturing: 25, chemical_industries: 60,
  healthcare: 5, retail: 80, automobiles: 1, technology: 25, energy: 250,
  agriculture: 60, real_estate: 5, construction: 3, defense: 8,
  telecommunications: 12, entertainment: 50, logistics: 5, extraction: 250,
};
const NPP_FOUNDING_DEPLOY_FRACTION = 0.6;
const NPP_FOUNDING_HEADROOM_SHARE = 0.5;
const NPP_MAX_BUILD_UNITS_PER_ORDER = 10_000_000;
const NPP_EXTRACTION_FOUNDING_MAX_FACILITIES = 8;
const EXTRACTION_OUTPUT_SCALE: Partial<Record<(typeof EXTRACTABLE_RESOURCES)[number], number>> = {
  rare_earth: 2.5, natural_gas: 2, iron: 1.8, timber: 1.6, oil: 1.4,
};
const SOURCE_SPRAWL_SECTOR_THRESHOLD = 15;
const SOURCE_LOGISTICS_MAX_SPRAWL_EFFECT = 200;

/** Game getLogisticsSupportedSectorCount: source footprint limit for NPP entry. */
export function sourceLogisticsSupportedSectorCount(logisticsStrength: number | undefined): number {
  const strength = Number.isFinite(logisticsStrength) ? Math.max(0, logisticsStrength!) : 0;
  return Math.floor(SOURCE_SPRAWL_SECTOR_THRESHOLD * (1 + strength / SOURCE_LOGISTICS_MAX_SPRAWL_EFFECT));
}

/** Source computeBuildCost price for an existing NPP plant (not a founding). */
export function sourceNppCapacityBuildCostAnchor(
  world: WorldState,
  corp: Corporation,
  asset: CorporateSectorAsset,
  units: number,
  year: number,
): number {
  const assets = Object.values(corporateSectorAssets(world));
  const sectorAssets = assets.filter((row) => row.countryId === asset.countryId && row.sectorType === asset.sectorType && row.stateId !== null);
  const nationalRevenue = sectorAssets.reduce((sum, row) => sum + Math.max(0, row.revenue ?? row.realizedRevenue ?? 0), 0);
  const issuerRevenue = sectorAssets.filter((row) => row.corporationId === corp.id)
    .reduce((sum, row) => sum + Math.max(0, row.revenue ?? row.realizedRevenue ?? 0), 0);
  const nationalShare = nationalRevenue > 0 ? issuerRevenue / nationalRevenue * 100 : 0;
  const pool = asset.stateId
    ? Object.values(world.unownedSectors).find((row) => row.countryId === asset.countryId && row.regionId === asset.stateId && row.sectorType === asset.sectorType)
    : undefined;
  const headroom = pool ? sourceUnownedHeadroomUnits(world, pool) : 0;
  const capital = Math.max(0, asset.capitalStock ?? 0);
  const localShare = asset.stateId && capital + headroom > 0 ? capital / (capital + headroom) * 100 : 0;
  const rivals = asset.stateId
    ? new Set(assets.filter((row) => row.countryId === asset.countryId && row.stateId === asset.stateId && row.sectorType === asset.sectorType && row.corporationId !== corp.id).map((row) => row.corporationId)).size
    : undefined;
  const density = Number.isFinite(rivals)
    ? 0.35 + 0.65 * Math.min(4, rivals!) / 4
    : 1;
  const dominance = Math.max(sourceDominanceBuildMultiplier(localShare, 50), sourceDominanceBuildMultiplier(nationalShare, 30));
  const dominanceMultiplier = 1 + (dominance - 1) * density;
  const primeRate = world.centralBanks[asset.countryId]?.primeRate ?? 0;
  const rateMultiplier = Math.max(0.5, 1 + primeRate / 10);
  const costOfLiving = asset.stateId ? world.regionalMetrics[asset.stateId]?.["economic.costOfLiving"]?.value : undefined;
  const hostMultiplier = Number.isFinite(costOfLiving) && (costOfLiving ?? 0) > 0
    ? Math.min(1.6, Math.max(0.6, costOfLiving! / 100))
    : 1;
  const unitPrice = capacityPricePerUnitAnchor(asset.sectorType, corporateSectorBasePrices(world), asset.strategyId, year);
  // Current Game replacement call passes neutral NPP acumen, no research
  // discount, and `founding:false`, so investment rules apply the 0.8 expansion
  // multiplier. Keep each authored price leg explicit in this bridge.
  return units * unitPrice * dominanceMultiplier * rateMultiplier * hostMultiplier * 0.8;
}

function sourceDominanceBuildMultiplier(sharePct: number, threshold: number): number {
  const share = Math.max(0, Math.min(100, sharePct));
  if (share <= threshold) return 1;
  return 1 + 2 * ((share - threshold) / (100 - threshold)) ** 2;
}

/** Source NPP greenfield entry: source candidate → located newborn asset → pool draw and cash witness. */
export function applyNppSourceFounding(world: WorldState): void {
  const ledger = world.corporateCashLedger ?? (world.corporateCashLedger = []);
  const scale = getEraNominalScale(world.meta.era);
  const entryFeeBaseAnchor = Math.round(100_000 * scale);
  const assets = corporateSectorAssets(world);
  const year = Number(world.meta.date.slice(0, 4));
  for (const corp of Object.values(world.corporations).sort((a, b) => a.id.localeCompare(b.id))) {
    if (corp.suspended || isCorpStateOwned(corp) || (corp.ceoType ?? "npp") !== "npp") continue;
    const sectorCount = Object.values(assets).filter((asset) => asset.corporationId === corp.id).length;
    if (sectorCount >= sourceLogisticsSupportedSectorCount(corp.logisticsStrength)) continue;
    // Source has one greenfield entry per issuer per turn.
    if (ledger.some((row) => row.type === "corp_sector_founding" && row.corporationId === corp.id && row.turn === world.meta.turn)) continue;
    const candidate = findSourceNppEntryCandidate(world, corp);
    if (!candidate) continue;
    // Current-source entry evaluation allows critical shortages to bypass the
    // backward-looking margin gate; otherwise the issuer must meet its 15% floor.
    const expansionMarginFloor = 15 * (CEO_ARCHETYPE_MODIFIERS[corp.archetype]?.expansionMinMarginMult ?? 1);
    if (candidate.peakShortageScore < 1.6 && (corp.effectiveProfitMargin ?? corp.profitMargin) < expansionMarginFloor) continue;
    // Game's ordinary-entry glut gate uses the peak output ratio, not the
    // blended sector mean: one healthy output must not be hidden by a glut in
    // a co-product when the other leg still has buyers.
    if (candidate.peakShortageScore > 0 && candidate.peakShortageScore <= 0.85) continue;
    const starterUnits = FOUNDING_STARTER_UNITS[candidate.pool.sectorType] ?? 0;
    if (!(starterUnits > 0)) continue;
    const sectorType = candidate.pool.sectorType;
    // Game's autonomous NPP founding calls sectorEntryFeeAnchor without the
    // CEO-only expansion discount and quotes computeBuildCost with its default
    // tech multiplier (1). Research affects player-command founding/building,
    // but does not discount this NPP policy transaction.
    const entryFeeAnchor = entryFeeBaseAnchor;
    const cashFloorMult = CEO_ARCHETYPE_MODIFIERS[corp.archetype]?.cashFloorMult ?? 1;
    const eraMinimumFloor = Math.max(1, Math.round(125_000 * scale));
    const eraDefaultFloor = Math.max(1, Math.round(250_000 * scale));
    const cashFloorAnchor = Math.max(eraMinimumFloor, Math.round(eraDefaultFloor * cashFloorMult));
    const assetsForCost = Object.values(assets);
    const revenueByIssuer = new Map<string, number>();
    for (const issuer of Object.values(world.corporations).filter((row) => row.countryId === corp.countryId)) {
      const issuerAssets = assetsForCost.filter((asset) => asset.corporationId === issuer.id && asset.sectorType === sectorType);
      const locatedRows = issuerAssets.filter((asset) => asset.stateId !== null);
      const receipts = locatedRows.reduce((sum, asset) => sum + Math.max(0, asset.revenue ?? asset.realizedRevenue ?? 0), 0);
      revenueByIssuer.set(issuer.id, receipts);
    }
    const nationalOwned = [...revenueByIssuer.values()].reduce((sum, revenue) => sum + revenue, 0);
    // Source buildNppNationalShareResolver divides its actual regional sector
    // receipts by all actual owned receipts in that country/type. It excludes
    // unowned pool and Native's null-state aggregate projection rows.
    const nationalShare = nationalOwned > 0 ? (revenueByIssuer.get(corp.id) ?? 0) / nationalOwned * 100 : 0;
    const nationalDominance = nationalShare <= 30 ? 1 : 1 + 2 * ((nationalShare - 30) / 70) ** 2;
    // Game greenfield quotes explicitly set local share=0 and omit rival count;
    // computeBuildCost therefore applies the undiluted national dominance toll.
    const dominance = Math.max(1, nationalDominance);
    const primeRate = world.centralBanks[corp.countryId]?.primeRate ?? 0;
    const rateMultiplier = Math.max(0.5, 1 + (primeRate / 10) * Math.max(0, 1 - (NEUTRAL_STAT - 5.5) * 0.06));
    const acumenMultiplier = Math.max(0.5, 1 - (NEUTRAL_STAT - 5.5) * 0.03);
    const costOfLiving = world.regionalMetrics[candidate.pool.regionId]?.["economic.costOfLiving"]?.value;
    const hostMultiplier = Number.isFinite(costOfLiving) && (costOfLiving ?? 0) > 0 ? Math.min(1.6, Math.max(0.6, costOfLiving! / 100)) : 1;
    const price = capacityPricePerUnitAnchor(sectorType, corporateSectorBasePrices(world), null, year);
    const unitCostAnchor = price * dominance * rateMultiplier * acumenMultiplier * hostMultiplier * 0.9;
    const rate = getRateForCountry(world, corp.countryId);
    const cashLocal = corp.liquidCapital;
    const entryFeeLocal = anchorToLocal(entryFeeAnchor, rate);
    const deployableLocal = Math.max(0, (cashLocal - anchorToLocal(cashFloorAnchor, rate) - entryFeeLocal) * NPP_FOUNDING_DEPLOY_FRACTION);
    const affordableUnits = unitCostAnchor > 0 ? Math.floor(deployableLocal / (unitCostAnchor * rate)) : 0;
    const maxByMarket = sectorType === "extraction"
      ? starterUnits * NPP_EXTRACTION_FOUNDING_MAX_FACILITIES
      : candidate.headroomUnits * NPP_FOUNDING_HEADROOM_SHARE;
    // Source floors the affordable size at one facility quantum, then rejects
    // if that forced starter exceeds market headroom or the source cash floor.
    const units = Math.max(starterUnits, Math.floor(Math.min(maxByMarket, affordableUnits, NPP_MAX_BUILD_UNITS_PER_ORDER)));
    if (!(units > 0) || units > maxByMarket || !Number.isFinite(units)) continue;
    const buildAnchor = unitCostAnchor * units;
    const totalAnchor = entryFeeAnchor + buildAnchor;
    const totalLocal = anchorToLocal(totalAnchor, rate);
    const cashAfter = cashLocal - totalLocal;
    if (!(totalLocal > 0 && cashAfter >= anchorToLocal(cashFloorAnchor, rate) && cashAfter < cashLocal)) continue;

    const regionId = candidate.pool.regionId;
    const id = `corporate-sector:${corp.countryId}:${candidate.pool.sectorType}:${corp.id}:${regionId}`;
    if (assets[id]) continue;
    const onlineTurn = world.meta.turn + Math.max(1, Math.floor((BUILD_TURNS[candidate.pool.sectorType] ?? 48) / 2));
    const asset: CorporateSectorAsset = {
      id, corporationId: corp.id, countryId: corp.countryId, stateId: regionId,
      sectorType: candidate.pool.sectorType,
      profitMargin: DEFAULT_PROFIT_MARGIN,
      revenue: sectorType === "extraction" ? 0 : Math.round(candidate.pool.revenue * (units / candidate.headroomUnits)),
      capitalStock: 0, capacityBookAnchor: 0, workers: calculateSectorWorkers(anchorToLocal(1_000_000, rate)),
      buildQueue: [{ unitsOrdered: units, costPaidAnchor: buildAnchor, startTurn: world.meta.turn, onlineTurn, smooth: true }],
      constructionInProgressAnchor: buildAnchor, plantsStartTurn: world.meta.turn,
      producedUnits: 0, soldUnits: 0, soldFraction: 0, realizedRevenue: 0,
      representingUnionId: initialRepresentingUnionId(world, corp.countryId, candidate.pool.sectorType),
      unionization: 0, wageLevel: 1, workerExpectationIndex: null,
      strikeStartedAtTurn: null, strikeCooldownUntilTurn: null,
      forSale: null, owner: "corporation",
    };
    const before = corp.liquidCapital;
    assets[id] = asset;
    if (sectorType !== "extraction") {
      const unitsPerAnchor = candidate.headroomUnits / localToAnchor(candidate.pool.revenue, rate);
      const remainingAnchor = Math.max(0, candidate.headroomUnits - units);
      candidate.pool.revenue = Math.round((remainingAnchor / unitsPerAnchor) * rate);
    }
    corp.liquidCapital = cashAfter;
    const row = makeNppFoundingCashRecord({ corp, world, sector: asset, units, costLocal: totalLocal, cashDeltaLocal: cashAfter - before, costAnchor: buildAnchor, entryFeeAnchor, onlineTurn });
    if (row) ledger.push(row);
  }
}

/** Game market.unownedHeadroomUnits: source standard-mix implied units. */
export function sourceUnownedHeadroomUnits(world: WorldState, pool: UnownedSectorState): number {
  if (!(Number.isFinite(pool.revenue) && pool.revenue > 0)) return 0;
  const revenueAnchor = localToAnchor(pool.revenue, getRateForCountry(world, pool.countryId));
  // Use Native's authored default strategy mix for the unowned market. Its
  // base-price table is already era-adjusted, algebraically equal to Game's
  // modern COMMODITY_BASE_PRICES multiplied by eraUnitScale in impliedOutputUnits.
  const prices = corporateSectorBasePrices(world);
  const defaultSupply = SOURCE_DEFAULT_OPERATING_SUPPLY[pool.sectorType];
  let unitsPerAnchor = 0;
  for (const [commodity, rate] of Object.entries(defaultSupply)) {
    const price = prices[commodity as keyof typeof prices];
    if ((rate ?? 0) > 0 && Number.isFinite(price) && (price ?? 0) > 0) unitsPerAnchor += rate! / price!;
  }
  return Number.isFinite(unitsPerAnchor * revenueAnchor) ? unitsPerAnchor * revenueAnchor : 0;
}

/** Game expansionFrontierStates over actual Native asset/HQ geography. */
export function sourceExpansionFrontierStates(
  corp: Pick<Corporation, "countryId" | "headquartersRegionId">,
  assets: readonly Pick<CorporateSectorAsset, "countryId" | "stateId">[],
): Set<string> {
  const occupied = new Set(assets.filter((asset) => asset.countryId === corp.countryId && asset.stateId).map((asset) => asset.stateId!));
  const origins = occupied.size > 0 ? occupied : new Set(corp.headquartersRegionId ? [corp.headquartersRegionId] : []);
  const adjacency = SOURCE_STATE_ADJACENCY as Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;
  const frontier = new Set<string>();
  for (const origin of origins) {
    for (const adjacent of adjacency[corp.countryId]?.[origin] ?? []) {
      if (!occupied.has(adjacent)) frontier.add(adjacent);
    }
  }
  return frontier;
}

export interface SourceNppEntryCandidate {
  pool: UnownedSectorState & { regionId: string };
  headroomUnits: number;
  extractionHeadroom: number | null;
  shortageScore: number;
  peakShortageScore: number;
  rankScore: number;
}

/** Game findBestUnownedSector's location/headroom/shortage/type-cascade core. */
export function findSourceNppEntryCandidate(world: WorldState, corp: Corporation): SourceNppEntryCandidate | null {
  const assets = Object.values(corporateSectorAssets(world));
  const extractionHeadroomByRegion = sourceExtractionHeadroomByRegion(world);
  const ownedByCorp = assets.filter((asset) => asset.corporationId === corp.id);
  const occupied = new Set(ownedByCorp.filter((asset) => asset.stateId).map((asset) => `${asset.stateId}:${asset.sectorType}`));
  const stateControlled = new Set(assets.filter((asset) => {
    const owner = world.corporations[asset.corporationId];
    return Boolean(owner && isCorpStateOwned(owner) && asset.stateId);
  }).map((asset) => `${asset.stateId}:${asset.sectorType}`));
  const candidates: SourceNppEntryCandidate[] = [];
  for (const pool of Object.values(world.unownedSectors)) {
    const regionId = pool.regionId;
    if (pool.countryId !== corp.countryId || !regionId || occupied.has(`${regionId}:${pool.sectorType}`) || stateControlled.has(`${regionId}:${pool.sectorType}`)) continue;
    const region = world.regions[regionId];
    // Aggregate country pools have no locational basis. HQ-only projection
    // rows are residence facts, not markets; neither can be founded into.
    if (!region || region.countryId !== corp.countryId || region.corporationHeadquartersOnly) continue;
    const extractionHeadroom = pool.sectorType === "extraction"
      ? extractionHeadroomByRegion.get(regionId) ?? (world.stateResourceCapacities[regionId] ? 0 : 1)
      : null;
    const headroomUnits = pool.sectorType === "extraction"
      ? (FOUNDING_STARTER_UNITS.extraction ?? 250) * NPP_EXTRACTION_FOUNDING_MAX_FACILITIES
      : sourceUnownedHeadroomUnits(world, pool);
    const marketSize = extractionHeadroom ?? headroomUnits;
    if (!(marketSize > 0)) continue;
    const supply = SOURCE_DEFAULT_OPERATING_SUPPLY[pool.sectorType];
    let weighted = 0;
    let totalWeight = 0;
    let peak = 0;
    for (const [commodity, rate] of Object.entries(supply)) {
      const row = world.commodityPrices[commodity as keyof typeof world.commodityPrices];
      if (!(rate! > 0) || !row || !(row.basePrice > 0) || !Number.isFinite(row.globalPrice / row.basePrice)) continue;
      const ratio = row.globalPrice / row.basePrice;
      weighted += rate! * ratio;
      totalWeight += rate!;
      peak = Math.max(peak, ratio);
    }
    const shortageScore = totalWeight > 0 ? weighted / totalWeight : 1;
    const rankScore = marketSize * shortageScore * (regionId === corp.headquartersRegionId ? 1.3 : 1);
    candidates.push({ pool: pool as UnownedSectorState & { regionId: string }, headroomUnits, extractionHeadroom, shortageScore, peakShortageScore: peak, rankScore });
  }
  if (candidates.length === 0) return null;
  const frontier = sourceExpansionFrontierStates(corp, ownedByCorp);
  const frontierCandidates = frontier.size > 0 ? candidates.filter((candidate) => frontier.has(candidate.pool.regionId)) : [];
  const search = frontierCandidates.length > 0 ? frontierCandidates : candidates;
  const critical = search.filter((candidate) => candidate.peakShortageScore >= 1.6);
  const primary = critical.length > 0 ? critical : search.filter((candidate) => candidate.pool.sectorType === corp.sectorType);
  const secondary = primary.length > 0 || !corp.secondarySectorType
    ? []
    : search.filter((candidate) => candidate.pool.sectorType === corp.secondarySectorType);
  return [...(primary.length > 0 ? primary : secondary.length > 0 ? secondary : search)]
    .sort((a, b) => b.rankScore - a.rankScore || a.pool.regionId.localeCompare(b.pool.regionId) || a.pool.sectorType.localeCompare(b.pool.sectorType))[0] ?? null;
}

/** Game computeExtractionHeadroomByState over Native's saved regional deposit records. */
export function sourceExtractionHeadroomByRegion(world: WorldState): Map<string, number> {
  const assets = Object.values(corporateSectorAssets(world)).filter((asset) => asset.sectorType === "extraction" && asset.stateId);
  const desiredByRegion = new Map<string, Partial<Record<(typeof EXTRACTABLE_RESOURCES)[number], number>>>();
  const prices = corporateSectorBasePrices(world);
  for (const asset of assets) {
    const strategy = getSectorStrategy("extraction", asset.strategyId);
    const desired = desiredByRegion.get(asset.stateId!) ?? {};
    const revenueAnchor = localToAnchor(Math.max(0, asset.revenue ?? asset.realizedRevenue ?? 0), getRateForCountry(world, asset.countryId));
    for (const resource of EXTRACTABLE_RESOURCES) {
      const supplyRate = strategy.supply[resource] ?? 0;
      const price = prices[resource];
      if (!(supplyRate > 0) || !(price && price > 0)) continue;
      const units = revenueAnchor * supplyRate * (EXTRACTION_OUTPUT_SCALE[resource] ?? 1) / price;
      desired[resource] = (desired[resource] ?? 0) + units;
    }
    desiredByRegion.set(asset.stateId!, desired);
  }
  const headroomByRegion = new Map<string, number>();
  for (const [regionId, capacity] of Object.entries(world.stateResourceCapacities)) {
    let depositValue = 0;
    let headroomValue = 0;
    const desired = desiredByRegion.get(regionId) ?? {};
    for (const resource of EXTRACTABLE_RESOURCES) {
      const amount = capacity.resources?.[resource] ?? 0;
      if (!(amount > 0)) continue;
      const basePrice = COMMODITY_BASE_PRICES[resource] ?? 1;
      depositValue += amount * basePrice;
      headroomValue += Math.max(0, amount - (desired[resource] ?? 0)) * basePrice;
    }
    headroomByRegion.set(regionId, depositValue > 0 ? headroomValue / depositValue : 0);
  }
  return headroomByRegion;
}

/** Source NPP physical replacement leg. Growth/founding use separate pool and pricing inputs. */
export function applyNppCapacityReplacement(world: WorldState): void {
  const year = Number(world.meta.date.slice(0, 4));
  const prices = corporateSectorBasePrices(world);
  for (const asset of Object.values(corporateSectorAssets(world)).sort((a, b) => a.id.localeCompare(b.id))) {
    const corp = world.corporations[asset.corporationId];
    if (!corp || corp.suspended || isCorpStateOwned(corp) || (corp.ceoType ?? "npp") !== "npp") continue;
    const capitalStock = asset.capitalStock ?? 0;
    const produced = asset.producedUnits ?? 0;
    const sold = asset.soldUnits ?? 0;
    const fill = produced > 0 ? sold / produced : 0;
    const queue = asset.buildQueue ?? [];
    if (!(capitalStock > 0) || !(produced > 0) || fill < 0.85 || queue.length >= 20) continue;
    // Game suppresses replacement when two or more orders are already active.
    if (queue.length >= 2) continue;
    const productionCapacity = capitalStock;
    const utilization = productionCapacity > 0 ? Math.min(1, Math.max(0, produced / productionCapacity)) : 0;
    const runUnits = capitalStock * utilization;
    const buildCycle = BUILD_TURNS[asset.sectorType] ?? 48;
    const lastOrderTurn = queue.reduce((latest, order) => Math.max(latest, order.startTurn), Number.NEGATIVE_INFINITY);
    const accrualTurns = Number.isFinite(lastOrderTurn) ? Math.min(buildCycle, Math.max(0, world.meta.turn - lastOrderTurn)) : 1;
    const fillScale = 0.5 + 0.5 * Math.min(1, Math.max(0, (fill - 0.85) / 0.15));
    const units = runUnits * 0.0005 * accrualTurns * fillScale;
    if (!(units > 0)) continue;

    const costAnchor = sourceNppCapacityBuildCostAnchor(world, corp, asset, units, year);
    const costLocal = anchorToLocal(costAnchor, getRateForCountry(world, corp.countryId));
    const cashLocal = Math.max(0, corp.liquidCapital);
    // Source replacement rail: <=25% of current cash and a strictly positive remainder.
    if (!(costLocal > 0) || costLocal > cashLocal * 0.25 || cashLocal - costLocal <= 0) continue;
    const cashBefore = corp.liquidCapital;
    const cashAfter = cashBefore - costLocal;
    if (!(cashAfter < cashBefore)) continue;
    const onlineTurn = world.meta.turn + Math.max(1, buildCycle);
    const order = { unitsOrdered: units, costPaidAnchor: costAnchor, startTurn: world.meta.turn, onlineTurn, smooth: true };

    // Apply the physical queue, CIP, cash debit, and witness as one synchronous
    // world mutation; the ledger is emitted only for the cash write that landed.
    asset.buildQueue = [...queue, order];
    asset.constructionInProgressAnchor = (asset.constructionInProgressAnchor ?? 0) + Math.round(costAnchor);
    corp.liquidCapital = cashAfter;
    const row = makeNppCapacityCashRecord({ corp, world, sector: asset, units, costLocal, cashDeltaLocal: cashAfter - cashBefore, costAnchor, onlineTurn });
    if (row) (world.corporateCashLedger ??= []).push(row);
  }
}
