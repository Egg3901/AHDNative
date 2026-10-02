import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { GOVERNMENT_CHAMBER_BY_COUNTRY, INITIAL_CONFIDENCE, majorityThreshold, minorityThreshold } from "./constants.js";

/** Game source: `governmentFormation.ts` PMAppointmentVote. */
export type PmAppointmentVoteChoice = "aye" | "nay";
export type PmAppointmentVoteStatus = "active" | "passed" | "failed" | "cancelled";

export interface PmAppointmentVoteRecord {
  id: string;
  countryId: string;
  chamberKey: string;
  partyId: string;
  coalitionId: string | null;
  coalitionPartyIds: string[] | null;
  nomineeId: "player";
  nomineeName: string;
  formationType: "majority" | "minority" | "coalition";
  openedTurn: number;
  closesTurn: number;
  status: PmAppointmentVoteStatus;
  votes: Record<string, PmAppointmentVoteChoice>;
  votesFor: number;
  votesAgainst: number;
  closedTurn: number | null;
}

/** Game source `PM_VOTE_DURATION_HOURS=24`; Native's turn clock is hourly. */
export const PM_APPOINTMENT_VOTE_DURATION_TURNS = 24;
/** Game source runs the parliamentary NPP vote pass once every four turns. */
export const PM_APPOINTMENT_NPP_VOTE_INTERVAL = 4;

export interface PmAppointmentEligibility {
  eligible: boolean;
  reason: string | null;
  formationType: "majority" | "minority" | "coalition" | null;
  partyId: string | null;
  coalitionId: string | null;
  coalitionPartyIds: string[] | null;
  partySeats: number;
}

function ineligible(reason: string, partyId: string | null = null, partySeats = 0): PmAppointmentEligibility {
  return { eligible: false, reason, formationType: null, partyId, coalitionId: null, coalitionPartyIds: null, partySeats };
}

function playerHasLowerChamberSeat(world: WorldState, countryId: string, chamberKey: string): boolean {
  const seat = world.player.legislativeSeat;
  return world.player.mode === "career" && seat?.countryId === countryId && seat.chamberKey === chamberKey;
}

/**
 * Source `checkAppointmentEligibility`: party chair or acting vice-chair may
 * nominate; the party must have enough live lower-chamber seats for a majority
 * or minority bid. Native player identity is explicitly `"player"`, matching
 * the existing national party leadership ballot's chairId representation.
 */
export function getPmAppointmentEligibility(world: WorldState): PmAppointmentEligibility {
  const countryId = world.player.countryId;
  const chamberKey = GOVERNMENT_CHAMBER_BY_COUNTRY[countryId];
  const government = world.governments[countryId];
  const partyId = world.player.partyId;
  const party = partyId ? world.parties[partyId] : undefined;
  if (!chamberKey || countryId !== "IE") return ineligible("PM appointment is not available in this country");
  if (!government || government.status !== "pending") return ineligible("PM appointment is only available while government formation is pending");
  if (!playerHasLowerChamberSeat(world, countryId, chamberKey)) return ineligible("You must be an elected Dáil member to nominate a Taoiseach");
  if (!partyId || !party || party.countryId !== countryId) return ineligible("Join an Irish political party before nominating a Taoiseach");
  const authorized = party.chairId === "player" || (party.chairId == null && party.viceChairId === "player");
  const chamber = world.legislatures[countryId]?.chambers.find((item) => item.key === chamberKey);
  if (!chamber) return ineligible("Dáil Éireann is unavailable", partyId);
  const partySeats = chamber.composition.seatsByParty[partyId] ?? 0;
  const requiredMajority = majorityThreshold(chamber.seats);
  if (authorized && partySeats >= requiredMajority) return { eligible: true, reason: null, formationType: "majority", partyId, coalitionId: null, coalitionPartyIds: null, partySeats };
  if (authorized && partySeats >= minorityThreshold(chamber.seats)) return { eligible: true, reason: null, formationType: "minority", partyId, coalitionId: null, coalitionPartyIds: null, partySeats };

  // Game source also permits a nominated coalition chair. Preserve the stored
  // lead/member order: the first member supplies the source ruling-party gate.
  const coalition = world.coalitions.find((candidate) => candidate.countryId === countryId && candidate.chairCharacterId === "player");
  if (coalition) {
    const coalitionPartyIds = coalition.memberPartyIds.filter((memberId) => world.parties[memberId]?.countryId === countryId);
    const coalitionSeats = coalitionPartyIds.reduce((sum, memberId) => sum + (chamber.composition.seatsByParty[memberId] ?? 0), 0);
    if (coalitionPartyIds.includes(partyId)) {
      if (coalitionSeats >= requiredMajority) return { eligible: true, reason: null, formationType: "coalition", partyId, coalitionId: coalition.id, coalitionPartyIds, partySeats: coalitionSeats };
      if (coalitionSeats >= minorityThreshold(chamber.seats)) return { eligible: true, reason: null, formationType: "minority", partyId, coalitionId: coalition.id, coalitionPartyIds, partySeats: coalitionSeats };
    }
  }
  if (!authorized && !coalition) return ineligible("Only the party chair, acting vice-chair, or coalition chair may nominate a Taoiseach", partyId, partySeats);
  return ineligible("Your party or coalition does not hold enough Dáil seats to nominate a government", partyId, partySeats);
}

export function proposePmAppointment(world: WorldState): { ok: true; vote: PmAppointmentVoteRecord } | { ok: false; error: string } {
  const eligibility = getPmAppointmentEligibility(world);
  if (!eligibility.eligible || !eligibility.partyId || !eligibility.formationType) {
    return { ok: false, error: eligibility.reason ?? "You are not eligible to nominate a Taoiseach" };
  }
  if (world.pmAppointmentVotes.some((vote) => vote.countryId === "IE" && vote.status === "active" && (
    eligibility.coalitionId ? vote.coalitionId === eligibility.coalitionId : vote.partyId === eligibility.partyId
  ))) {
    return { ok: false, error: "Your party already has an active PM appointment vote" };
  }
  const chamberKey = GOVERNMENT_CHAMBER_BY_COUNTRY.IE!;
  const id = `pm-appointment-${world.meta.turn}-${world.pmAppointmentVotes.length + 1}`;
  const vote: PmAppointmentVoteRecord = {
    id,
    countryId: "IE",
    chamberKey,
    partyId: eligibility.partyId,
    coalitionId: eligibility.coalitionId,
    coalitionPartyIds: eligibility.coalitionPartyIds,
    nomineeId: "player",
    nomineeName: world.player.name,
    formationType: eligibility.formationType,
    openedTurn: world.meta.turn,
    closesTurn: world.meta.turn + PM_APPOINTMENT_VOTE_DURATION_TURNS,
    status: "active",
    votes: {},
    votesFor: 0,
    votesAgainst: 0,
    closedTurn: null,
  };
  world.pmAppointmentVotes.push(vote);
  return { ok: true, vote };
}

export function castPmAppointmentVote(
  world: WorldState,
  voteId: string,
  choice: PmAppointmentVoteChoice,
): { ok: true; vote: PmAppointmentVoteRecord } | { ok: false; error: string } {
  if (!playerHasLowerChamberSeat(world, "IE", GOVERNMENT_CHAMBER_BY_COUNTRY.IE!)) {
    return { ok: false, error: "You must be an elected Dáil member to vote on a Taoiseach appointment" };
  }
  const vote = world.pmAppointmentVotes.find((candidate) => candidate.id === voteId && candidate.countryId === "IE");
  if (!vote) return { ok: false, error: "PM appointment vote not found" };
  if (vote.status !== "active") return { ok: false, error: "This vote has already closed" };
  if (world.meta.turn >= vote.closesTurn) return { ok: false, error: "The voting window has closed" };
  vote.votes.player = choice;
  const tally = tallyPmAppointmentVotes(world, vote);
  vote.votesFor = tally.ayes;
  vote.votesAgainst = tally.nays;
  return { ok: true, vote };
}

function tallyPmAppointmentVotes(world: WorldState, vote: PmAppointmentVoteRecord): { ayes: number; nays: number } {
  let ayes = 0;
  let nays = 0;
  for (const [voterId, choice] of Object.entries(vote.votes)) {
    // A Dáil seat is single-member: the player's elected seat weighs one and
    // each source-seeded Native politician represents one NPP seat.
    if (voterId === "player") {
      if (choice === "aye") ayes++;
      else nays++;
      continue;
    }
    const politician = world.politicians.find((candidate) => candidate.id === voterId);
    if (!politician || politician.countryId !== vote.countryId || politician.chamberKey !== vote.chamberKey) continue;
    if (choice === "aye") ayes++;
    else nays++;
  }
  return { ayes, nays };
}

function sourceAutoAyeNppMembers(world: WorldState, vote: PmAppointmentVoteRecord): void {
  const government = world.governments[vote.countryId];
  if (!government || government.status !== "pending") return;
  for (const politician of world.politicians) {
    const qualifyingParties = vote.coalitionPartyIds ?? [vote.partyId];
    if (politician.countryId !== vote.countryId || politician.chamberKey !== vote.chamberKey || !qualifyingParties.includes(politician.partyId)) continue;
    if (!(politician.id in vote.votes)) vote.votes[politician.id] = "aye";
  }
}

function installPlayerAsTaoiseach(world: WorldState, vote: PmAppointmentVoteRecord): void {
  const chamber = world.legislatures.IE?.chambers.find((item) => item.key === vote.chamberKey);
  const government = world.governments.IE;
  if (!chamber || !government) return;
  government.status = "formed";
  government.formationType = vote.formationType;
  government.governingPartyId = vote.partyId;
  government.coalitionPartyIds = vote.coalitionPartyIds;
  government.pmPoliticianId = "player";
  government.totalSeatsSupporting = (vote.coalitionPartyIds ?? [vote.partyId]).reduce((sum, partyId) => sum + (chamber.composition.seatsByParty[partyId] ?? 0), 0);
  government.totalSeats = chamber.seats;
  government.majorityThreshold = majorityThreshold(chamber.seats);
  government.seatsByParty = { ...chamber.composition.seatsByParty };
  government.lostMajority = false;
  government.formedTurn = world.meta.turn;
  government.pmVacancyDeadlineTurn = null;
  government.confidence = INITIAL_CONFIDENCE;
}

/** Game `processParliamentaryGovernmentVotes` and NPP appointment auto-aye. */
export const pmAppointmentPhase: TurnPhase = {
  name: "pmAppointment",
  run(world) {
    for (const vote of world.pmAppointmentVotes) {
      if (vote.status !== "active") continue;
      if (world.meta.turn % PM_APPOINTMENT_NPP_VOTE_INTERVAL === 0 || world.meta.turn >= vote.closesTurn) {
        sourceAutoAyeNppMembers(world, vote);
      }
      const tally = tallyPmAppointmentVotes(world, vote);
      vote.votesFor = tally.ayes;
      vote.votesAgainst = tally.nays;
      if (world.meta.turn < vote.closesTurn) continue;
      vote.closedTurn = world.meta.turn;
      vote.status = tally.ayes > tally.nays ? "passed" : "failed";
      if (vote.status !== "passed") continue;
      installPlayerAsTaoiseach(world, vote);
      for (const other of world.pmAppointmentVotes) {
        if (other.id !== vote.id && other.countryId === vote.countryId && other.status === "active") {
          other.status = "cancelled";
          other.closedTurn = world.meta.turn;
        }
      }
    }
  },
};
