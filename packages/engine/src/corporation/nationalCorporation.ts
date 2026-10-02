import type { WorldState } from "../types.js";
import type { Corporation, CorporationType } from "./types.js";
import { CORPORATION_TYPES } from "./types.js";
import { DEFAULT_PROFIT_MARGIN } from "./constants.js";

/** Source national identity names for the supported country roster. */
const NATIONAL_NAMES: Readonly<Record<string, string>> = {
  US: "United States National Corporation", UK: "United Kingdom National Corporation",
  DE: "Germany National Corporation", CN: "China National Corporation",
  IE: "Ireland National Corporation", JP: "Japan National Corporation",
  RU: "All-Union State Enterprise", DD: "Volkseigener Betrieb",
  BR: "Brazil National Corporation", NG: "Nigeria National Corporation",
  HU: "Hungarian State Holdings", PL: "Polish State Holdings", RO: "Romanian State Holdings",
  YU: "Yugoslav Social Enterprise", BG: "Bulgarian State Holdings", BLR: "Byelorussian State Enterprise",
  UKR: "Ukrainian State Enterprise", CS: "Czechoslovak State Enterprise", BAL: "Baltic State Enterprise",
  FR: "French State Enterprise", IT: "Italian State Holdings", ES: "Spanish State Enterprise",
  SE: "Swedish State Enterprise", TR: "Turkish State Enterprise", GR: "Hellenic State Enterprise",
  AT: "Austrian State Industries", FI: "Finnish State Company",
  SCO: "Scotland National Corporation", WAL: "Wales National Corporation",
};

/** Source primary preference, with the unchanged pre-backfill owner fallback. */
export function primaryNationalCorporation(world: WorldState, countryId: string): Corporation | undefined {
  const owned = Object.values(world.corporations)
    .filter(corporation => corporation.countryOwnerId === countryId)
    .sort((a, b) => a.id.localeCompare(b.id));
  return owned.find(corporation => corporation.isPrimaryNationalCorporation === true) ?? owned[0];
}

/** Called by ownership commands only; register queries never create an issuer. */
export function ensurePrimaryNationalCorporation(world: WorldState, countryId: string): Corporation {
  if (!world.countries[countryId]) throw new Error(`Unknown country: ${countryId}`);
  const existing = primaryNationalCorporation(world, countryId);
  if (existing) return existing;
  const id = `NAT-${countryId}`;
  if (world.corporations[id]) throw new Error("The National Corporation identity is occupied by a private issuer.");
  const corporation = buildNationalCorporation(world, countryId, id);
  world.corporations[id] = corporation;
  return corporation;
}

/** Source fresh holding-company identity, also used by producing split-offs. */
export function buildNationalCorporation(world: WorldState, countryId: string, id: string): Corporation {
  if (!world.countries[countryId]) throw new Error(`Unknown country: ${countryId}`);
  return {
    id, name: NATIONAL_NAMES[countryId] ?? `${world.countries[countryId]!.name} National Corporation`,
    countryId, countryOwnerId: countryId, ownershipState: "stateOwned",
    isNationalCorporation: true, isPrimaryNationalCorporation: true, assignedSectorTypes: [],
    sectorType: "financial", ceoVacant: true, ceoVotes: [],
    personality: { ambition: 0, stubbornness: 0 }, archetype: "cautious",
    revenue: 0, targetGrowthRate: 0, currentGrowthRate: 0, currentGrowthCost: 0,
    profitMargin: DEFAULT_PROFIT_MARGIN, effectiveProfitMargin: DEFAULT_PROFIT_MARGIN,
    liquidCapital: 0, foundingRevenue: 0, foundedAtTurn: world.meta.turn,
    insolventSinceTurn: null, reincorporationCount: 0,
    tickerSymbol: `NAT${countryId}`, totalShares: 0, sharePrice: 1,
    fundamentalSharePrice: 1, shareholders: [], publicFloat: 0,
    earningsHistory: [], priceHistory: [], ceoSalaryPerTurn: 0, dividendRate: 0,
  };
}

/** Source split-off assignment takes precedence over the primary remainder. */
export function resolveNationalCorporationForSector(world: WorldState, countryId: string, sectorType: CorporationType): Corporation {
  return Object.values(world.corporations).find(corporation =>
    corporation.countryOwnerId === countryId && corporation.assignedSectorTypes?.includes(sectorType),
  ) ?? ensurePrimaryNationalCorporation(world, countryId);
}

export function validateNationalCorporations(world: WorldState): void {
  const primaryCountries = new Set<string>();
  for (const corporation of Object.values(world.corporations)) {
    if (corporation.isPrimaryNationalCorporation !== undefined) {
      if (typeof corporation.isPrimaryNationalCorporation !== "boolean" ||
          !corporation.countryOwnerId || corporation.countryOwnerId !== corporation.countryId) {
        throw new Error(`Invalid primary National Corporation: ${corporation.id}`);
      }
      if (corporation.isPrimaryNationalCorporation) {
        if (primaryCountries.has(corporation.countryOwnerId)) throw new Error("Multiple primary National Corporations in one country");
        primaryCountries.add(corporation.countryOwnerId);
      }
    }
    if (corporation.assignedSectorTypes !== undefined &&
        (!Array.isArray(corporation.assignedSectorTypes) ||
         corporation.assignedSectorTypes.some(type => !CORPORATION_TYPES.includes(type)) ||
         new Set(corporation.assignedSectorTypes).size !== corporation.assignedSectorTypes.length)) {
      throw new Error(`Invalid National Corporation sector assignments: ${corporation.id}`);
    }
  }
}
