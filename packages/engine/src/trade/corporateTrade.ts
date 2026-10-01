import type { CommodityType } from "../commodity/constants.js";
import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { clearCommodity } from "./clearing.js";

const BASE_AFFINITY: Readonly<Record<string, number>> = {
  "BR-US": 1.4, "CN-US": 1.5, "JP-US": 1.3, "UK-US": 1.4,
  "DE-IE": 1.5, "DE-UK": 1.4, "IE-UK": 1.6, "CN-JP": 1.4,
  "CN-NG": 1.3, "NG-UK": 1.3, "US-YU": 1.35, "UK-YU": 1.25,
};

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("-");
}

function activeFta(world: WorldState, a: string, b: string): boolean {
  return Object.values(world.internationalOrgs).some((org) =>
    (org.resolutions ?? []).some((resolution) =>
      resolution.type === "free_trade_agreement" && resolution.status === "active" &&
      resolution.parties.includes(a) && resolution.parties.includes(b),
    ),
  );
}

function sharedBloc(world: WorldState, a: string, b: string): boolean {
  return Object.values(world.internationalOrgs).some((org) => org.members.includes(a) && org.members.includes(b));
}

function scheduledMarketization(countryId: string, year: number): number {
  if (["RU", "BLR", "BAL", "UKR"].includes(countryId)) return year <= 1991 ? 10 : 100;
  if (countryId === "CN") return year <= 1978 ? 10 : year <= 1992 ? 50 : year <= 2018 ? 85 : 100;
  if (countryId === "DD") return year <= 1990 ? 10 : 100;
  if (["PL", "CS"].includes(countryId)) return year <= 1989 ? 10 : 100;
  if (countryId === "HU") return year <= 1989 ? 15 : 100;
  if (countryId === "BG") return year <= 1990 ? 10 : 100;
  if (countryId === "RO") return year <= 1989 ? 8 : 100;
  if (countryId === "YU") return year <= 1964 ? 20 : year <= 1990 ? 35 : 100;
  return 100;
}

function curtained(world: WorldState, countryId: string): boolean {
  if (countryId === "YU") return false;
  const year = Number(world.meta.date.slice(0, 4));
  const recorded = world.commandEconomy[countryId]?.marketizationLevel;
  const marketization = typeof recorded === "number" && Number.isFinite(recorded)
    ? recorded
    : scheduledMarketization(countryId, year);
  return marketization < 70;
}

function blocked(world: WorldState, commodity: CommodityType, exporter: string, importer: string): boolean {
  return Object.values(world.internationalOrgs).some((org) =>
    (org.embargoes ?? []).some((embargo) =>
      (embargo.expiresTurn === undefined || embargo.expiresTurn >= world.meta.turn) &&
      (embargo.commodity === "all" || embargo.commodity === commodity) &&
      ((embargo.sourceCountry === exporter && embargo.targetCountry === importer) ||
        (embargo.sourceCountry === importer && embargo.targetCountry === exporter)),
    ),
  );
}

function affinity(world: WorldState, commodity: CommodityType, exporter: string, importer: string): number {
  if (blocked(world, commodity, exporter, importer)) return 0;
  if (curtained(world, exporter) !== curtained(world, importer)) return 0;
  let value = BASE_AFFINITY[pairKey(exporter, importer)] ?? 1;
  if (activeFta(world, exporter, importer)) value *= 1.6;
  if (sharedBloc(world, exporter, importer)) value *= 1.25;
  // Native has no origin/sector tariff rows or blockade state. Its national
  // budget tariff percentage is not substituted for Game's product tariff.
  return value;
}

/**
 * Clear measured corporate offers against source-rate corporate inputs plus
 * the available source household/government country legs. Household rows are
 * built only for recorded regions; no Native global external pool is
 * apportioned into countries.
 */
export function recordCorporateTradeSnapshot(world: WorldState): void {
  const supplyByCountry = world.plantMarketDemand?.corporateOutputSupplyByCountry ?? {};
  const demandByCountry = world.plantMarketDemand?.corporateInputsByCountry ?? {};
  const governmentDemandByCountry = world.plantMarketDemand?.governmentDemandByCountry ?? {};
  const householdDemandByCountry = world.plantMarketDemand?.householdDemandByCountry ?? {};
  const countries = Object.keys(world.countries).sort();
  const commodities = new Set<CommodityType>();
  for (const leg of Object.values(supplyByCountry)) for (const commodity of Object.keys(leg)) commodities.add(commodity as CommodityType);
  for (const leg of Object.values(demandByCountry)) for (const commodity of Object.keys(leg)) commodities.add(commodity as CommodityType);
  for (const leg of Object.values(governmentDemandByCountry)) for (const commodity of Object.keys(leg)) commodities.add(commodity as CommodityType);
  for (const leg of Object.values(householdDemandByCountry)) for (const commodity of Object.keys(leg)) commodities.add(commodity as CommodityType);

  const valueByCountry = new Map<string, { exports: number; imports: number; partners: Map<string, number> }>();
  const flow: Record<string, Record<string, number>> = Object.fromEntries(countries.map((country) => [country, {}]));
  const byCommodity: Record<string, Record<string, Record<string, { units: number; value: number }>>> = {};
  for (const country of countries) valueByCountry.set(country, { exports: 0, imports: 0, partners: new Map() });

  for (const commodity of [...commodities].sort()) {
    const supply: Record<string, number> = {};
    const demand: Record<string, number> = {};
    for (const country of countries) {
      supply[country] = supplyByCountry[country]?.[commodity] ?? 0;
      demand[country] = (demandByCountry[country]?.[commodity] ?? 0) +
        (governmentDemandByCountry[country]?.[commodity] ?? 0) +
        (householdDemandByCountry[country]?.[commodity] ?? 0);
    }
    const result = clearCommodity({ countries, supply, demand, affinity: (a, b) => affinity(world, commodity, a, b) });
    byCommodity[commodity] = Object.fromEntries(countries.map(country => [country, {}]));
    const price = world.commodityPrices[commodity]?.globalPrice;
    const unitValue = typeof price === "number" && Number.isFinite(price) && price > 0 ? price : 0;
    for (const exporter of countries) {
      for (const [importer, units] of Object.entries(result.flow[exporter] ?? {})) {
        if (!(units > 0)) continue;
        const value = units * unitValue;
        flow[exporter]![importer] = (flow[exporter]![importer] ?? 0) + value;
        byCommodity[commodity]![exporter]![importer] = { units, value };
        const from = valueByCountry.get(exporter)!;
        const to = valueByCountry.get(importer)!;
        from.exports += value;
        to.imports += value;
        from.partners.set(importer, (from.partners.get(importer) ?? 0) + value);
        to.partners.set(exporter, (to.partners.get(exporter) ?? 0) + value);
      }
    }
  }

  world.corporateTradeSnapshot = {
    turn: world.meta.turn,
    byCountry: Object.fromEntries([...valueByCountry].map(([countryId, row]) => {
      const topPartner = [...row.partners.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
      return [countryId, { exports: row.exports, imports: row.imports, net: row.exports - row.imports, topPartner }];
    })),
    flow,
    byCommodity,
  };
}

export const corporateTradeSnapshotPhase: TurnPhase = {
  name: "corporateTradeSnapshot",
  run(world) {
    recordCorporateTradeSnapshot(world);
  },
};
