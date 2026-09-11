import type { Country, WorldState } from "../types.js";
import type { ReferendumRecord } from "./types.js";

export type ReferendumActuationResult =
  { ok: true; targetCountryId: string } | { ok: false; reason: string };

const INDEPENDENT_COUNTRY_NAMES: Record<string, string> = {
  SCO: "Scotland",
  WAL: "Wales",
};

function regionPopulation(world: WorldState, regionId: string): number {
  return Math.max(0, world.regions[regionId]?.population ?? 0);
}

function countryPopulation(world: WorldState, countryId: string): number {
  return Object.values(world.regions)
    .filter((region) => region.countryId === countryId)
    .reduce((sum, region) => sum + regionPopulation(world, region.id), 0);
}

function makeIndependentCountry(
  world: WorldState,
  ref: ReferendumRecord,
): Country {
  const source = world.countries[ref.countryId]!;
  const region = world.regions[ref.regionId]!;
  const sourcePopulation = countryPopulation(world, ref.countryId);
  const share =
    sourcePopulation > 0 && regionPopulation(world, ref.regionId) > 0
      ? regionPopulation(world, ref.regionId) / sourcePopulation
      : 1 /
        Math.max(
          1,
          Object.values(world.regions).filter(
            (candidate) => candidate.countryId === ref.countryId,
          ).length,
        );
  const gdp = region.gdp ?? source.economy.gdp * share;

  return {
    id: ref.regionId,
    name: INDEPENDENT_COUNTRY_NAMES[ref.regionId] ?? region.name,
    playable: true,
    economy: {
      ...source.economy,
      gdp,
    },
  };
}

function rescopeRegionRecords(
  world: WorldState,
  regionId: string,
  targetCountryId: string,
): void {
  const pool = world.electoratePools[regionId];
  if (pool) pool.countryId = targetCountryId;

  const turnout = world.regionTurnouts[regionId];
  if (turnout) turnout.countryId = targetCountryId;

  const regionalBudget = world.regionalBudgets[regionId];
  if (regionalBudget) regionalBudget.countryId = targetCountryId;

  const demographics = world.stateDemographics[regionId];
  if (demographics) demographics.countryId = targetCountryId;
  const baseline = world.baselineDemographics[regionId];
  if (baseline) baseline.countryId = targetCountryId;

  for (const partyRegion of Object.values(world.partyRegions)) {
    if (partyRegion.regionId === regionId)
      partyRegion.countryId = targetCountryId;
  }
  for (const pressure of Object.values(world.partyPressures)) {
    if (pressure.regionId === regionId) pressure.countryId = targetCountryId;
  }
  for (const support of Object.values(world.candidateSupports)) {
    if (support.regionId === regionId) support.countryId = targetCountryId;
  }
}

function movePlayerIfResident(
  world: WorldState,
  regionId: string,
  targetCountryId: string,
): void {
  if (world.player.homeRegionId !== regionId) return;
  world.player.countryId = targetCountryId;
  // A seat and party charter from the former sovereign cannot be carried into
  // the new legislature. The source evacuates those political artifacts; the
  // player must re-enter the new country's political system.
  world.player.partyId = null;
  world.player.partyJoinedTurn = null;
  world.player.legislativeSeat = null;
  world.player.hosPartyId = null;
}

/**
 * Apply the in-memory consequence of a passed, consented referendum.
 *
 * This is deliberately idempotent: a retry after a persisted completion sees
 * the region already owned by the target and returns success without cloning
 * countries or mutating the player a second time.
 */
export function applyReferendumActuation(
  world: WorldState,
  ref: ReferendumRecord,
): ReferendumActuationResult {
  const region = world.regions[ref.regionId];
  if (!region)
    return { ok: false, reason: `Unknown referendum region ${ref.regionId}.` };

  let targetCountryId: string;
  if (ref.kind === "independence") {
    if (ref.regionId !== "SCO" && ref.regionId !== "WAL") {
      return {
        ok: false,
        reason: `Independence is unsupported for ${ref.regionId}.`,
      };
    }
    targetCountryId = ref.regionId;
    if (!world.countries[targetCountryId]) {
      if (!world.countries[ref.countryId]) {
        return {
          ok: false,
          reason: `Source country ${ref.countryId} is unavailable.`,
        };
      }
      world.countries[targetCountryId] = makeIndependentCountry(world, ref);
    }
  } else {
    targetCountryId = ref.targetCountryId ?? "IE";
    if (!world.countries[targetCountryId]) {
      return {
        ok: false,
        reason: `Target country ${targetCountryId} is unavailable.`,
      };
    }
  }

  if (region.countryId === targetCountryId) {
    movePlayerIfResident(world, ref.regionId, targetCountryId);
    return { ok: true, targetCountryId };
  }

  if (region.countryId !== ref.countryId) {
    return {
      ok: false,
      reason: `Region ${ref.regionId} belongs to ${region.countryId}, not ${ref.countryId}.`,
    };
  }

  region.countryId = targetCountryId;
  if (ref.kind === "reunification") region.name = "Ulster";
  rescopeRegionRecords(world, ref.regionId, targetCountryId);
  movePlayerIfResident(world, ref.regionId, targetCountryId);
  return { ok: true, targetCountryId };
}
