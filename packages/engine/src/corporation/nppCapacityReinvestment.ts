import { anchorToLocal, getRateForCountry } from "../forex/conversion.js";
import type { WorldState } from "../types.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import { capacityPricePerUnitAnchor, corporateSectorBasePrices, SOURCE_DEFAULT_OPERATING_SUPPLY } from "./plantCapacity.js";
import { makeNppCapacityCashRecord } from "./corporateCashLedger.js";
import { isCorpStateOwned } from "../bonds/corporateBonds.js";
import { localToAnchor } from "../forex/conversion.js";
import type { UnownedSectorState } from "../economy/types.js";
import type { Corporation } from "./types.js";
import type { CorporateSectorAsset } from "./corporateSectorAssets.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import { SOURCE_STATE_ADJACENCY } from "./sourceStateAdjacency.js";

// Current Game capacityEconomy.CAPACITY_BUILD_TURNS, non-founding orders.
const BUILD_TURNS: Record<string, number> = {
  energy: 96, extraction: 96, chemical_industries: 84, manufacturing: 72,
  automobiles: 72, defense: 72, telecommunications: 60, real_estate: 60,
  construction: 48, healthcare: 48, agriculture: 48, logistics: 36,
  entertainment: 24, media: 24, financial: 24, technology: 24, retail: 12,
};

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
  shortageScore: number;
  peakShortageScore: number;
  rankScore: number;
}

/** Game findBestUnownedSector's location/headroom/shortage/type-cascade core. */
export function findSourceNppEntryCandidate(world: WorldState, corp: Corporation): SourceNppEntryCandidate | null {
  const assets = Object.values(corporateSectorAssets(world));
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
    // Game uses deposit headroom instead of demand for extraction. Native has
    // not yet ported its exact NPP extraction opportunity adapter; do not
    // invent a deposit score from demand-side pool revenue.
    if (pool.sectorType === "extraction") continue;
    const headroomUnits = sourceUnownedHeadroomUnits(world, pool);
    if (!(headroomUnits > 0)) continue;
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
    const rankScore = headroomUnits * shortageScore * (regionId === corp.headquartersRegionId ? 1.3 : 1);
    candidates.push({ pool: { ...pool, regionId }, headroomUnits, shortageScore, peakShortageScore: peak, rankScore });
  }
  if (candidates.length === 0) return null;
  const frontier = sourceExpansionFrontierStates(corp, ownedByCorp);
  const frontierCandidates = frontier.size > 0 ? candidates.filter((candidate) => frontier.has(candidate.pool.regionId)) : [];
  const search = frontierCandidates.length > 0 ? frontierCandidates : candidates;
  const critical = search.filter((candidate) => candidate.peakShortageScore >= 1.6);
  const primary = critical.length > 0 ? critical : search.filter((candidate) => candidate.pool.sectorType === corp.sectorType);
  return [...(primary.length > 0 ? primary : search)].sort((a, b) => b.rankScore - a.rankScore || a.pool.regionId.localeCompare(b.pool.regionId) || a.pool.sectorType.localeCompare(b.pool.sectorType))[0] ?? null;
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

    // Game's full computeBuildCost adds market dominance, prime-rate/acumen,
    // tech, and host cost-of-living legs. Native does not yet persist all those
    // source inputs, so this producer is restricted to its source list-price
    // basis and keeps those omitted price legs explicit for parity work.
    const unitPriceAnchor = capacityPricePerUnitAnchor(asset.sectorType, prices, asset.strategyId, year);
    const costAnchor = units * unitPriceAnchor;
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
