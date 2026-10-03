import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import {
  TERRITORY_ADMISSIONS,
  buildAdmissionContent,
  decideAdmissions,
} from "../electionEngine/resolution/statehoodAdmission.js";
import { eraToPreset, getHouseSeats } from "../electionEngine/resolution/constants.js";

const SENATE_CLASSES_BY_ADMITTED_STATE: Record<string, [1 | 2 | 3, 1 | 2 | 3]> = {
  AK: [2, 3],
  HI: [1, 3],
};

// Current AHDGame 1953 registrationLanes1953 rows used by
// get1953USRegistrationSeed during admission. These overlay the pre-existing
// territorial political placeholders only after statehood.
const REGISTRATION_1953: Record<string, {
  parties: { abbr: "DEM" | "REP"; organization: number; registration: number }[];
  independent: number;
  unregistered: number;
}> = {
  AK: { parties: [{ abbr: "DEM", organization: 22, registration: 32 }, { abbr: "REP", organization: 22, registration: 30 }], independent: 24, unregistered: 14 },
  HI: { parties: [{ abbr: "DEM", organization: 34, registration: 50 }, { abbr: "REP", organization: 24, registration: 35 }], independent: 8, unregistered: 7 },
};

/**
 * Current AHDGame statehood phase, ported to the solo in-memory turn loop.
 * The source runs once per game year, rolls each still-territorial state from
 * its source CDF using the game iteration, stamps admittedYear and the one-seat
 * floor, then lets the ordinary census and perpetual-election phases consume
 * that new state. Native has no reset-iteration id, so the persisted world seed
 * is the stable per-world iteration key.
 */
export function processStatehoodAdmission(world: WorldState): void {
  // The source's gameState.preset is fixed at world creation while meta.era
  // advances. Persist that distinction; old saves infer 1953 territory status
  // from the source-seeded zero-seat regions.
  const preset = world.statehood?.startingPreset
    ?? (world.regions.AK?.countryId === "US" && world.regions.AK.houseSeats === 0
      ? "1953-default"
      : eraToPreset(world.meta.era));
  const currentYear = Number(world.meta.date.slice(0, 4));
  if (!Number.isFinite(currentYear)) return;
  if ((world.statehood?.lastEvaluatedYear ?? -Infinity) >= currentYear) return;

  if (!world.statehood) world.statehood = {};
  world.statehood.startingPreset = preset;
  world.statehood.lastEvaluatedYear = currentYear;

  const map = getHouseSeats(preset);
  const pending = TERRITORY_ADMISSIONS.filter((territory) => {
    const region = world.regions[territory.stateId];
    return region?.countryId === "US" && !(territory.stateId in map) && region.admittedYear === undefined;
  });
  const iteration = world.meta.seed || "default";
  const admitted = decideAdmissions(pending, currentYear, iteration);
  for (const decision of admitted) {
    const region = world.regions[decision.stateId];
    if (!region) continue;
    region.admittedYear = decision.year;
    region.houseSeats = 1;
    region.senateClasses = SENATE_CLASSES_BY_ADMITTED_STATE[decision.stateId] ?? [1, 2];
    const registration = REGISTRATION_1953[decision.stateId];
    if (registration) {
      const parties = Object.values(world.parties).filter((party) => party.countryId === "US");
      for (const row of registration.parties) {
        const party = parties.find((candidate) => candidate.abbreviation.toUpperCase() === row.abbr);
        if (!party) continue;
        const key = `${decision.stateId}:${party.id}`;
        const partyRegion = world.partyRegions[key] ?? {
          regionId: decision.stateId,
          partyId: party.id,
          countryId: "US",
          organization: 0,
          registration: 0,
        };
        partyRegion.organization = row.organization;
        partyRegion.registration = row.registration;
        world.partyRegions[key] = partyRegion;
      }
      world.electoratePools[decision.stateId] = {
        regionId: decision.stateId,
        countryId: "US",
        independent: registration.independent,
        unregistered: registration.unregistered,
      };
    }
  }
  if (admitted.length > 0) {
    world.news.push({
      turn: world.meta.turn,
      date: world.meta.date,
      headline: buildAdmissionContent(admitted),
      category: "Election",
      countryId: "US",
    });
  }
}

export const statehoodAdmissionPhase: TurnPhase = {
  name: "statehoodAdmission",
  run(world) {
    processStatehoodAdmission(world);
  },
};
