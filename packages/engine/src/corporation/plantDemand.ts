/** Plants-mode intermediate demand from the source SECTOR_DEMAND table. */
import type { CommodityType } from "../commodity/constants.js";
import { COMMODITY_BASE_PRICES, getEraNominalScale } from "../commodity/constants.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import { sectorDemandMix, SOURCE_DEFAULT_OPERATING_SUPPLY } from "./plantCapacity.js";
import { effectiveSectorStrategyRates } from "./strategyRetooling.js";
import { isPlannedEconomy } from "../commandEconomy/constants.js";
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
  // The legacy source row applies when extraction uses the default operating
  // mode; selected strategy recipes replace it only during selection/transition.
  extraction: { energy: 0.2, vehicles: 0.15, freight: 0.1, chemicals: 0.08, construction_services: 0.03, ordnance: 0.06 },
};

const HOUSEHOLD_BASKET: Partial<Record<CommodityType, number>> = {
  food: 0.2, energy: 0.08, retail: 0.1, vehicles: 0.06, electronics: 0.05,
  pharmaceuticals: 0.03, healthcare_services: 0.09, real_estate_services: 0.1,
  financial_services: 0.05, network_services: 0.05, entertainment_services: 0.05,
  software: 0.03, freight: 0.03, advertising: 0.02, consulting_services: 0.02,
  building_materials: 0.02, plastics: 0.01, chemicals: 0.01,
};
const HOUSEHOLD_TIER_SLOPE: Partial<Record<CommodityType, number>> = {
  food: -0.35, energy: -0.2, retail: -0.1, vehicles: 0.2, electronics: 0.25,
  entertainment_services: 0.3, financial_services: 0.3, real_estate_services: 0.2,
  healthcare_services: 0.15, software: 0.25,
};
const HOUSEHOLD_ELASTICITY: Partial<Record<CommodityType, number>> = {
  food: 0.1, energy: 0.15, healthcare_services: 0.1, pharmaceuticals: 0.1,
  retail: 0.3, vehicles: 0.6, electronics: 0.6, entertainment_services: 0.6,
  financial_services: 0.4, real_estate_services: 0.4, software: 0.5,
};

/** Source householdConsumption.computeHouseholdConsumption with source neutral signal fallbacks. */
function rebuildHouseholdDemand(world: WorldState): void {
  const byState = new Map<string, Map<CommodityType, number>>();
  const byCountry = new Map<string, Map<CommodityType, number>>();
  const totals = new Map<CommodityType, number>();
  const nominalScale = getEraNominalScale(world.meta.era);
  for (const region of Object.values(world.regions)) {
    const population = region.population ?? 0;
    const gdp = region.gdp ?? 0;
    if (region.corporationHeadquartersOnly === true || !(population > 0)) continue;
    const perCapitaGdp = gdp > 0 ? gdp / population : 0;
    const wealth = Math.max(0.5, Math.min(2, perCapitaGdp > 0 ? Math.sqrt(perCapitaGdp / 0.03) : 0.5));
    const weights = Object.entries(HOUSEHOLD_BASKET) as [CommodityType, number][];
    const adjusted = weights.map(([commodity, weight]) => [
      commodity,
      Math.max(0, weight * (1 + (HOUSEHOLD_TIER_SLOPE[commodity] ?? 0) * (wealth - 1))),
    ] as const);
    const weightTotal = adjusted.reduce((sum, [, weight]) => sum + weight, 0);
    if (!(weightTotal > 0)) continue;
    const regional = new Map<CommodityType, number>();
    for (const [commodity, weight] of adjusted) {
      const modernBase = COMMODITY_BASE_PRICES[commodity];
      const row = world.commodityPrices[commodity];
      if (!(modernBase > 0) || !row || !(row.basePrice > 0)) continue;
      const budget = population * 0.002 * 3000 * nominalScale;
      const priceRatio = row.globalPrice / row.basePrice;
      const elasticity = HOUSEHOLD_ELASTICITY[commodity] ?? 0.35;
      const priceMod = Math.max(0.6, Math.min(1.3, Math.pow(priceRatio, -elasticity)));
      const units = (budget * (weight / weightTotal) / row.basePrice) * priceMod;
      if (!(units > 0) || !Number.isFinite(units)) continue;
      regional.set(commodity, units);
      totals.set(commodity, (totals.get(commodity) ?? 0) + units);
    }
    if (regional.size > 0) byState.set(region.id, regional);
  }

  // Source PLANTS_HOUSEHOLD_SUPPLY_CAP bounds the global basket after the
  // state loop and preserves each state contribution's relative share.
  for (const [commodity, total] of totals) {
    const supply = world.commodityPrices[commodity]?.globalSupply ?? 0;
    if (!(supply > 0) || total <= supply * 1.5) continue;
    const factor = (supply * 1.5) / total;
    for (const stateDemand of byState.values()) {
      const units = stateDemand.get(commodity);
      if (units !== undefined) stateDemand.set(commodity, units * factor);
    }
  }
  for (const [stateId, stateDemand] of byState) {
    const countryId = world.regions[stateId]?.countryId;
    if (!countryId) continue;
    for (const [commodity, units] of stateDemand) {
      const countryDemand = byCountry.get(countryId) ?? new Map<CommodityType, number>();
      countryDemand.set(commodity, (countryDemand.get(commodity) ?? 0) + units);
      byCountry.set(countryId, countryDemand);
    }
  }
  world.plantMarketDemand!.householdDemandByCountry = Object.fromEntries(
    [...byCountry].map(([countryId, demand]) => [countryId, Object.fromEntries(demand)]),
  );
  world.plantMarketDemand!.householdDemandByState = Object.fromEntries(
    [...byState].map(([stateId, demand]) => [stateId, Object.fromEntries(demand)]),
  );
}

function firstBudgetCategory(categories: Record<string, number> | undefined, aliases: readonly string[]): number {
  if (!categories) return 0;
  for (const alias of aliases) {
    const value = categories[alias];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

/** Source demandLegs.applyGovernmentDemand with only recorded budget/region inputs. */
function rebuildGovernmentDemand(world: WorldState): void {
  const byCountry = new Map<string, Map<CommodityType, number>>();
  const byState = new Map<string, Map<CommodityType, number>>();
  const year = Number(world.meta.date.slice(0, 4));
  const add = (target: Map<string, Map<CommodityType, number>>, id: string, commodity: CommodityType, units: number) => {
    const leg = target.get(id) ?? new Map<CommodityType, number>();
    leg.set(commodity, (leg.get(commodity) ?? 0) + units);
    target.set(id, leg);
  };

  for (const [countryId, budget] of Object.entries(world.budgets)) {
    const fxRate = world.exchangeRates[countryId]?.rate;
    if (!(typeof fxRate === "number" && Number.isFinite(fxRate) && fxRate > 0)) continue;
    const regionalShares = Object.values(world.regions)
      .filter(region => region.countryId === countryId && region.corporationHeadquartersOnly !== true &&
        typeof region.gdp === "number" && Number.isFinite(region.gdp) && region.gdp > 0)
      .map(region => ({ id: region.id, gdp: region.gdp! }));
    const gdpTotal = regionalShares.reduce((sum, region) => sum + region.gdp, 0);
    const apply = (commodity: CommodityType, categoryAliases: readonly string[], rate: number, regional: boolean) => {
      const annualSpendLocal = firstBudgetCategory(budget.spending?.byCategory, categoryAliases);
      const basePrice = world.commodityPrices[commodity]?.basePrice;
      if (!(annualSpendLocal > 0) || !(typeof basePrice === "number" && basePrice > 0)) return;
      const units = (annualSpendLocal / fxRate / 48 / basePrice) * rate;
      if (!(units > 0) || !Number.isFinite(units)) return;
      add(byCountry, countryId, commodity, units);
      if (regional && gdpTotal > 0) {
        for (const region of regionalShares) add(byState, region.id, commodity, units * (region.gdp / gdpTotal));
      }
    };

    apply("healthcare_services", ["healthcare", "health"], 0.015, true);
    apply("ordnance", ["defense"], 0.005, true);
    const marketization = world.commandEconomy[countryId]?.marketizationLevel ?? 100;
    if (Number.isFinite(year) && isPlannedEconomy(marketization)) {
      apply("entertainment_services", ["education"], 0.09, false);
    }
  }

  world.plantMarketDemand!.governmentDemandByCountry = Object.fromEntries(
    [...byCountry].map(([countryId, demand]) => [countryId, Object.fromEntries(demand)]),
  );
  world.plantMarketDemand!.governmentDemandByState = Object.fromEntries(
    [...byState].map(([stateId, demand]) => [stateId, Object.fromEntries(demand)]),
  );
}

/**
 * Rebuild the lagged plants buyer book from prior produced/nameplate units.
 * Source basis is per day: Native stores revenue/stock on the seven-day turn,
 * but plant stocks and the market commodity ledger are daily quantities.
 * `capacity × Σ(rate/basePrice)` gives daily nameplate value; multiplying by
 * input rate/basePrice is source `revenue × rate / basePrice` in units.
 */
export function rebuildCorporatePlantInputDemand(world: WorldState): void {
  const demand = new Map<CommodityType, number>();
  const demandByCountry = new Map<string, Map<CommodityType, number>>();
  const demandByState = new Map<string, Map<CommodityType, number>>();
  const basePrices = Object.fromEntries(
    Object.entries(world.commodityPrices).map(([commodity, row]) => [commodity, row.basePrice]),
  ) as Partial<Record<CommodityType, number>>;

  for (const asset of Object.values(corporateSectorAssets(world))) {
    const corporation = world.corporations[asset.corporationId];
    if (!corporation || corporation.suspended === true) continue;
    const hasSelectedStrategy = asset.strategyId !== undefined && asset.strategyId !== "standard";
    const hasStrategyOverride = hasSelectedStrategy || asset.transitionFromStrategyId !== undefined;
    const effective = hasStrategyOverride ? effectiveSectorStrategyRates(asset, world.meta.turn) : undefined;
    const supplyMix = effective?.supply ?? SOURCE_DEFAULT_OPERATING_SUPPLY[asset.sectorType];
    const inputRates = effective?.demand ?? (hasSelectedStrategy
      ? sectorDemandMix(asset.sectorType, asset.strategyId)
      : CORPORATE_INPUT_DEMAND_RATES[asset.sectorType]) ?? {};
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
      if (Number.isFinite(units) && units > 0) {
        demand.set(commodity, (demand.get(commodity) ?? 0) + units);
        const countryDemand = demandByCountry.get(asset.countryId) ?? new Map<CommodityType, number>();
        countryDemand.set(commodity, (countryDemand.get(commodity) ?? 0) + units);
        demandByCountry.set(asset.countryId, countryDemand);
        if (asset.stateId && world.regions[asset.stateId] && !world.regions[asset.stateId]!.corporationHeadquartersOnly) {
          const stateDemand = demandByState.get(asset.stateId) ?? new Map<CommodityType, number>();
          stateDemand.set(commodity, (stateDemand.get(commodity) ?? 0) + units);
          demandByState.set(asset.stateId, stateDemand);
        }
      }
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
  // Rebuilt from current real assets each time; never add a previous map to
  // itself. The legacy retail proxy above remains global because Native has
  // no source-backed country/household allocation for that leg.
  world.plantMarketDemand.corporateInputsByCountry = Object.fromEntries(
    [...demandByCountry.entries()].map(([countryId, countryDemand]) => [countryId, Object.fromEntries(countryDemand)]),
  );
  world.plantMarketDemand.corporateInputsByState = Object.fromEntries(
    [...demandByState].map(([stateId, stateDemand]) => [stateId, Object.fromEntries(stateDemand)]),
  );
  rebuildGovernmentDemand(world);
  rebuildHouseholdDemand(world);
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
    // Source computeRawSupplyDemand bounds the PRE-calibration demand at
    // supply x 1.5 / calibration, and the caller multiplies by calibration
    // after, so a capped commodity reads exactly 1.5x supply. Comparing the
    // already-calibrated demand against the pre-calibration cap overstates
    // capped calibrated commodities by 1 / calibration. Keep min/max in
    // pre-calibration units and calibrate once at the end.
    const rawDemand = stabilizer + scaledDemand;
    const demandCap = sourceSupply * 1.5 / calibration;
    const preCalibrationDemand = rawDemand <= demandCap ? rawDemand : Math.max(unscaledFloor, demandCap);
    const demandBeforeStabilizer = preCalibrationDemand * calibration;
    row.globalDemand = Number.isFinite(demandBeforeStabilizer) ? demandBeforeStabilizer : stabilizer;
  }
}

/**
 * Strict plant-market-book validation at the save boundary. Absent stays
 * absent (pre-plants saves and fresh worlds carry no book; the turn rebuild
 * creates it), so untouched saves stay byte-identical. A present book must
 * carry all four legs as records of finite nonnegative unit balances;
 * anything else is corruption and fails closed before the turn can read it.
 * Unknown extra keys on the book are ignored for forward compatibility, but
 * every recorded balance must be a valid number.
 */
export function validatePlantMarketDemand(world: WorldState): void {
  const book = world.plantMarketDemand;
  if (book === undefined) return;
  if (typeof book !== "object" || book === null || Array.isArray(book)) {
    throw new Error("World has an invalid plant market book");
  }
  for (const field of ["external", "corporateInputs", "externalSupply", "corporateOutputSupply"] as const) {
    const leg = (book as unknown as Record<string, unknown>)[field];
    if (typeof leg !== "object" || leg === null || Array.isArray(leg)) {
      throw new Error(`World plant market book has an invalid ${field} leg`);
    }
    for (const [commodity, units] of Object.entries(leg as Record<string, unknown>)) {
      if (typeof units !== "number" || !Number.isFinite(units) || units < 0) {
        throw new Error(`World plant market book has invalid ${field} for ${commodity}`);
      }
    }
  }
  for (const field of [
    "corporateInputsByCountry", "corporateInputsByState", "corporateOutputSupplyByCountry", "corporateOutputSupplyByState",
    "governmentDemandByCountry", "governmentDemandByState", "householdDemandByCountry", "householdDemandByState",
  ] as const) {
    const countries = (book as unknown as Record<string, unknown>)[field];
    if (countries === undefined) continue;
    if (typeof countries !== "object" || countries === null || Array.isArray(countries)) {
      throw new Error(`World plant market book has an invalid ${field}`);
    }
    for (const [countryId, leg] of Object.entries(countries as Record<string, unknown>)) {
      if (typeof leg !== "object" || leg === null || Array.isArray(leg)) {
        throw new Error(`World plant market book has an invalid ${field} country ${countryId}`);
      }
      for (const [commodity, units] of Object.entries(leg as Record<string, unknown>)) {
        if (typeof units !== "number" || !Number.isFinite(units) || units < 0) {
          throw new Error(`World plant market book has invalid ${field} for ${countryId}:${commodity}`);
        }
      }
    }
  }
}
