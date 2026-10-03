import type { WorldState } from "../types.js";
import { getUkCommonsSeats, eraToPreset } from "../electionEngine/resolution/constants.js";
import { heldSeatCount } from "../government/seatWeights.js";
import type { ElectionRecord } from "./types.js";

export const UK_COMMONS_BY_ELECTION_FILING_TURNS = 24;
export const UK_COMMONS_BY_ELECTION_GENERAL_TURNS = 24;
export const UK_COMMONS_BY_ELECTION_RETRY_COOLDOWN_TURNS = 48;
export const UK_COMMONS_BY_ELECTION_TOTAL_TURNS = UK_COMMONS_BY_ELECTION_FILING_TURNS + UK_COMMONS_BY_ELECTION_GENERAL_TURNS;

export type CommonsByElectionGate =
  | { kind: "spawn" }
  | { kind: "special_live" }
  | { kind: "general_fills"; endTurn: number | null }
  | { kind: "cooldown"; retryTurn: number };

/** Game commonsByElectionGate: the watcher and player projection share one decision. */
export function commonsByElectionGate(input: {
  liveRaces: ReadonlyArray<{ electionType: string; endTurn?: number }>;
  lastSpecialEndTurn: number | undefined;
  currentTurn: number;
}): CommonsByElectionGate {
  const { liveRaces, lastSpecialEndTurn, currentTurn } = input;
  if (liveRaces.some((race) => race.electionType === "special_commons")) return { kind: "special_live" };
  const filling = liveRaces.filter((race) => typeof race.endTurn !== "number" || race.endTurn <= currentTurn + UK_COMMONS_BY_ELECTION_TOTAL_TURNS);
  if (filling.length > 0) {
    const ends = filling.flatMap((race) => typeof race.endTurn === "number" ? [race.endTurn] : []);
    return { kind: "general_fills", endTurn: ends.length > 0 ? Math.min(...ends) : null };
  }
  if (lastSpecialEndTurn !== undefined && lastSpecialEndTurn > currentTurn - UK_COMMONS_BY_ELECTION_RETRY_COOLDOWN_TURNS) {
    return { kind: "cooldown", retryTurn: lastSpecialEndTurn + UK_COMMONS_BY_ELECTION_RETRY_COOLDOWN_TURNS };
  }
  return { kind: "spawn" };
}

/** Native's national snap record also covers every regional Commons delegation. */
export function ukCommonsByElectionGate(world: WorldState, regionId: string): CommonsByElectionGate {
  const races = world.elections.filter((race) => race.countryId === "UK"
    && (race.state === regionId || (race.electionType === "snap_commons" && race.state === undefined))
    && ["commons", "snap_commons", "special_commons"].includes(race.electionType));
  const finishedEnds = races.filter((race) => race.electionType === "special_commons"
    && race.status !== "active" && race.status !== "upcoming")
    .flatMap((race) => typeof race.endTurn === "number" ? [race.endTurn] : []);
  return commonsByElectionGate({
    liveRaces: races.filter((race) => race.status === "active" || race.status === "upcoming"),
    lastSpecialEndTurn: finishedEnds.length > 0 ? Math.max(...finishedEnds) : undefined,
    currentTurn: world.meta.turn,
  });
}

export type UkCommonsVacancyStatus = "open" | "scheduled" | "filled" | "subsumed";

export interface UkCommonsVacancy {
  id: string;
  countryId: "UK";
  regionId: string;
  formerHolderId: string;
  /** Source vacancy.seats preserves the departed regional office weight. */
  seats?: number;
  reason: "death" | "retirement" | "defection" | "resignation" | "recall" | "removal";
  vacatedTurn: number;
  status: UkCommonsVacancyStatus;
  electionId?: string;
  filledById?: string;
  filledTurn?: number;
}

function hasActiveCandidacy(world: WorldState): boolean {
  return world.elections.some((election) =>
    election.status !== "resolved" && election.status !== "cancelled" &&
    election.candidates.some((candidate) => candidate.id === "player" && candidate.status !== "withdrawn"),
  );
}

export function vacatePlayerCommonsSeat(
  world: WorldState,
  reason: "resignation" | "defection",
): { ok: true; vacancy: UkCommonsVacancy } | { ok: false; error: string } {
  const seat = world.player.legislativeSeat;
  if (!seat || seat.countryId !== "UK" || seat.chamberKey !== "commons") {
    return { ok: false, error: "You do not hold a UK Commons seat." };
  }
  const regionId = seat.regionId;
  if (!regionId) return { ok: false, error: "Your Commons seat has no recorded regional office." };
  if (hasActiveCandidacy(world)) return { ok: false, error: "Cannot leave the Commons while actively running in an election." };
  const vacancies = world.ukCommonsVacancies ?? (world.ukCommonsVacancies = []);
  const existing = vacancies.find((vacancy) => vacancy.formerHolderId === "player" && vacancy.status === "open");
  if (existing) return { ok: false, error: "This Commons office already has an open vacancy." };
  const vacancy: UkCommonsVacancy = {
    id: `commons-vacancy:${regionId}:player:${world.meta.turn}:${reason}`,
    countryId: "UK",
    regionId,
    formerHolderId: "player",
    seats: heldSeatCount(seat),
    reason,
    vacatedTurn: world.meta.turn,
    status: "open",
  };
  vacancies.push(vacancy);
  world.player.legislativeSeat = null;
  return { ok: true, vacancy };
}

/** Public source counterpart to resignCommonsSeat. */
export function resignUkCommonsSeat(world: WorldState): { ok: true; vacancy: UkCommonsVacancy } | { ok: false; error: string } {
  return vacatePlayerCommonsSeat(world, "resignation");
}

/** Source counterpart to defectCommonsSeat: change party and vacate the exact held office. */
export function validateUkCommonsDefection(world: WorldState, toPartyId: string): { ok: true } | { ok: false; error: string } {
  const seat = world.player.legislativeSeat;
  if (!seat || seat.countryId !== "UK" || seat.chamberKey !== "commons" || !seat.regionId) {
    return { ok: false, error: "You do not hold a UK Commons seat." };
  }
  const target = world.parties[toPartyId];
  if (!target || target.countryId !== "UK") return { ok: false, error: "Choose an existing UK party." };
  if (toPartyId === world.player.partyId) return { ok: false, error: "Choose a different party to defect to." };
  if (hasActiveCandidacy(world)) return { ok: false, error: "Cannot defect while actively running in an election." };
  if (world.ukCommonsVacancies?.some((vacancy) => vacancy.formerHolderId === "player" && vacancy.status === "open")) {
    return { ok: false, error: "This Commons office already has an open vacancy." };
  }

  return { ok: true };
}

/** Retired seated NPPs have a source-held office; tombstone it and preserve its exact weight. */
export function vacateRetiredUkCommonsOfficials(world: WorldState): number {
  let vacated = 0;
  const vacancies = world.ukCommonsVacancies ?? (world.ukCommonsVacancies = []);
  for (const politician of world.politicians) {
    if (politician.countryId !== "UK" || politician.chamberKey !== "commons" || politician.retiredAt == null || !politician.electedState) continue;
    if (vacancies.some((vacancy) => vacancy.formerHolderId === politician.id)) continue;
    const regionId = politician.electedState;
    vacancies.push({
      id: `commons-vacancy:${regionId}:${politician.id}:${world.meta.turn}:retirement`,
      countryId: "UK",
      regionId,
      formerHolderId: politician.id,
      seats: heldSeatCount(politician),
      reason: "retirement",
      vacatedTurn: world.meta.turn,
      status: "open",
    });
    politician.chamberKey = "";
    politician.electedState = undefined;
    delete politician.seatsHeld;
    vacated += 1;
  }
  if (vacated === 0 && vacancies.length === 0) delete world.ukCommonsVacancies;
  return vacated;
}

export function closeUkCommonsVacancies(world: WorldState, vacancyIds: readonly string[], soleWinnerId?: string): void {
  for (const vacancy of world.ukCommonsVacancies ?? []) {
    if (vacancy.status !== "open" && vacancy.status !== "scheduled") continue;
    if (!vacancyIds.includes(vacancy.id)) continue;
    vacancy.status = "filled";
    if (soleWinnerId) vacancy.filledById = soleWinnerId;
    vacancy.filledTurn = world.meta.turn;
    delete vacancy.electionId;
  }
}

/** Source snap dissolutions cancel live UK Commons specials and reopen their claimed vacancies. */
export function cancelUkCommonsSpecialsForSnap(world: WorldState, countryId: string, chamberKey: string): void {
  if (countryId !== "UK" || chamberKey !== "commons") return;
  const cancelled = new Set<string>();
  for (const election of world.elections) {
    if (election.countryId !== "UK" || election.electionType !== "special_commons" || (election.status !== "active" && election.status !== "upcoming")) continue;
    election.status = "cancelled";
    cancelled.add(election.id);
  }
  for (const vacancy of world.ukCommonsVacancies ?? []) {
    if (vacancy.status === "scheduled" && vacancy.electionId && cancelled.has(vacancy.electionId)) {
      vacancy.status = "open";
      delete vacancy.electionId;
    }
  }
}

/** Native equivalent of the source's shared status/watcher gate for UK vacancies. */
export function scheduleUkCommonsByElections(world: WorldState): void {
  const vacancies = world.ukCommonsVacancies;
  if (!vacancies?.length || world.meta.preIteration?.active === true) return;
  for (const vacancy of vacancies) {
    if (vacancy.status !== "scheduled" || !vacancy.electionId) continue;
    const election = world.elections.find((candidate) => candidate.id === vacancy.electionId);
    if (!election || election.status === "cancelled") {
      vacancy.status = "open";
      delete vacancy.electionId;
    }
  }
  const seatsByRegion = getUkCommonsSeats(eraToPreset(world.meta.era));
  const openByRegion = new Map<string, UkCommonsVacancy[]>();
  for (const vacancy of vacancies) {
    if (vacancy.status !== "open") continue;
    const rows = openByRegion.get(vacancy.regionId) ?? [];
    rows.push(vacancy);
    openByRegion.set(vacancy.regionId, rows);
  }
  for (const [regionId, rows] of [...openByRegion.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (ukCommonsByElectionGate(world, regionId).kind !== "spawn") continue;
    const regionSeats = seatsByRegion[regionId] ?? 0;
    if (regionSeats < 1) continue;
    const vacancyIds = rows.map((vacancy) => vacancy.id).sort();
    const vacancySeats = rows.reduce((total, vacancy) => total + Math.max(1, vacancy.seats ?? 1), 0);
    const primaryEndTurn = world.meta.turn + UK_COMMONS_BY_ELECTION_FILING_TURNS;
    const id = `special_commons:UK:${regionId}:c${world.meta.turn}`;
    const rec: ElectionRecord = {
      id,
      electionType: "special_commons",
      countryId: "UK",
      state: regionId,
      vacancyIds,
      byElectionCarve: Math.min(1, vacancySeats / regionSeats),
      cycle: world.meta.turn,
      status: "active",
      startTurn: world.meta.turn,
      primaryEndTurn,
      endTurn: primaryEndTurn + UK_COMMONS_BY_ELECTION_GENERAL_TURNS,
      totalSeats: vacancySeats,
      chamberKey: "commons",
      candidates: [],
      tally: {},
    };
    world.elections.push(rec);
    for (const vacancy of rows) {
      vacancy.status = "scheduled";
      vacancy.electionId = id;
    }
  }
}
