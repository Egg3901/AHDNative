import { anchorToLocal, getRateForCountry } from "../forex/conversion.js";
import type { WorldState } from "../types.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import { capacityPricePerUnitAnchor, corporateSectorBasePrices, SOURCE_DEFAULT_OPERATING_SUPPLY } from "./plantCapacity.js";
import { makeNppCapacityCashRecord } from "./corporateCashLedger.js";
import { isCorpStateOwned } from "../bonds/corporateBonds.js";
import { localToAnchor } from "../forex/conversion.js";
import type { UnownedSectorState } from "../economy/types.js";

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
