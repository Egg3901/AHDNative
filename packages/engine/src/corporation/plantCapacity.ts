/**
 * Corporation plant-capacity substrate from AHDGame 954f1c2178.
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
import type { CorporationType } from "./types.js";
import { DAYS_PER_TURN } from "../calendar.js";

export const PLANT_CAPITAL_SEED_HEADROOM = 1.1;
export const PLANT_CAPITAL_DEPRECIATION_PER_TURN = 0.0005;
const GROWTH_COST_MULTIPLIER = 3;

/** Game's ungated standard-strategy output mix (`SECTOR_STRATEGIES`, standard). */
export const DEFAULT_SECTOR_OUTPUT_MIX: Partial<Record<CorporationType, Partial<Record<CommodityType, number>>>> = {
  manufacturing: { steel: 0.4, building_materials: 0.2 },
  technology: { electronics: 0.35, software: 0.35 },
  energy: { energy: 0.65 },
  chemical_industries: { chemicals: 0.5, plastics: 0.25 },
  healthcare: { healthcare_services: 0.5 },
  agriculture: { food: 0.5 },
  automobiles: { vehicles: 0.5 },
  financial: { financial_services: 0.5 },
  media: { advertising: 0.5 },
  defense: { vehicles: 0.2, electronics: 0.15, ordnance: 0.1 },
  real_estate: { real_estate_services: 0.45 },
  construction: { construction_services: 0.45 },
  telecommunications: { software: 0.2, network_services: 0.4 },
  entertainment: { advertising: 0.2, entertainment_services: 0.4 },
  retail: { retail: 0.5 },
  logistics: { freight: 0.45, consulting_services: 0.25 },
  extraction: { iron: 0.4, coal: 0.3, oil: 0.14, rare_earth: 0.27, natural_gas: 0.24, timber: 0.2 },
};

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
  basePrices: Partial<Record<CommodityType, number>>;
}): PlantCapitalSeed {
  const { revenueLocal, localPerAnchor, sectorType, basePrices } = input;
  if (!Number.isFinite(revenueLocal) || revenueLocal <= 0 || !Number.isFinite(localPerAnchor) || localPerAnchor <= 0) {
    return { capitalStock: 0, capacityBookAnchor: 0 };
  }
  const supply = DEFAULT_SECTOR_OUTPUT_MIX[sectorType] ?? {};
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
  const capacityBookAnchor = capitalStock * (GROWTH_COST_MULTIPLIER / unitYield);
  return Number.isFinite(capitalStock) && Number.isFinite(capacityBookAnchor)
    ? { capitalStock, capacityBookAnchor }
    : { capitalStock: 0, capacityBookAnchor: 0 };
}

/** Source `capacityPricePerUnit`: the same growth-cost identity, in anchor currency. */
export function capacityPricePerUnitAnchor(
  sectorType: CorporationType,
  basePrices: Partial<Record<CommodityType, number>>,
): number {
  const supply = DEFAULT_SECTOR_OUTPUT_MIX[sectorType] ?? {};
  let unitYield = 0;
  for (const [rawCommodity, rawRate] of Object.entries(supply)) {
    const basePrice = basePrices[rawCommodity as CommodityType];
    if (Number.isFinite(rawRate) && (rawRate ?? 0) > 0 && Number.isFinite(basePrice) && basePrice! > 0) {
      unitYield += (rawRate ?? 0) / basePrice!;
    }
  }
  return unitYield > 0 && Number.isFinite(unitYield) ? GROWTH_COST_MULTIPLIER / unitYield : 0;
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
