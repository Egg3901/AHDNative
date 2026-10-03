import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { heldSeatCount, liveChamberSeatsByParty } from "./seatWeights.js";
import { EXECUTIVE_OFFICE_BY_COUNTRY } from "../actions/officeRegistry.js";
import { COUNTRY_CONFIGS } from "../electionEngine/countryElectionConstants.js";
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

/** Country titles from Game's parliamentary appointment routes. */
const PM_TITLES: Readonly<Record<string, string>> = {
  IE: "Taoiseach", UK: "Prime Minister", JP: "Prime Minister", DE: "Chancellor", CN: "Premier",
};

export function pmAppointmentExecutiveTitle(countryId: string): string | null {
  return PM_TITLES[countryId] ?? null;
}

function lowerChamberLabel(world: WorldState, countryId: string): string {
  if (countryId === "IE") return "Dáil";
  return world.legislatures[countryId]?.chambers.find(item => item.key === GOVERNMENT_CHAMBER_BY_COUNTRY[countryId])?.name ?? "lower chamber";
}

function partyMayFormGovernment(world: WorldState, countryId: string, partyId: string): boolean {
  // Native has no runtime regime conversion substrate yet. Use the authored
  // country type and actual ruling-party identity, never a seat-count proxy.
  return COUNTRY_CONFIGS[countryId]?.governmentType !== "onePartyState"
    || world.parties[partyId]?.regimeStatus === "ruling";
}

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
  const title = pmAppointmentExecutiveTitle(countryId);
  const chamberLabel = lowerChamberLabel(world, countryId);
  if (!chamberKey || !title) return ineligible("PM appointment is not available in this country");
  if (!government || government.status !== "pending") return ineligible("PM appointment is only available while government formation is pending");
  if (!playerHasLowerChamberSeat(world, countryId, chamberKey)) return ineligible(`You must be an elected ${chamberLabel} member to nominate a ${title}`);
  if (!partyId || !party || party.countryId !== countryId) return ineligible(`Join a political party in your country before nominating a ${title}`);
  const authorized = party.chairId === "player" || (party.chairId == null && party.viceChairId === "player");
  if (authorized && !partyMayFormGovernment(world, countryId, partyId)) return ineligible("Only the ruling party may form government in a one-party state", partyId);
  const chamber = world.legislatures[countryId]?.chambers.find((item) => item.key === chamberKey);
  if (!chamber) return ineligible(`${chamberLabel} is unavailable`, partyId);
  const seatsByParty = liveChamberSeatsByParty(world, countryId, chamberKey);
  const partySeats = seatsByParty[partyId] ?? 0;
  const requiredMajority = majorityThreshold(chamber.seats);
  if (authorized && partySeats >= requiredMajority) return { eligible: true, reason: null, formationType: "majority", partyId, coalitionId: null, coalitionPartyIds: null, partySeats };
  if (authorized && partySeats >= minorityThreshold(chamber.seats)) return { eligible: true, reason: null, formationType: "minority", partyId, coalitionId: null, coalitionPartyIds: null, partySeats };

  // Game source also permits a nominated coalition chair. Preserve the stored
  // lead/member order: the first member supplies the source ruling-party gate.
  const coalition = world.coalitions.find((candidate) => candidate.countryId === countryId && candidate.chairCharacterId === "player");
  if (coalition) {
    if (!coalition.memberPartyIds[0] || !partyMayFormGovernment(world, countryId, coalition.memberPartyIds[0])) return ineligible("Only a coalition led by the ruling party may form government in a one-party state", partyId, partySeats);
    const coalitionPartyIds = coalition.memberPartyIds.filter((memberId) => world.parties[memberId]?.countryId === countryId);
    const coalitionSeats = coalitionPartyIds.reduce((sum, memberId) => sum + (seatsByParty[memberId] ?? 0), 0);
    if (coalitionPartyIds.includes(partyId)) {
      if (coalitionSeats >= requiredMajority) return { eligible: true, reason: null, formationType: "coalition", partyId, coalitionId: coalition.id, coalitionPartyIds, partySeats: coalitionSeats };
      if (coalitionSeats >= minorityThreshold(chamber.seats)) return { eligible: true, reason: null, formationType: "minority", partyId, coalitionId: coalition.id, coalitionPartyIds, partySeats: coalitionSeats };
    }
  }
  if (!authorized && !coalition) return ineligible(`Only the party chair, acting vice-chair, or coalition chair may nominate a ${title}`, partyId, partySeats);
  return ineligible(`Your party or coalition does not hold enough ${chamberLabel} seats to nominate a government`, partyId, partySeats);
}

export function proposePmAppointment(world: WorldState): { ok: true; vote: PmAppointmentVoteRecord } | { ok: false; error: string } {
  const countryId = world.player.countryId;
  const eligibility = getPmAppointmentEligibility(world);
  if (!eligibility.eligible || !eligibility.partyId || !eligibility.formationType) {
    return { ok: false, error: eligibility.reason ?? "You are not eligible to nominate a head of government" };
  }
  if (world.pmAppointmentVotes.some((vote) => vote.countryId === countryId && vote.status === "active" && (
    eligibility.coalitionId ? vote.coalitionId === eligibility.coalitionId : vote.partyId === eligibility.partyId
  ))) {
    return { ok: false, error: "Your party already has an active PM appointment vote" };
  }
  const chamberKey = GOVERNMENT_CHAMBER_BY_COUNTRY[countryId]!;
  const id = `pm-appointment-${world.meta.turn}-${world.pmAppointmentVotes.length + 1}`;
  const vote: PmAppointmentVoteRecord = {
    id,
    countryId,
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
  const countryId = world.player.countryId;
  const chamberKey = GOVERNMENT_CHAMBER_BY_COUNTRY[countryId];
  const title = pmAppointmentExecutiveTitle(countryId);
  if (!title || !chamberKey || !playerHasLowerChamberSeat(world, countryId, chamberKey)) {
    return { ok: false, error: `You must be an elected ${lowerChamberLabel(world, countryId)} member to vote on a ${title ?? "government"} appointment` };
  }
  const vote = world.pmAppointmentVotes.find((candidate) => candidate.id === voteId && candidate.countryId === countryId);
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
    // Source appointment ballots weight each current office by seatsHeld.
    if (voterId === "player") {
      if (!playerHasLowerChamberSeat(world, vote.countryId, vote.chamberKey)) continue;
      if (choice === "aye") ayes += heldSeatCount(world.player.legislativeSeat!);
      else nays += heldSeatCount(world.player.legislativeSeat!);
      continue;
    }
    const politician = world.politicians.find((candidate) => candidate.id === voterId);
    if (!politician || politician.countryId !== vote.countryId || politician.chamberKey !== vote.chamberKey) continue;
    if (choice === "aye") ayes += heldSeatCount(politician);
    else nays += heldSeatCount(politician);
  }
  return { ayes, nays };
}

function sourceAutoAyeNppMembers(world: WorldState, vote: PmAppointmentVoteRecord): void {
  const government = world.governments[vote.countryId];
  if (!government || government.status !== "pending") return;
  for (const politician of world.politicians) {
    const qualifyingParties = vote.coalitionPartyIds ?? [vote.partyId];
    // Game queries current ElectedOfficial rows here; former officeholders
    // retained in Native's historical politician collection are not voters.
    if (politician.retiredAt != null || politician.countryId !== vote.countryId
      || politician.chamberKey !== vote.chamberKey || !qualifyingParties.includes(politician.partyId)) continue;
    if (!(politician.id in vote.votes)) vote.votes[politician.id] = "aye";
  }
}

function installPlayerAsHeadOfGovernment(world: WorldState, vote: PmAppointmentVoteRecord): void {
  const chamber = world.legislatures[vote.countryId]?.chambers.find((item) => item.key === vote.chamberKey);
  const government = world.governments[vote.countryId];
  if (!chamber || !government) return;
  government.status = "formed";
  government.formationType = vote.formationType;
  government.governingPartyId = vote.partyId;
  government.coalitionPartyIds = vote.coalitionPartyIds;
  government.pmPoliticianId = "player";
  const seatsByParty = liveChamberSeatsByParty(world, vote.countryId, vote.chamberKey);
  government.totalSeatsSupporting = (vote.coalitionPartyIds ?? [vote.partyId]).reduce((sum, partyId) => sum + (seatsByParty[partyId] ?? 0), 0);
  government.totalSeats = chamber.seats;
  government.majorityThreshold = majorityThreshold(chamber.seats);
  government.seatsByParty = seatsByParty;
  government.lostMajority = false;
  government.formedTurn = world.meta.turn;
  government.pmVacancyDeadlineTurn = null;
  government.confidence = INITIAL_CONFIDENCE;
  const officeType = EXECUTIVE_OFFICE_BY_COUNTRY[vote.countryId];
  const previousOffice = world.player.currentOffice;
  if (officeType) world.player.currentOffice = {
    type: officeType, countryId: vote.countryId,
    ...(previousOffice?.countryId === vote.countryId && previousOffice.regionId
      ? { regionId: previousOffice.regionId } : {}),
  };
  // CN's head of state follows the actual ruling-party chair independently
  // of its chamber-invested Premier.
  if (vote.countryId === "CN") {
    const presidentId = world.parties[vote.partyId]?.chairId ?? "player";
    if (world.executives.CN?.presidentId !== presidentId) world.executives.CN = {
      countryId: "CN", presidentId, presidentParty: vote.partyId, termStartTurn: world.meta.turn,
      vicePresidentId: null, vicePresidentParty: null,
    };
  }
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
      installPlayerAsHeadOfGovernment(world, vote);
      for (const other of world.pmAppointmentVotes) {
        if (other.id !== vote.id && other.countryId === vote.countryId && other.status === "active") {
          other.status = "cancelled";
          other.closedTurn = world.meta.turn;
        }
      }
    }
  },
};
