import type { WorldState } from "../types.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";

type Seed = { id: string; name: string; population: number; gdp: number; houseSeats: number; censusRegion: string };

/** AHDGame 01797b27082b098fdf3929bb498215c94c8dda24 scoRegions.ts. */
const SCOTLAND: Seed[] = [
  { id: "GLA", name: "Greater Glasgow", population: 1_160_000, gdp: 35_000, houseSeats: 28, censusRegion: "Central Belt" },
  { id: "LOT", name: "Edinburgh & the Lothians", population: 900_000, gdp: 40_000, houseSeats: 21, censusRegion: "Central Belt" },
  { id: "HIG", name: "Highlands & Islands", population: 470_000, gdp: 11_000, houseSeats: 11, censusRegion: "Highlands" },
  { id: "GRA", name: "North East Scotland", population: 590_000, gdp: 26_000, houseSeats: 14, censusRegion: "North East" },
  { id: "TAY", name: "Tayside & Fife", population: 810_000, gdp: 20_000, houseSeats: 19, censusRegion: "East" },
  { id: "STH", name: "South Scotland", population: 700_000, gdp: 14_000, houseSeats: 16, censusRegion: "South" },
  { id: "CSC", name: "Central Scotland", population: 810_000, gdp: 17_000, houseSeats: 20, censusRegion: "Central Belt" },
];

/** AHDGame 01797b27082b098fdf3929bb498215c94c8dda24 walRegions.ts. */
const WALES: Seed[] = [
  { id: "CDF", name: "Cardiff & South East", population: 1_050_000, gdp: 28_000, houseSeats: 20, censusRegion: "South Wales" },
  { id: "SWA", name: "Swansea & South West", population: 700_000, gdp: 15_000, houseSeats: 13, censusRegion: "South Wales" },
  { id: "VAL", name: "The Valleys", population: 600_000, gdp: 11_000, houseSeats: 11, censusRegion: "South Wales" },
  { id: "MWA", name: "Mid Wales", population: 210_000, gdp: 5_000, houseSeats: 4, censusRegion: "Mid Wales" },
  { id: "NWW", name: "North West Wales", population: 330_000, gdp: 8_000, houseSeats: 6, censusRegion: "North Wales" },
  { id: "NEW", name: "North East Wales", population: 280_000, gdp: 7_000, houseSeats: 6, censusRegion: "North Wales" },
];

const SEEDS: Record<string, Seed[]> = { SCO: SCOTLAND, WAL: WALES };

/** Greedy, descending-revenue GDP partition from AHDGame secede/apportion.ts. */
function partitionByGdp<T>(items: T[], qty: (item: T) => number, seeds: Seed[]): Map<string, T[]> {
  const gdpTotal = seeds.reduce((sum, seed) => sum + (seed.gdp ?? 0), 0);
  const quantityTotal = items.reduce((sum, item) => sum + qty(item), 0);
  const target = new Map(seeds.map((seed) => [seed.id, quantityTotal * ((seed.gdp ?? 0) / gdpTotal)]));
  const have = new Map(seeds.map((seed) => [seed.id, 0]));
  const buckets = new Map(seeds.map((seed) => [seed.id, [] as T[]]));
  for (const item of [...items].sort((a, b) => qty(b) - qty(a))) {
    let bestId = seeds[0]!.id;
    let bestGap = -Infinity;
    for (const seed of seeds) {
      const gap = target.get(seed.id)! - have.get(seed.id)!;
      if (gap > bestGap) {
        bestGap = gap;
        bestId = seed.id;
      }
    }
    buckets.get(bestId)!.push(item);
    have.set(bestId, have.get(bestId)! + qty(item));
  }
  return buckets;
}

/**
 * Expand the source aggregate region only after its successful independence
 * actuation. Corporate-sector assets and explicitly region-scoped unowned
 * pools are partitioned as separate collections. Native's GDP-derived
 * aggregate-to-parent adaptation runs when the world is seeded; this event
 * only applies the source fan-out to those existing parent-scoped records.
 */
export function expandSecededSectorRegions(world: WorldState, countryId: "SCO" | "WAL", sourceCountryId: string): void {
  const seeds = SEEDS[countryId];
  if (!seeds) return;
  if (world.regions[seeds[0]!.id]) return;
  const seedGdpTotal = seeds.reduce((sum, row) => sum + (row.gdp ?? 0), 0);

  for (const seed of seeds) {
    world.regions[seed.id] = {
      id: seed.id,
      countryId,
      name: seed.name,
      sourceCountryId,
      population: seed.population,
      gdp: seed.gdp,
      houseSeats: seed.houseSeats,
      senateSeats: 0,
      censusRegion: seed.censusRegion,
    };
    world.capitalStock[seed.id] = (world.capitalStock[countryId] ?? 0) * ((seed.gdp ?? 0) / seedGdpTotal);
  }
  for (const asset of Object.values(world.corporateSectors ?? {}).filter((row) => row.stateId === countryId)) {
    asset.countryId = countryId;
    asset.representingUnionId = world.unions[`${countryId}-${asset.sectorType}`]?.id ?? null;
  }
  corporateSectorAssets(world);
  const assetRows = Object.values(world.corporateSectors ?? {}).filter((asset) => asset.stateId === countryId);
  const byAssets = partitionByGdp(assetRows, (asset) => Math.max(0, asset.revenue ?? world.corporations[asset.corporationId]?.revenue ?? 0), seeds);
  for (const [regionId, rows] of byAssets) {
    for (const asset of rows) {
      asset.countryId = countryId;
      asset.stateId = regionId;
      const successorUnion = world.unions[`${countryId}-${asset.sectorType}`];
      asset.representingUnionId = successorUnion ? successorUnion.id : null;
    }
  }

  const regionalPools = Object.entries(world.unownedSectors).filter(([, pool]) => pool.regionId === countryId);
  const byPools = partitionByGdp(regionalPools, ([, pool]) => Math.max(0, pool.revenue), seeds);
  for (const [regionId, rows] of byPools) {
    for (const [oldKey, pool] of rows) {
      delete world.unownedSectors[oldKey];
      const newKey = `${countryId}:${regionId}:${pool.sectorType}`;
      const existing = world.unownedSectors[newKey];
      world.unownedSectors[newKey] = {
        countryId,
        regionId,
        sectorType: pool.sectorType,
        revenue: (existing?.revenue ?? 0) + pool.revenue,
      };
    }
  }

  // The original nation-region is an aggregate, not a second region after
  // expansion. Preserve the saved, intensive references by re-homing them to
  // the source capital (LOT / CDF), matching SECEDE_FANOUT's rehomeCapital.
  const capital = countryId === "SCO" ? "LOT" : "CDF";
  if (world.player.homeRegionId === countryId) world.player.homeRegionId = capital;
  if (world.electoratePools[countryId]) {
    world.electoratePools[capital] = { ...world.electoratePools[countryId]!, regionId: capital, countryId };
    delete world.electoratePools[countryId];
  }
  if (world.regionTurnouts[countryId]) {
    world.regionTurnouts[capital] = { ...world.regionTurnouts[countryId]!, regionId: capital, countryId };
    delete world.regionTurnouts[countryId];
  }
  delete world.regions[countryId];
  delete world.capitalStock[countryId];
}
