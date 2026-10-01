/** Plants-mode intermediate demand from the source SECTOR_DEMAND table. */
import type { CommodityType } from "../commodity/constants.js";
import { getEraNominalScale } from "../commodity/constants.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import { DEFAULT_SECTOR_OUTPUT_MIX } from "./plantCapacity.js";
import type { WorldState } from "../types.js";

export const CORPORATE_PLANT_MARKET_STABILIZER: Readonly<Record<CommodityType, number>> = {
  steel: 41_000, electronics: 50_000, energy: 50_000, chemicals: 50_000,
  pharmaceuticals: 4_400, fertilizers: 18_000, food: 48_000, building_materials: 38_000,
  construction_services: 4_800, healthcare_services: 3_200, real_estate_services: 6_900,
  software: 40_000, financial_services: 17_000, advertising: 50_000, vehicles: 1_500,
  retail: 50_000, freight: 9_000, consulting_services: 4_100, iron: 50_000, coal: 30_000,
  oil: 50_000, rare_earth: 4_214, timber: 16_000, natural_gas: 50_000, ordnance: 1_500,
  plastics: 25_000, network_services: 5_500, entertainment_services: 2_900,
};

/** AHDGame's measured 1953 demand corrections at 01797b2708. */
const DEMAND_CALIBRATION_1953: Partial<Record<CommodityType, number>> = {
  advertising: 0.44,
  natural_gas: 0.74,
  healthcare_services: 0.92,
  iron: 0.45,
  oil: 0.55,
  energy: 0.55,
};

/**
 * Input rates ported from AHDGame src/lib/constants/commodities.ts
 * `SECTOR_DEMAND` at 01797b2708. Each row is a share of the plant's daily
 * nameplate value spent on that commodity. Game's `computeRawSupplyDemand`
 * applies these to daily revenue, era units, and (under plants) utilization.
 * Here `producedUnits × mixPrice` is the equivalent daily realized operating
 * base; absent first-turn telemetry, seeded physical capacity is the source
 * flip-turn output baseline.
 */
export const CORPORATE_INPUT_DEMAND_RATES: Readonly<Record<string, Readonly<Partial<Record<CommodityType, number>>>>> = {
  manufacturing: { energy: 0.15, iron: 0.1, coal: 0.06, electronics: 0.1, freight: 0.1, real_estate_services: 0.03, rare_earth: 0.08, natural_gas: 0.05, timber: 0.03, plastics: 0.06 },
  technology: { energy: 0.15, rare_earth: 0.14, steel: 0.05, consulting_services: 0.08, real_estate_services: 0.03, network_services: 0.1 },
  energy: { steel: 0.15, coal: 0.15, oil: 0.07, vehicles: 0.1, construction_services: 0.05, rare_earth: 0.04, natural_gas: 0.08 },
  chemical_industries: { energy: 0.18, oil: 0.1, freight: 0.08, real_estate_services: 0.02, vehicles: 0.1, natural_gas: 0.12 },
  healthcare: { pharmaceuticals: 0.11, electronics: 0.11, software: 0.12, energy: 0.05, real_estate_services: 0.04, food: 0.05, vehicles: 0.025, plastics: 0.06 },
  agriculture: { fertilizers: 0.15, vehicles: 0.1, energy: 0.1, freight: 0.08, natural_gas: 0.05, timber: 0.04, plastics: 0.05 },
  automobiles: { steel: 0.25, iron: 0.08, electronics: 0.15, energy: 0.1, freight: 0.08, real_estate_services: 0.02, rare_earth: 0.08, plastics: 0.1 },
  financial: { software: 0.2, electronics: 0.05, consulting_services: 0.1, real_estate_services: 0.04, network_services: 0.06 },
  media: { software: 0.15, electronics: 0.1, consulting_services: 0.06, real_estate_services: 0.03, network_services: 0.1, entertainment_services: 0.06 },
  defense: { steel: 0.2, iron: 0.1, rare_earth: 0.05, electronics: 0.2, software: 0.1, construction_services: 0.05, vehicles: 0.03 },
  real_estate: { construction_services: 0.2, building_materials: 0.12, steel: 0.08, energy: 0.08, financial_services: 0.1, timber: 0.07 },
  construction: { building_materials: 0.15, steel: 0.15, energy: 0.12, vehicles: 0.1, financial_services: 0.05, rare_earth: 0.04, natural_gas: 0.02, timber: 0.06, plastics: 0.07 },
  telecommunications: { electronics: 0.18, energy: 0.1, building_materials: 0.06, construction_services: 0.08, real_estate_services: 0.03, rare_earth: 0.09 },
  entertainment: { software: 0.15, electronics: 0.1, energy: 0.06, real_estate_services: 0.03, network_services: 0.08 },
  logistics: { vehicles: 0.2, energy: 0.15, software: 0.1, real_estate_services: 0.03, food: 0.06 },
  retail: { food: 0.15, electronics: 0.1, energy: 0.08, vehicles: 0.08, freight: 0.07, advertising: 0.06, software: 0.06, chemicals: 0.03, pharmaceuticals: 0.03, financial_services: 0.05, consulting_services: 0.03, building_materials: 0.04, steel: 0.03, oil: 0.03, healthcare_services: 0.04, real_estate_services: 0.05, natural_gas: 0.02, timber: 0.01, plastics: 0.05, network_services: 0.05, entertainment_services: 0.03 },
  extraction: { energy: 0.2, vehicles: 0.15, freight: 0.1, chemicals: 0.08, construction_services: 0.03, ordnance: 0.06 },
};

/**
 * Rebuild the lagged plants buyer book from prior produced/nameplate units.
 * Source basis is per day: Native stores revenue/stock on the seven-day turn,
 * but plant stocks and the market commodity ledger are daily quantities.
 * `capacity × Σ(rate/basePrice)` gives daily nameplate value; multiplying by
 * input rate/basePrice is source `revenue × rate / basePrice` in units.
 */
export function rebuildCorporatePlantInputDemand(world: WorldState): void {
  const demand = new Map<CommodityType, number>();
  const basePrices = Object.fromEntries(
    Object.entries(world.commodityPrices).map(([commodity, row]) => [commodity, row.basePrice]),
  ) as Partial<Record<CommodityType, number>>;

  for (const asset of Object.values(corporateSectorAssets(world))) {
    const corporation = world.corporations[asset.corporationId];
    if (!corporation || corporation.suspended === true) continue;
    const supplyMix = DEFAULT_SECTOR_OUTPUT_MIX[asset.sectorType] ?? {};
    const inputRates = CORPORATE_INPUT_DEMAND_RATES[asset.sectorType] ?? {};
    let unitYield = 0;
    for (const [rawOutput, rawRate] of Object.entries(supplyMix)) {
      const price = basePrices[rawOutput as CommodityType];
      if ((rawRate ?? 0) > 0 && Number.isFinite(price) && price! > 0) unitYield += rawRate! / price!;
    }
    const mixPrice = unitYield > 0 ? 1 / unitYield : 0;
    const produced = Number.isFinite(asset.producedUnits)
      ? Math.max(0, asset.producedUnits ?? 0)
      : Math.max(0, asset.capitalStock ?? 0);
    const dailyValue = produced * mixPrice;
    if (!(dailyValue > 0) || !Number.isFinite(dailyValue)) continue;
    for (const [rawInput, rate] of Object.entries(inputRates)) {
      const commodity = rawInput as CommodityType;
      const price = basePrices[commodity];
      if (!(rate! > 0) || !Number.isFinite(price) || !(price! > 0)) continue;
      const units = dailyValue * rate! / price!;
      if (Number.isFinite(units) && units > 0) demand.set(commodity, (demand.get(commodity) ?? 0) + units);
    }
  }

  // AHDGame's legacy retail consumer proxy adds demand equal to retail output.
  // The Native world has no per-region GDP-growth metric; the source neutral
  // multiplier is exactly 1. This remains in addition to retail's input legs.
  const retailSupply = Number.isFinite(world.commodityPrices.retail?.globalSupply)
    ? Math.max(0, world.commodityPrices.retail!.globalSupply)
    : 0;
  if (retailSupply > 0) demand.set("retail", (demand.get("retail") ?? 0) + retailSupply);

  // Keep other authored demand separate from this derived buyer leg. This
  // preserves demand already present on a loaded/synthetic market and avoids
  // compounding the corporate input demand every time the turn repeats.
  if (!world.plantMarketDemand) {
    world.plantMarketDemand = {
      external: Object.fromEntries(
        Object.entries(world.commodityPrices).map(([commodity, row]) => [
          commodity,
          Number.isFinite(row.globalDemand) ? Math.max(0, row.globalDemand) : 0,
        ]),
      ),
      corporateInputs: {},
      externalSupply: Object.fromEntries(
        Object.entries(world.commodityPrices).map(([commodity, row]) => [
          commodity,
          Math.max(CORPORATE_PLANT_MARKET_STABILIZER[commodity as CommodityType] ?? 50_000,
            Number.isFinite(row.globalSupply) ? Math.max(0, row.globalSupply) : 0),
        ]),
      ),
      corporateOutputSupply: {},
    };
  }
  world.plantMarketDemand.corporateInputs = Object.fromEntries(demand);
  const eraNominalScale = getEraNominalScale(world.meta.era);
  const eraUnitScale = eraNominalScale > 0 ? 1 / eraNominalScale : 1;
  const calibrationByCommodity = world.meta.era === "1953" ? DEMAND_CALIBRATION_1953 : {};
  for (const [commodity, row] of Object.entries(world.commodityPrices)) {
    const key = commodity as CommodityType;
    const stabilizer = CORPORATE_PLANT_MARKET_STABILIZER[key] ?? 50_000;
    const external = world.plantMarketDemand.external[key] ?? 0;
    const corporateInput = demand.get(key) ?? 0;
    const scaledDemand = external + corporateInput;
    const calibration = calibrationByCommodity[key] ?? 1;
    // Game computeRawSupplyDemand's era demand cap (PLANTS_LEDGER_DEMAND_SUPPLY_CAP):
    // calibrated demand is bounded at 1.5× the lagged global supply, but never
    // below the pre-era demand plus the per-commodity stabilizer.
    const previousCorporateOutput = world.plantMarketDemand.corporateOutputSupply?.[key] ?? 0;
    const observedSupply = Number.isFinite(row.globalSupply) ? Math.max(0, row.globalSupply) : 0;
    const externalSupply = Math.max(stabilizer, observedSupply - previousCorporateOutput);
    world.plantMarketDemand.externalSupply ??= {};
    world.plantMarketDemand.externalSupply[key] = externalSupply;
    row.globalSupply = externalSupply + previousCorporateOutput;
    const sourceSupply = row.globalSupply;
    const unscaledFloor = stabilizer + scaledDemand / eraUnitScale;
    const demandCap = sourceSupply * 1.5 / calibration;
    const demandBeforeStabilizer = eraUnitScale > 1
      ? Math.max(unscaledFloor, Math.min((stabilizer + scaledDemand) * calibration, demandCap))
      : (stabilizer + scaledDemand) * calibration;
    row.globalDemand = Number.isFinite(demandBeforeStabilizer) ? demandBeforeStabilizer : stabilizer;
  }
}
