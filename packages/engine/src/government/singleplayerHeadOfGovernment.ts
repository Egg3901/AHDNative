import type { WorldState } from "../types.js";
import { EXECUTIVE_OFFICE_BY_COUNTRY } from "../actions/officeRegistry.js";
import { GOVERNMENT_CHAMBER_BY_COUNTRY, INITIAL_CONFIDENCE, majorityThreshold } from "./constants.js";
import type { GovernmentState } from "./types.js";

/**
 * Source-backed identity predicate for the local permanent HoS. The player
 * projection is accepted only when it agrees with the canonical country
 * executive office and the correct executive or government record.
 */
export function isRecordedSingleplayerHeadOfGovernment(world: WorldState, countryId: string): boolean {
  const player = world.player;
  const officeType = EXECUTIVE_OFFICE_BY_COUNTRY[countryId];
  if (
    player.mode !== "hos" ||
    player.permanentHeadOfState !== true ||
    player.countryId !== countryId ||
    player.currentOffice?.countryId !== countryId ||
    player.currentOffice.type !== officeType
  ) {
    return false;
  }

  if (officeType === "president") return world.executives[countryId]?.presidentId === "player";

  const chamberKey = GOVERNMENT_CHAMBER_BY_COUNTRY[countryId];
  const government = world.governments[countryId];
  return Boolean(
    chamberKey &&
      government?.status === "formed" &&
      government.chamberKey === chamberKey &&
      government.pmPoliticianId === "player",
  );
}

/**
 * Materialize the source's seated HoS in Native's canonical government
 * formation record. Game creates a pending formation and appoints its pinned
 * HoS directly; Native has one persisted government state per country, so the
 * same result is represented as a formed record with the live chamber snapshot.
 */
export function seatSingleplayerHeadOfGovernment(world: WorldState): void {
  const countryId = world.player.countryId;
  const officeType = EXECUTIVE_OFFICE_BY_COUNTRY[countryId];
  const chamberKey = GOVERNMENT_CHAMBER_BY_COUNTRY[countryId];
  if (
    world.player.mode !== "hos" ||
    world.player.permanentHeadOfState !== true ||
    !officeType ||
    officeType === "president" ||
    world.player.currentOffice?.countryId !== countryId ||
    world.player.currentOffice.type !== officeType ||
    !chamberKey
  ) {
    return;
  }

  const chamber = world.legislatures[countryId]?.chambers.find((candidate) => candidate.key === chamberKey);
  if (!chamber) return;

  const seatsByParty = { ...chamber.composition.seatsByParty };
  const prior = world.governments[countryId];
  const pluralityPartyId = Object.entries(seatsByParty)
    .filter(([, seats]) => seats > 0)
    .sort(([partyA, seatsA], [partyB, seatsB]) => seatsB - seatsA || partyA.localeCompare(partyB))[0]?.[0]
    ?? null;
  const rulingPartyId = Object.values(world.parties)
    .find((party) => party.countryId === countryId && party.regimeStatus === "ruling")?.id ?? null;
  const governingPartyId = prior?.governingPartyId ?? pluralityPartyId ?? world.player.partyId ?? world.player.hosPartyId ?? rulingPartyId;

  const totalSeats = chamber.seats;
  const majority = majorityThreshold(totalSeats);
  const totalSeatsSupporting = governingPartyId ? (seatsByParty[governingPartyId] ?? 0) : 0;
  const government: GovernmentState = {
    countryId,
    chamberKey,
    status: "formed",
    formationType: governingPartyId
      ? (totalSeatsSupporting >= majority ? "majority" : "minority")
      : "admin",
    governingPartyId,
    coalitionPartyIds: null,
    pmPoliticianId: "player",
    totalSeatsSupporting,
    majorityThreshold: majority,
    totalSeats,
    seatsByParty,
    lostMajority: false,
    formedTurn: prior?.formedTurn ?? world.meta.turn,
    snapElectionsUsed: prior?.snapElectionsUsed ?? 0,
    lastSnapElectionTurn: prior?.lastSnapElectionTurn ?? null,
    pmVacancyDeadlineTurn: null,
    confidence: prior?.status === "formed" && prior.pmPoliticianId === "player"
      ? prior.confidence
      : INITIAL_CONFIDENCE,
  };
  world.governments[countryId] = government;
}
