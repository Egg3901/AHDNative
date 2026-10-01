/** Plants-tier production, lagged market clearing, and realized revenue. */
import type { TurnPhase } from "../phases/types.js";
import { getRateForCountry } from "../forex/conversion.js";
import { DAYS_PER_TURN } from "../calendar.js";
import { corporateSectorAssets, calculateSectorWorkers } from "./corporateSectorAssets.js";
import {
  advancePlantCapitalTurn,
  capacityPricePerUnitAnchor,
  corporateSectorBasePrices,
  DEFAULT_SECTOR_OUTPUT_MIX,
} from "./plantCapacity.js";
import type { CommodityType } from "../commodity/constants.js";
import type { WorldState } from "../types.js";
import type { CorporateSectorAsset } from "./corporateSectorAssets.js";
import { CORPORATE_PLANT_MARKET_STABILIZER, rebuildCorporatePlantInputDemand } from "./plantDemand.js";

const PRICE_REALIZATION_EXPONENT = 0.5;
const PRICE_REALIZATION_MIN = 0.7;
const PRICE_REALIZATION_MAX = 1.5;
const DEMAND_PROBE_MARGIN = 0.15;
const DEMAND_THROTTLE_FLOOR = 0.1;

interface PlantOffer {
  assetId: string;
  corporationId: string;
  commodity: CommodityType;
  units: number;
  rate: number;
  posture: number;
}

interface PlantSeller {
  asset: CorporateSectorAsset;
  productionCapacity: number;
  outputFactor: number;
  mixPriceAnchor: number;
  supplyRates: Partial<Record<CommodityType, number>>;
  mixWeights: Partial<Record<CommodityType, number>>;
}

/** One plants production and sale pass; useful for the public turn and replay tests. */
export function runCorporatePlantProductionTurn(
  world: WorldState,
  outputFactorByCorporation: ReadonlyMap<string, number> = new Map(),
): void {
  const assets = corporateSectorAssets(world);
  const basePrices = corporateSectorBasePrices(world);
  rebuildCorporatePlantInputDemand(world);

  const sellers: PlantSeller[] = [];
  const offersByCommodity = new Map<CommodityType, PlantOffer[]>();
  const currentSupplyByCommodity = new Map<CommodityType, number>();
  const sectorPosture = new Map<string, number>();

  for (const asset of Object.values(assets).sort((a, b) => a.id.localeCompare(b.id))) {
    const corporation = world.corporations[asset.corporationId];
    if (!corporation || corporation.suspended === true) continue;

    const capacityBefore = asset.capitalStock ?? 0;
    const listPrice = capacityPricePerUnitAnchor(asset.sectorType, basePrices);
    const capital = advancePlantCapitalTurn({
      capitalStock: capacityBefore,
      capacityBookAnchor: asset.capacityBookAnchor,
      landedCreditAnchor: 0,
      capacityPricePerUnitAnchor: listPrice,
    });
    const rates = DEFAULT_SECTOR_OUTPUT_MIX[asset.sectorType] ?? {};
    let rawYield = 0;
    for (const [rawCommodity, rate] of Object.entries(rates)) {
      const base = basePrices[rawCommodity as CommodityType];
      if ((rate ?? 0) > 0 && Number.isFinite(base) && base! > 0) rawYield += (rate ?? 0) / base!;
    }
    const mixPriceAnchor = rawYield > 0 ? 1 / rawYield : 0;
    const mixWeights: Partial<Record<CommodityType, number>> = {};
    if (rawYield > 0) {
      for (const [rawCommodity, rate] of Object.entries(rates)) {
        const commodity = rawCommodity as CommodityType;
        const base = basePrices[commodity];
        if ((rate ?? 0) > 0 && Number.isFinite(base) && base! > 0) {
          mixWeights[commodity] = (rate ?? 0) / base! / rawYield;
        }
      }
    }
    const requestedFactor = outputFactorByCorporation.get(corporation.id) ?? 1;
    const labourOutputFactor = Number.isFinite(requestedFactor) ? Math.max(0, Math.min(1, requestedFactor)) : 1;
    const productionCapacity = capital.capitalStock;
    const plannedUnits = productionCapacity * labourOutputFactor;
    const strategyPrices = world.commodityPrices;
    const priorSoldUnits = throttleSoldUnits(asset, rates, (commodity) => {
      const row = strategyPrices[commodity];
      return row && row.basePrice > 0 ? row.globalPrice / row.basePrice : 1;
    });
    const demandFactor = demandThrottleFactor(plannedUnits, priorSoldUnits, asset.producedUnits);
    const outputFactor = labourOutputFactor * demandFactor;
    const producedUnits = productionCapacity * outputFactor;
    const seller: PlantSeller = {
      asset,
      productionCapacity,
      outputFactor,
      mixPriceAnchor,
      supplyRates: rates,
      mixWeights,
    };
    sellers.push(seller);

    for (const [rawCommodity, weight] of Object.entries(mixWeights)) {
      const commodity = rawCommodity as CommodityType;
      const units = producedUnits * (weight ?? 0);
      if (!(units > 0) || !Number.isFinite(units)) continue;
      const balance = world.commodityPrices[commodity];
      const sourceSupply = Number.isFinite(balance?.globalSupply) ? Math.max(0, balance!.globalSupply) : 0;
      const demand = Number.isFinite(balance?.globalDemand) ? Math.max(0, balance!.globalDemand) : 0;
      const posture = postureFor(asset, demand, sourceSupply);
      sectorPosture.set(asset.id, posture);
      const offer: PlantOffer = { assetId: asset.id, corporationId: corporation.id, commodity, units, rate: rates[commodity] ?? 0, posture };
      offersByCommodity.set(commodity, [...(offersByCommodity.get(commodity) ?? []), offer]);
      currentSupplyByCommodity.set(commodity, (currentSupplyByCommodity.get(commodity) ?? 0) + units);
    }

    // Source plants-capacity order: the recorded plant stock and paid basis
    // depreciate by the same factor before this turn's financial calculations.
    asset.capitalStock = capital.capitalStock;
    asset.capacityBookAnchor = capital.capacityBookAnchor;
    asset.producedUnits = producedUnits;
    asset.soldUnits = 0;
    asset.soldFraction = 0;
    asset.realizedRevenue = 0;
  }

  const soldByAssetCommodity = new Map<string, Map<CommodityType, number>>();
  for (const [commodity, offers] of offersByCommodity) {
    const row = world.commodityPrices[commodity];
    const totalOffered = offers.reduce((sum, offer) => sum + offer.units, 0);
    const laggedSupply = Number.isFinite(row?.globalSupply) ? Math.max(0, row!.globalSupply) : 0;
    const demand = Number.isFinite(row?.globalDemand) ? Math.max(0, row!.globalDemand) : 0;
    const allocationShare = Math.max(laggedSupply, totalOffered) > 0
      ? totalOffered / Math.max(laggedSupply, totalOffered)
      : 1;
    let remainingDemand = demand * allocationShare;
    const filled = new Map<string, number>(offers.map((offer) => [offer.assetId, 0]));
    const byPosture = new Map<number, PlantOffer[]>();
    for (const offer of offers) byPosture.set(offer.posture, [...(byPosture.get(offer.posture) ?? []), offer]);
    for (const posture of [...byPosture.keys()].sort((a, b) => a - b)) {
      const group = byPosture.get(posture)!;
      const groupUnits = group.reduce((sum, offer) => sum + offer.units, 0);
      const fillFraction = groupUnits > 0 ? Math.min(1, remainingDemand / groupUnits) : 0;
      for (const offer of group) filled.set(offer.assetId, (filled.get(offer.assetId) ?? 0) + offer.units * fillFraction);
      remainingDemand = Math.max(0, remainingDemand - groupUnits * fillFraction);
    }
    for (const offer of offers) {
      const fraction = offer.units > 0 ? Math.min(1, (filled.get(offer.assetId) ?? 0) / offer.units) : 0;
      const byCommodity = soldByAssetCommodity.get(offer.assetId) ?? new Map<CommodityType, number>();
      byCommodity.set(commodity, fraction);
      soldByAssetCommodity.set(offer.assetId, byCommodity);
    }
  }

  for (const seller of sellers) {
    const { asset, supplyRates, mixPriceAnchor, productionCapacity, outputFactor } = seller;
    const corporation = world.corporations[asset.corporationId];
    if (!corporation) continue;
    const byCommodity = soldByAssetCommodity.get(asset.id) ?? new Map<CommodityType, number>();
    const posture = sectorPosture.get(asset.id) ?? 0;
    let rateTotal = 0;
    let factorTotal = 0;
    let soldTotal = 0;
    const soldByCommodity: Partial<Record<CommodityType, number>> = {};
    for (const [rawCommodity, rawRate] of Object.entries(supplyRates)) {
      const commodity = rawCommodity as CommodityType;
      const rate = rawRate ?? 0;
      if (!(rate > 0)) continue;
      const sold = byCommodity.get(commodity) ?? 1;
      const row = world.commodityPrices[commodity];
      const ratio = row && row.basePrice > 0 ? row.globalPrice / row.basePrice : 1;
      const realization = priceRealizationFactor(ratio);
      rateTotal += rate;
      factorTotal += rate * sold * (1 + posture) * realization;
      soldTotal += rate * sold;
      soldByCommodity[commodity] = sold;
    }
    const factor = rateTotal > 0 ? factorTotal / rateTotal : 0;
    const soldFraction = rateTotal > 0 ? soldTotal / rateTotal : 0;
    const soldUnits = productionCapacity * outputFactor * soldFraction;
    const revenueAnchorPerDay = productionCapacity * outputFactor * mixPriceAnchor * factor;
    const localPerAnchor = getRateForCountry(world, asset.countryId);
    const realizedRevenue = Number.isFinite(revenueAnchorPerDay * localPerAnchor * DAYS_PER_TURN)
      ? Math.max(0, revenueAnchorPerDay * localPerAnchor * DAYS_PER_TURN)
      : 0;

    asset.soldUnits = soldUnits;
    asset.soldFraction = soldFraction;
    asset.realizedRevenue = realizedRevenue;
    asset.soldByCommodity = soldByCommodity;
    asset.workers = calculateSectorWorkers(realizedRevenue, null);
    corporation.revenue = realizedRevenue;
  }

  // The next turn and price phase read the measured physical output, never
  // revenue-derived nameplate units. This is the source lagged-supply contract.
  world.plantMarketDemand!.corporateOutputSupply = Object.fromEntries(currentSupplyByCommodity);
  for (const [commodity, row] of Object.entries(world.commodityPrices)) {
    const key = commodity as CommodityType;
    const externalSupply = world.plantMarketDemand!.externalSupply?.[key]
      ?? CORPORATE_PLANT_MARKET_STABILIZER[key]
      ?? 50_000;
    const productionSupply = currentSupplyByCommodity.get(key) ?? 0;
    row.globalSupply = externalSupply + productionSupply;
  }
}

export const corporatePlantProductionPhase: TurnPhase = {
  name: "corporatePlantProduction",
  run(world) {
    runCorporatePlantProductionTurn(world);
  },
};

function postureFor(asset: CorporateSectorAsset, demand: number, supply: number): number {
  const lastSold = asset.soldFraction;
  if (typeof lastSold === "number" && Number.isFinite(lastSold)) {
    if (lastSold < 0.35) return -0.1;
    if (lastSold < 0.7) return Math.min(0, balancePosture(demand, supply));
  }
  return balancePosture(demand, supply);
}

function balancePosture(demand: number, supply: number): number {
  if (!(supply > 0) || !(demand > 0)) return 0;
  const ratio = demand / supply;
  if (ratio > 1.2) return 0.1;
  if (ratio < 0.8) return -0.1;
  return 0;
}

function priceRealizationFactor(priceRatio: number): number {
  const safeRatio = Number.isFinite(priceRatio) && priceRatio > 0 ? priceRatio : 1;
  return Math.min(
    PRICE_REALIZATION_MAX,
    Math.max(PRICE_REALIZATION_MIN, Math.pow(safeRatio, PRICE_REALIZATION_EXPONENT)),
  );
}

/** Source Game `demandThrottleFactor`: last realized sales plus a 15% probe, with a 10% floor. */
export function demandThrottleFactor(
  plannedUnits: number,
  priorSoldUnits: number | null | undefined,
  priorProducedUnits: number | null | undefined,
): number {
  if (!Number.isFinite(plannedUnits) || plannedUnits <= 0) return 1;
  if (typeof priorProducedUnits !== "number" || !Number.isFinite(priorProducedUnits) || priorProducedUnits <= 0) return 1;
  if (typeof priorSoldUnits !== "number" || !Number.isFinite(priorSoldUnits)) return 1;
  const target = Math.max(0, priorSoldUnits) * (1 + DEMAND_PROBE_MARGIN);
  if (target >= plannedUnits) return 1;
  return Math.max(DEMAND_THROTTLE_FLOOR, target / plannedUnits);
}

/** Source Game `throttleSoldUnits`: price-value-weighted fills for mixed output. */
export function throttleSoldUnits(
  asset: CorporateSectorAsset,
  supplyRates: Partial<Record<CommodityType, number>>,
  priceRatioFor: (commodity: CommodityType) => number,
): number | null {
  const { producedUnits, soldUnits, soldByCommodity } = asset;
  if (!soldByCommodity || typeof producedUnits !== "number" || !Number.isFinite(producedUnits) || producedUnits <= 0) {
    return typeof soldUnits === "number" && Number.isFinite(soldUnits) ? soldUnits : null;
  }
  let weightSum = 0;
  let soldWeight = 0;
  let legs = 0;
  for (const [commodityKey, rate] of Object.entries(supplyRates)) {
    const commodity = commodityKey as CommodityType;
    const fill = soldByCommodity[commodity];
    if (!(typeof rate === "number" && rate > 0) || typeof fill !== "number" || !Number.isFinite(fill)) continue;
    const ratio = priceRatioFor(commodity);
    const weight = rate * (Number.isFinite(ratio) && ratio > 0 ? ratio : 1);
    weightSum += weight;
    soldWeight += weight * Math.max(0, Math.min(1, fill));
    legs += 1;
  }
  if (legs < 2 || !(weightSum > 0)) {
    return typeof soldUnits === "number" && Number.isFinite(soldUnits) ? soldUnits : null;
  }
  return producedUnits * soldWeight / weightSum;
}
