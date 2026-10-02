import type { WorldState } from "../types.js";
import { getUkCommonsSeats, eraToPreset } from "../electionEngine/resolution/constants.js";
import type { ElectionRecord } from "./types.js";

export const UK_COMMONS_BY_ELECTION_FILING_TURNS = 24;
export const UK_COMMONS_BY_ELECTION_GENERAL_TURNS = 24;
export const UK_COMMONS_BY_ELECTION_RETRY_COOLDOWN_TURNS = 48;
export const UK_COMMONS_BY_ELECTION_TOTAL_TURNS = UK_COMMONS_BY_ELECTION_FILING_TURNS + UK_COMMONS_BY_ELECTION_GENERAL_TURNS;

export type UkCommonsVacancyStatus = "open" | "scheduled" | "filled" | "subsumed";

export interface UkCommonsVacancy {
  id: string;
  countryId: "UK";
  regionId: string;
  formerHolderId: string;
  reason: "resignation";
  vacatedTurn: number;
  status: UkCommonsVacancyStatus;
  electionId?: string;
  filledById?: string;
  filledTurn?: number;
}

/** The only live departure producer in Native is the player's public resignation action. */
export function resignUkCommonsSeat(world: WorldState): { ok: true; vacancy: UkCommonsVacancy } | { ok: false; error: string } {
  const seat = world.player.legislativeSeat;
  if (!seat || seat.countryId !== "UK" || seat.chamberKey !== "commons") {
    return { ok: false, error: "You do not hold a UK Commons seat." };
  }
  const regionId = seat.regionId;
  if (!regionId) return { ok: false, error: "Your Commons seat has no recorded regional office." };
  const vacancies = world.ukCommonsVacancies ?? (world.ukCommonsVacancies = []);
  const existing = vacancies.find((vacancy) => vacancy.formerHolderId === "player" && vacancy.status === "open");
  if (existing) return { ok: false, error: "This Commons office already has an open vacancy." };
  const vacancy: UkCommonsVacancy = {
    id: `commons-vacancy:${regionId}:player:${world.meta.turn}`,
    countryId: "UK",
    regionId,
    formerHolderId: "player",
    reason: "resignation",
    vacatedTurn: world.meta.turn,
    status: "open",
  };
  vacancies.push(vacancy);
  world.player.legislativeSeat = null;
  return { ok: true, vacancy };
}

export function closeUkCommonsVacancies(world: WorldState, vacancyIds: readonly string[], winnerByVacancy: ReadonlyMap<string, string>): void {
  for (const vacancy of world.ukCommonsVacancies ?? []) {
    if (vacancy.status !== "open" && vacancy.status !== "scheduled") continue;
    if (!vacancyIds.includes(vacancy.id)) continue;
    const winner = winnerByVacancy.get(vacancy.id);
    vacancy.status = winner ? "filled" : "open";
    if (winner) { vacancy.filledById = winner; vacancy.filledTurn = world.meta.turn; }
    delete vacancy.electionId;
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
    const existingSpecial = world.elections.find((election) => election.countryId === "UK" && election.electionType === "special_commons" && election.state === regionId && (election.status === "active" || election.status === "upcoming"));
    if (existingSpecial) {
      for (const vacancy of rows) {
        if (existingSpecial.vacancyIds?.includes(vacancy.id)) continue;
        existingSpecial.vacancyIds = [...(existingSpecial.vacancyIds ?? []), vacancy.id];
        existingSpecial.totalSeats += 1;
        vacancy.status = "scheduled";
        vacancy.electionId = existingSpecial.id;
      }
      continue;
    }
    const fillsFirst = world.elections.some((election) => election.countryId === "UK" && election.state === regionId && ["commons", "snap_commons"].includes(election.electionType) && (election.status === "active" || election.status === "upcoming") && election.endTurn <= world.meta.turn + UK_COMMONS_BY_ELECTION_TOTAL_TURNS);
    if (fillsFirst) {
      continue;
    }
    const lastSpecial = world.elections.filter((election) => election.countryId === "UK" && election.electionType === "special_commons" && election.state === regionId && election.status === "resolved").reduce((max, election) => Math.max(max, election.resolvedTurn ?? -1), -1);
    if (lastSpecial >= 0 && lastSpecial > world.meta.turn - UK_COMMONS_BY_ELECTION_RETRY_COOLDOWN_TURNS) continue;
    const regionSeats = seatsByRegion[regionId] ?? 0;
    if (regionSeats < 1) continue;
    const vacancyIds = rows.map((vacancy) => vacancy.id).sort();
    const primaryEndTurn = world.meta.turn + UK_COMMONS_BY_ELECTION_FILING_TURNS;
    const id = `special_commons:UK:${regionId}:c${world.meta.turn}`;
    const rec: ElectionRecord = {
      id,
      electionType: "special_commons",
      countryId: "UK",
      state: regionId,
      vacancyIds,
      byElectionCarve: Math.min(1, rows.length / regionSeats),
      cycle: world.meta.turn,
      status: "active",
      startTurn: world.meta.turn,
      primaryEndTurn,
      endTurn: primaryEndTurn + UK_COMMONS_BY_ELECTION_GENERAL_TURNS,
      totalSeats: rows.length,
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
