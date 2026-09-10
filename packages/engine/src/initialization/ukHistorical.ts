import type { SeedPack } from "@ahdclient/content";

/**
 * Fresh-world initialization choices. Existing saves do not carry this input
 * and are never reseeded while loading.
 */
export type WorldInitialization = "historical" | "founding";

export const DEFAULT_WORLD_INITIALIZATION: WorldInitialization = "founding";

const UK_SYNTHETIC_WINNER_ERAS = new Set(["1953", "1979"]);
const MAJOR_PARTY_WEIGHT = 45;
const BASELINE_PARTY_WEIGHT = 28;
const UK_PARTY_SEED_ORDER: Record<string, number> = {
  UK_LAB: 1,
  UK_CON: 2,
  UK_LD: 3,
  UK_SNP: 4,
  UK_PC: 5,
  UK_GRN: 6,
  UK_RUK: 7,
  UK_DUP: 8,
  UK_SF: 9,
  UK_UUP: 10,
  UK_LIB: 11,
};

interface WeightedEntry {
  key: string;
  weight: number;
}

/**
 * Port of AHDGame's allocateSeatsByWeights. Ties retain source insertion
 * order, which follows the source seed order carried by the Native pack
 * party ids.
 *
 * Reference: AHDGame src/lib/sim/backfillMissingSeats.ts, the pure largest
 * remainder allocator used by src/lib/seeds/proportionalChamberSeats.ts and
 * seedEconTierRostersForCountry(..., "winners").
 */
function allocateSeats(seats: number, entries: readonly WeightedEntry[]): Map<string, number> {
  const positive = entries.filter((entry) => entry.weight > 0).sort((left, right) => right.weight - left.weight);
  const totalWeight = positive.reduce((sum, entry) => sum + entry.weight, 0);
  const result = new Map<string, number>();
  if (seats <= 0 || totalWeight <= 0 || positive.length === 0) return result;

  let allocated = 0;
  const remainders: Array<{ key: string; remainder: number }> = [];
  for (const entry of positive) {
    const exact = (seats * entry.weight) / totalWeight;
    const floor = Math.floor(exact);
    if (floor > 0) result.set(entry.key, floor);
    allocated += floor;
    remainders.push({ key: entry.key, remainder: exact - floor });
  }

  remainders.sort((left, right) => right.remainder - left.remainder);
  for (let index = 0; allocated < seats; index++, allocated++) {
    const key = remainders[index % remainders.length]!.key;
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

function scaleRegions(
  regions: Array<{ id: string; seats: number }>,
  targetSeats: number,
): Array<{ id: string; seats: number }> {
  const positive = regions.filter((region) => region.seats > 0);
  if (targetSeats <= 0 || positive.length === 0) return [];

  const authoredTotal = positive.reduce((sum, region) => sum + region.seats, 0);
  if (authoredTotal === targetSeats) return positive.map((region) => ({ ...region }));

  const scaled = allocateSeats(
    targetSeats,
    positive.map((region) => ({ key: region.id, weight: region.seats })),
  );
  return positive
    .map((region) => ({ id: region.id, seats: scaled.get(region.id) ?? 0 }))
    .filter((region) => region.seats > 0);
}

/**
 * Returns the synthetic UK Commons composition used by AHDGame's standard
 * historical bootstrap for the two vacant Cold War presets. The source uses
 * region magnitude scaled to the configured chamber total, then gives the
 * first two default parties weight 45 and the remaining default parties
 * weight 28 in every region. This function returns null for authored seats,
 * non-UK eras, and founding-style empty starts.
 */
export function projectUkHistoricalCommonsComposition(pack: SeedPack): Record<string, number> | null {
  if (!UK_SYNTHETIC_WINNER_ERAS.has(pack.era.id)) return null;

  const legislature = pack.legislatures?.find((entry) => entry.countryId === "UK");
  const commons = legislature?.chambers.find((entry) => entry.key === "commons");
  if (!commons || !commons.elected) return null;

  const occupied = Object.values(commons.composition.seatsByParty).some((seats) => seats > 0);
  if (occupied || commons.composition.vacancies !== commons.seats) return null;

  const regions = (pack.states ?? [])
    .filter((state) => state.countryId === "UK" && state.houseSeats > 0)
    .map((state) => ({ id: state.id, seats: state.houseSeats }));
  const parties = (pack.parties ?? [])
    .map((party, packIndex) => ({ party, packIndex }))
    .filter(({ party }) => party.countryId === "UK")
    .sort(
      (left, right) =>
        (UK_PARTY_SEED_ORDER[left.party.id] ?? Number.MAX_SAFE_INTEGER) -
          (UK_PARTY_SEED_ORDER[right.party.id] ?? Number.MAX_SAFE_INTEGER) ||
        left.packIndex - right.packIndex,
    )
    .map(({ party }, index) => ({ key: party.id, weight: index < 2 ? MAJOR_PARTY_WEIGHT : BASELINE_PARTY_WEIGHT }));
  const scaledRegions = scaleRegions(regions, commons.seats);
  if (scaledRegions.length === 0 || parties.length === 0) return null;

  const composition: Record<string, number> = {};
  for (const region of scaledRegions) {
    const regionalSeats = allocateSeats(region.seats, parties);
    for (const [partyId, seats] of regionalSeats) {
      composition[partyId] = (composition[partyId] ?? 0) + seats;
    }
  }

  const totalAllocated = Object.values(composition).reduce((sum, seats) => sum + seats, 0);
  if (totalAllocated !== commons.seats) return null;
  return composition;
}
