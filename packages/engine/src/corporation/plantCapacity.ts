/**
 * Corporation plant-capacity substrate from AHDGame cb66acdf0129616b8a09902727e9b58715c8bacb.
 *
 * `capitalStock` is the source CorporateSector output-unit stock and
 * `capacityBookAnchor` is its paid USD-era book value. Native corporate revenue
 * is local currency per Native week, while commodity base prices are already
 * era-scaled anchor prices; convert to the source daily revenue unit and
 * normalize through the country's live FX rate before applying the source
 * `impliedOutputUnits` equation.
 */
import type { CommodityType } from "../commodity/constants.js";
import type { WorldState } from "../types.js";
import { CORPORATION_TYPES, type CorporationType } from "./types.js";
import { SOURCE_SECTOR_STRATEGIES } from "./sectorStrategyCatalog.js";
import { DAYS_PER_TURN } from "../calendar.js";

export const PLANT_CAPITAL_SEED_HEADROOM = 1.1;
export const PLANT_CAPITAL_DEPRECIATION_PER_TURN = 0.0005;
const GROWTH_COST_MULTIPLIER = 3;

/** AHDGame capacityEconomy.capacityEraPriceIndex at source cb66acdf. */
export function capacityEraPriceIndex(year: number | null | undefined): number {
  if (typeof year !== "number" || !Number.isFinite(year)) return 5;
  if (year < 1971) return 1;
  if (year < 1979) return 1.4;
  if (year < 1991) return 2.6;
  if (year < 1999) return 3.6;
  return 5;
}

/** Source `SECTOR_STRATEGIES` recipes at cb66acdf, including exact standard rows. */
export const DEFAULT_SECTOR_OUTPUT_MIX = Object.fromEntries(
  CORPORATION_TYPES.map((sectorType) => [sectorType, SOURCE_SECTOR_STRATEGIES[sectorType].standard.supply]),
) as Record<CorporationType, Partial<Record<CommodityType, number>>>;

/**
 * Game's legacy SECTOR_SUPPLY rows are used until a non-standard strategy or
 * an active transition exists. Most rows equal the standard strategy table;
 * these two source rows are intentionally different and must remain so.
 */
export const SOURCE_DEFAULT_OPERATING_SUPPLY: Record<CorporationType, Partial<Record<CommodityType, number>>> = {
  ...DEFAULT_SECTOR_OUTPUT_MIX,
  chemical_industries: { chemicals: 0.5, plastics: 0.25 },
  extraction: { iron: 0.4, coal: 0.3, oil: 0.14, rare_earth: 0.27, natural_gas: 0.24, timber: 0.2 },
};

export const SECTOR_STRATEGIES = SOURCE_SECTOR_STRATEGIES;
export const EXTRACTION_STRATEGIES = SECTOR_STRATEGIES.extraction;
export type ExtractionStrategyId = keyof typeof EXTRACTION_STRATEGIES;

export interface SectorStrategyMethod {
  supply: Partial<Record<CommodityType, number>>;
  demand: Partial<Record<CommodityType, number>>;
  minDecade?: string;
  requiresTechUnlock?: boolean;
}

/** Source getStrategy recipe lookup; unknown methods fail closed. */
export function getSectorStrategy(sectorType: CorporationType, strategyId?: string | null): SectorStrategyMethod {
  const id = strategyId ?? "standard";
  const strategy = (SECTOR_STRATEGIES[sectorType] as Record<string, SectorStrategyMethod>)[id];
  if (!strategy) throw new Error(`Unknown ${sectorType} strategy ${id}`);
  return {
    supply: strategy.supply as Partial<Record<CommodityType, number>>,
    demand: strategy.demand as Partial<Record<CommodityType, number>>,
    ...(strategy.minDecade ? { minDecade: strategy.minDecade } : {}),
    ...(strategy.requiresTechUnlock ? { requiresTechUnlock: true } : {}),
  };
}

export function hasSectorStrategy(sectorType: CorporationType, strategyId: string): boolean {
  return Object.hasOwn(SECTOR_STRATEGIES[sectorType], strategyId);
}

/** Source getStrategy supply recipe lookup; unknown IDs fail closed. */
export function sectorSupplyMix(
  sectorType: CorporationType,
  strategyId?: string | null,
): Partial<Record<CommodityType, number>> {
  return getSectorStrategy(sectorType, strategyId).supply;
}

/** Source getStrategy input recipe lookup; unknown IDs fail closed. */
export function sectorDemandMix(
  sectorType: CorporationType,
  strategyId?: string | null,
): Partial<Record<CommodityType, number>> | undefined {
  return getSectorStrategy(sectorType, strategyId).demand;
}

export interface PlantCapitalSeed {
  capitalStock: number;
  capacityBookAnchor: number;
}

export interface PlantCapitalTurn extends PlantCapitalSeed {
  landedUnits: number;
  depreciationFactor: number;
}

/** Game's plants-tier stock and paid-basis advance (`plantsCapacity.ts`). */
export function advancePlantCapitalTurn(input: {
  capitalStock: number;
  capacityBookAnchor?: number;
  landedCreditAnchor: number;
  capacityPricePerUnitAnchor: number;
  depreciationPerTurn?: number;
}): PlantCapitalTurn {
  const stock = Number.isFinite(input.capitalStock) ? Math.max(0, input.capitalStock) : 0;
  const price = Number.isFinite(input.capacityPricePerUnitAnchor)
    ? Math.max(0, input.capacityPricePerUnitAnchor)
    : 0;
  const credit = Number.isFinite(input.landedCreditAnchor) ? Math.max(0, input.landedCreditAnchor) : 0;
  const depreciation = Number.isFinite(input.depreciationPerTurn)
    ? Math.max(0, Math.min(1, input.depreciationPerTurn ?? 0))
    : PLANT_CAPITAL_DEPRECIATION_PER_TURN;
  const landedUnits = credit > 0 && price > 0 ? credit / price : 0;
  const preDepreciationStock = stock + landedUnits;
  const capitalStock = preDepreciationStock * (1 - depreciation);
  const depreciationFactor = preDepreciationStock > 0 ? capitalStock / preDepreciationStock : 1;
  const priorBook = validBook(input.capacityBookAnchor, stock, price);
  const capacityBookAnchor = (priorBook + (landedUnits > 0 ? credit : 0)) * depreciationFactor;
  if (![capitalStock, capacityBookAnchor, landedUnits, depreciationFactor].every(Number.isFinite)) {
    return { capitalStock: 0, capacityBookAnchor: 0, landedUnits: 0, depreciationFactor: 1 };
  }
  return { capitalStock, capacityBookAnchor, landedUnits, depreciationFactor };
}

/** Ports Game `seedCapitalStock` and the source paid-list-price book fallback. */
export function seedPlantCapital(input: {
  revenueLocal: number;
  localPerAnchor: number;
  sectorType: CorporationType;
  strategyId?: string | null;
  basePrices: Partial<Record<CommodityType, number>>;
  year: number;
}): PlantCapitalSeed {
  const { revenueLocal, localPerAnchor, sectorType, basePrices } = input;
  if (!Number.isFinite(revenueLocal) || revenueLocal <= 0 || !Number.isFinite(localPerAnchor) || localPerAnchor <= 0) {
    return { capitalStock: 0, capacityBookAnchor: 0 };
  }
  const supply = sectorSupplyMix(sectorType, input.strategyId);
  let unitYield = 0;
  for (const [rawCommodity, rawRate] of Object.entries(supply)) {
    const commodity = rawCommodity as CommodityType;
    const rate = rawRate ?? 0;
    const basePrice = basePrices[commodity];
    if (Number.isFinite(rate) && rate > 0 && Number.isFinite(basePrice) && basePrice! > 0) {
      unitYield += rate / basePrice!;
    }
  }
  if (!(unitYield > 0) || !Number.isFinite(unitYield)) return { capitalStock: 0, capacityBookAnchor: 0 };

  const dailyRevenueAnchor = revenueLocal / localPerAnchor / DAYS_PER_TURN;
  const impliedUnits = dailyRevenueAnchor * unitYield;
  const capitalStock = impliedUnits * PLANT_CAPITAL_SEED_HEADROOM;
  const capacityBookAnchor = capitalStock * (GROWTH_COST_MULTIPLIER / unitYield) * capacityEraPriceIndex(input.year);
  return Number.isFinite(capitalStock) && Number.isFinite(capacityBookAnchor)
    ? { capitalStock, capacityBookAnchor }
    : { capitalStock: 0, capacityBookAnchor: 0 };
}

/** Source `capacityPricePerUnit`: the same growth-cost identity, in anchor currency. */
export function capacityPricePerUnitAnchor(
  sectorType: CorporationType,
  basePrices: Partial<Record<CommodityType, number>>,
  strategyId: string | null | undefined,
  year: number | null | undefined,
): number {
  const supply = sectorSupplyMix(sectorType, strategyId);
  let unitYield = 0;
  for (const [rawCommodity, rawRate] of Object.entries(supply)) {
    const basePrice = basePrices[rawCommodity as CommodityType];
    if (Number.isFinite(rawRate) && (rawRate ?? 0) > 0 && Number.isFinite(basePrice) && basePrice! > 0) {
      unitYield += (rawRate ?? 0) / basePrice!;
    }
  }
  return unitYield > 0 && Number.isFinite(unitYield)
    ? GROWTH_COST_MULTIPLIER / unitYield * capacityEraPriceIndex(year)
    : 0;
}

/**
 * Add a paid capacity tranche at source list price. Caller supplies anchor
 * currency, as the Game capacity-build and directed-credit routes do.
 */
export function buyPlantCapacity(input: {
  capitalStock: number;
  capacityBookAnchor?: number;
  creditAnchor: number;
  capacityPricePerUnitAnchor: number;
}): PlantCapitalSeed {
  const stock = Number.isFinite(input.capitalStock) ? Math.max(0, input.capitalStock) : 0;
  const credit = Number.isFinite(input.creditAnchor) ? Math.max(0, input.creditAnchor) : 0;
  const price = Number.isFinite(input.capacityPricePerUnitAnchor) ? input.capacityPricePerUnitAnchor : 0;
  if (credit <= 0 || price <= 0) {
    return { capitalStock: stock, capacityBookAnchor: validBook(input.capacityBookAnchor, stock, price) };
  }
  const unitsAdded = credit / price;
  return {
    capitalStock: stock + unitsAdded,
    capacityBookAnchor: validBook(input.capacityBookAnchor, stock, price) + credit,
  };
}

/** One-turn wear budget in anchor currency, exactly the Game SOE floor. */
export function plantReplacementCostAnchor(input: {
  capitalStock: number;
  capacityPricePerUnitAnchor: number;
  depreciationPerTurn?: number;
}): number {
  const stock = Number.isFinite(input.capitalStock) ? Math.max(0, input.capitalStock) : 0;
  const price = Number.isFinite(input.capacityPricePerUnitAnchor) ? Math.max(0, input.capacityPricePerUnitAnchor) : 0;
  const depreciation = Number.isFinite(input.depreciationPerTurn)
    ? Math.max(0, input.depreciationPerTurn ?? 0)
    : PLANT_CAPITAL_DEPRECIATION_PER_TURN;
  const cost = stock * depreciation * price;
  return Number.isFinite(cost) ? cost : 0;
}

export function corporateSectorBasePrices(world: WorldState): Partial<Record<CommodityType, number>> {
  return Object.fromEntries(Object.entries(world.commodityPrices).map(([commodity, row]) => [commodity, row.basePrice])) as Partial<Record<CommodityType, number>>;
}

function validBook(book: number | undefined, stock: number, price: number): number {
  if (typeof book === "number" && Number.isFinite(book) && book >= 0) return book;
  const safePrice = Number.isFinite(price) ? Math.max(0, price) : 0;
  const fallback = stock * safePrice;
  return Number.isFinite(fallback) ? fallback : 0;
}
