/**
 * Cabinet nomination lifecycle — W29 port of src/lib/cabinetNominationLifecycle.ts.
 *
 * Ports two-phase turn shape:
 *  A. NPP senator votes on active nominations (party-line preference)
 *  B. Close expired votes and resolve confirmed/rejected via didPass (votesFor > votesAgainst)
 *
 * VP nominations require BOTH House and Senate majorities (25th Amendment).
 *
 * Determinism: mainline uses Math.random() inside nppCabinetVote; solo threads
 * world RNG via the caller-provided draw function so tests are reproducible.
 * Citations:
 *  - src/lib/cabinetNominationLifecycle.ts: nppCabinetVote (party-line)
 *  - src/lib/congress/governmentVoteBreakdown.ts: computeCabinetNominationTally (seat-weighted re-tally)
 *  - src/lib/billLifecycleHelpers.ts: didPass (simple majority)
 */

import type { WorldState } from "../types.js";
import type { CabinetConfirmationTally, CabinetNomination } from "./types.js";
import { cabinetPositionsForCountry } from "./constants.js";
import { initialMinisterialActionFields } from "./ministerialActionPool.js";
import {
  assertNominationVote,
  isHouseChamber,
  isSenateChamber,
  tallyCurrentSeatVotes,
  type NominationVote,
} from "../nominations/currentSeatTally.js";

export type SenateVote = NominationVote;

/**
 * Party-line NPP cabinet vote — mirrors src/lib/cabinetNominationLifecycle.ts nppCabinetVote.
 * Deterministic variant: caller supplies a uniform [0,1) draw instead of Math.random().
 * Source: src/lib/cabinetNominationLifecycle.ts:38-61
 */
export function nppCabinetVote(
  nppParty: string | undefined,
  nomineeParty: string | undefined,
  presidentParty: string | undefined,
  randomDraw?: number
): SenateVote {
  if (!nppParty) return "abstain";

  if (nomineeParty && nppParty === nomineeParty) return "for";

  const majorParties = ["democrat", "republican", "DEM", "REP", "US_DEM", "US_REP"];
  const isMajor = (p: string) => majorParties.includes(p);
  if (nomineeParty && isMajor(nomineeParty) && isMajor(nppParty)) {
    return "against";
  }

  if (presidentParty && nppParty === presidentParty) {
    const draw = randomDraw ?? 0.5;
    return draw < 0.7 ? "for" : "abstain";
  }

  const draw = randomDraw ?? 0.5;
  return draw < 0.55 ? "for" : "against";
}

/**
 * Simple majority helper — ports didPass (src/lib/billLifecycleHelpers.ts).
 * Cabinet nominations confirm when votesFor > votesAgainst.
 */
export function cabinetDidPass(votesFor: number, votesAgainst: number): boolean {
  return votesFor > votesAgainst;
}

/** Recompute from current seat holders so stale and cross-country keys have no weight. */
export function computeCabinetNominationTally(world: WorldState, nomination: CabinetNomination): CabinetConfirmationTally {
  const senate = tallyCurrentSeatVotes(world, nomination.countryId, nomination.votes);
  if (nomination.positionId !== "vicePresident") return senate;
  const house = tallyCurrentSeatVotes(world, nomination.countryId, nomination.houseVotes ?? {}, "house");
  return {
    ...senate,
    houseVotesFor: house.votesFor,
    houseVotesAgainst: house.votesAgainst,
    houseVotesAbstain: house.votesAbstain,
  };
}

function applyCabinetNominationTally(nomination: CabinetNomination, tally: CabinetConfirmationTally): void {
  nomination.votesFor = tally.votesFor;
  nomination.votesAgainst = tally.votesAgainst;
  nomination.votesAbstain = tally.votesAbstain;
  if (nomination.positionId === "vicePresident") {
    nomination.houseVotesFor = tally.houseVotesFor ?? 0;
    nomination.houseVotesAgainst = tally.houseVotesAgainst ?? 0;
    nomination.houseVotesAbstain = tally.houseVotesAbstain ?? 0;
  }
}

/** Player ballot boundary mirroring the reference nomination vote route. */
export function castCabinetNominationVote(
  world: WorldState,
  nominationId: string,
  vote: SenateVote,
): CabinetConfirmationTally {
  assertNominationVote(vote);
  const nomination = world.cabinetNominations.find((candidate) => candidate.id === nominationId);
  if (!nomination || nomination.status !== "active") throw new Error("Nomination not found or voting closed");
  if (world.meta.turn >= nomination.votingEndsOnTurn) throw new Error("Voting has ended");
  const seat = world.player.legislativeSeat;
  if (!seat || seat.countryId !== nomination.countryId) {
    throw new Error("Only members of Congress can vote on nominations");
  }
  const isVpNomination = nomination.positionId === "vicePresident";
  const voteField = isVpNomination && isHouseChamber(seat.chamberKey) ? "houseVotes" : "votes";
  if (!isSenateChamber(seat.chamberKey) && voteField !== "houseVotes") {
    throw new Error("Only Senators can vote on cabinet nominations");
  }
  if (!isSenateChamber(seat.chamberKey) && !isHouseChamber(seat.chamberKey)) {
    throw new Error("Only members of Congress can vote on nominations");
  }
  if (voteField === "houseVotes") {
    (nomination.houseVotes ??= {}).player = vote;
  } else {
    nomination.votes.player = vote;
  }
  const tally = computeCabinetNominationTally(world, nomination);
  applyCabinetNominationTally(nomination, tally);
  return tally;
}

export interface CabinetNominationLifecycleResult {
  nominationsVoted: number;
  confirmed: number;
  rejected: number;
}

/**
 * Public presidential sponsorship boundary.
 * Source: AHDGame POST /api/whitehouse/cabinet/nominations at revision
 * e364c04954ed628beef73a993a8e9e156650a31e. Native uses its one-hour turn
 * clock, so the source 24-hour confirmation window is 24 turns.
 * AHDGame currently accepts another player character. Offline Native has only
 * one player record, the sitting President, so same-country generated
 * politicians are the explicit single-player nominee-pool adaptation.
 */
export function sponsorCabinetNomination(
  world: WorldState,
  input: { countryId: string; positionId: string; nomineeId: string },
): CabinetNomination {
  const executive = world.executives[input.countryId];
  if (world.player.countryId !== input.countryId || executive?.presidentId !== "player") {
    throw new Error("Only the President of this country can propose cabinet nominations");
  }
  const position = cabinetPositionsForCountry(input.countryId).find((candidate) => candidate.id === input.positionId);
  if (!position) throw new Error("Invalid cabinet position");
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(world.meta.date);
  const parsedDate = dateMatch ? new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))) : null;
  if (!dateMatch || !parsedDate || parsedDate.toISOString().slice(0, 10) !== world.meta.date) {
    throw new Error("Invalid world date for cabinet position eligibility");
  }
  const year = Number(world.meta.date.slice(0, 4));
  if (position.yearEnabled !== undefined && year < position.yearEnabled) {
    throw new Error("This cabinet position does not exist in the current era");
  }
  if (!Number.isSafeInteger(world.meta.turn) || world.meta.turn < 0) throw new Error("Invalid nomination voting deadline");
  const occupied = input.positionId === "vicePresident"
    ? executive.vicePresidentId !== null
    : world.cabinetMembers.some((member) => member.countryId === input.countryId && member.positionId === input.positionId);
  if (occupied) throw new Error("Cabinet position is not vacant");
  if (world.cabinetNominations.some((nomination) =>
    nomination.countryId === input.countryId && nomination.positionId === input.positionId
      && (nomination.status === "active" || nomination.status === "proposed"))) {
    throw new Error("An active nomination for this cabinet position already exists");
  }
  const isPlayer = input.nomineeId === "player";
  const politician = world.politicians.find((candidate) => candidate.id === input.nomineeId);
  if (!isPlayer && !politician) throw new Error(`Nominee ${input.nomineeId} not found`);
  const nomineeCountry = isPlayer ? world.player.countryId : politician!.countryId;
  if (nomineeCountry !== input.countryId) throw new Error(`Nominee not from ${input.countryId}`);
  if (input.positionId === "vicePresident" && input.nomineeId === executive.presidentId) {
    throw new Error("The sitting President cannot be nominated as Vice President");
  }
  if (world.cabinetMembers.some((member) => member.countryId === input.countryId && member.characterId === input.nomineeId)) {
    throw new Error(`Nominee already holds a cabinet seat in ${input.countryId}`);
  }
  const nomineeName = isPlayer ? world.player.name : politician!.name;
  const nomineeParty = isPlayer ? world.player.partyId : politician!.partyId;
  const id = appendCabinetNomination(world, {
    countryId: input.countryId,
    positionId: input.positionId,
    nomineeId: input.nomineeId,
    nomineeName,
    nomineeParty,
    proposedBy: "player",
    proposedByName: world.player.name,
    votingEndsOnTurn: world.meta.turn + 24,
  });
  return world.cabinetNominations.find((nomination) => nomination.id === id)!;
}

/**
 * Advance active cabinet nominations: cast NPP Senate votes then resolve expired ones.
 * Pure over WorldState; RNG consumed deterministically per NPP voting.
 */
export function processCabinetNominationLifecycle(world: WorldState): CabinetNominationLifecycleResult {
  const turn = world.meta.turn;
  let nominationsVoted = 0;
  let confirmed = 0;
  let rejected = 0;

  const nominations = world.cabinetNominations ?? [];
  const members = world.cabinetMembers ?? [];

  // Pre-resolve executive party for US president (sole confirmation-based system)
  const usExec = world.executives["US"];
  const presidentParty = usExec?.presidentParty ?? undefined;

  // Build rng draws deterministically
  const rng = (() => {
    let idx = 0;
    const seed = world.meta.rng;
    // Simple deterministic draw sequence seeded from turn + nomination count
    // Use a lightweight hash to stay rng-pure without advancing world.meta.rng directly here;
    // callers that need exact rng stream advancement should pass draws explicitly.
    return () => {
      // LCG-ish: (turn*7919 + idx*5009) mod 1
      const v = ((turn * 7919 + idx * 5009 + (seed[0] ?? 0)) % 10000) / 10000;
      idx++;
      return v;
    };
  })();

  for (const nom of nominations) {
    if (nom.status !== "active") continue;

    // A. NPP catch-up votes — only if voting not yet expired
    if (turn < nom.votingEndsOnTurn) {
      // Vote logic: each politician seated in senate (plus NPP-like) votes once.
      // We model NPP senators as politicians whose chamberKey is senate and whose id is not already voted.
      const senateHolders = world.politicians.filter(
        (p) => p.countryId === (nom.countryId ?? "US") && isSenateChamber(p.chamberKey)
      );
      let newVotes = 0;
      for (const holder of senateHolders) {
        const key = `pol_${holder.id}`;
        if (nom.votes[key]) continue;
        const draw = rng();
        const vote = nppCabinetVote(holder.partyId, nom.nomineeParty ?? undefined, presidentParty, draw);
        nom.votes[key] = vote;
        if (vote === "for") nom.votesFor += 1;
        else if (vote === "against") nom.votesAgainst += 1;
        else nom.votesAbstain += 1;
        // House side for VP nominations — use house holders
        newVotes++;
      }
      // VP nominations also need House votes
      if (nom.positionId === "vicePresident") {
        const houseHolders = world.politicians.filter(
          (p) => p.countryId === (nom.countryId ?? "US") && isHouseChamber(p.chamberKey)
        );
        for (const holder of houseHolders) {
          const key = `pol_${holder.id}`;
          if (nom.houseVotes?.[key]) continue;
          const draw = rng();
          const vote = nppCabinetVote(holder.partyId, nom.nomineeParty ?? undefined, presidentParty, draw);
          if (!nom.houseVotes) nom.houseVotes = {};
          nom.houseVotes[key] = vote;
          nom.houseVotesFor = (nom.houseVotesFor ?? 0) + (vote === "for" ? 1 : 0);
          nom.houseVotesAgainst = (nom.houseVotesAgainst ?? 0) + (vote === "against" ? 1 : 0);
          nom.houseVotesAbstain = (nom.houseVotesAbstain ?? 0) + (vote === "abstain" ? 1 : 0);
        }
      }
      applyCabinetNominationTally(nom, computeCabinetNominationTally(world, nom));
      if (newVotes > 0) nominationsVoted++;
      continue;
    }

    // B. Resolve expired nominations at or past votingEndsOnTurn
    if (turn >= nom.votingEndsOnTurn) {
      applyCabinetNominationTally(nom, computeCabinetNominationTally(world, nom));
      let passed: boolean;
      if (nom.positionId === "vicePresident") {
        const senatePassed = cabinetDidPass(nom.votesFor, nom.votesAgainst);
        const housePassed = cabinetDidPass(nom.houseVotesFor ?? 0, nom.houseVotesAgainst ?? 0);
        passed = senatePassed && housePassed;
      } else {
        passed = cabinetDidPass(nom.votesFor, nom.votesAgainst);
      }

      if (passed) {
        // Confirm: create or replace cabinet member
        // VP path: seat vice president in executives
        if (nom.positionId === "vicePresident") {
          const cId = nom.countryId ?? "US";
          if (!world.executives[cId]) {
            world.executives[cId] = { countryId: cId, presidentId: null, presidentParty: null, termStartTurn: null, vicePresidentId: null, vicePresidentParty: null };
          }
          const exec = world.executives[cId]!;
          exec.vicePresidentId = nom.nomineeId;
          exec.vicePresidentParty = nom.nomineeParty ?? null;
          world.news.push({
            turn,
            date: world.meta.date,
            headline: `${nom.nomineeName} confirmed as Vice President`,
          });
        } else {
          // Vacate nominee's existing seat (unique character constraint)
          // Remove any existing membership for this position or same character
          const idxPos = members.findIndex((m) => m.countryId === nom.countryId && m.positionId === nom.positionId);
          if (idxPos !== -1) members.splice(idxPos, 1);
          const idxChar = members.findIndex((m) => m.countryId === nom.countryId && m.characterId === nom.nomineeId);
          if (idxChar !== -1) members.splice(idxChar, 1);
          members.push({
            countryId: nom.countryId,
            positionId: nom.positionId,
            characterId: nom.nomineeId,
            characterName: nom.nomineeName,
            partyId: nom.nomineeParty ?? null,
            appointedBy: nom.proposedBy ?? null,
            appointedAtTurn: turn,
            confirmedAtTurn: turn,
            ...initialMinisterialActionFields(turn),
          });
          world.news.push({
            turn,
            date: world.meta.date,
            headline: `${nom.nomineeName} confirmed as ${nom.positionId}`,
          });
        }
        nom.status = "confirmed";
        nom.confirmedAtTurn = turn;
        confirmed++;
      } else {
        nom.status = "rejected";
        nom.rejectedAtTurn = turn;
        world.news.push({
          turn,
          date: world.meta.date,
          headline: `${nom.nomineeName} rejected for ${nom.positionId}`,
        });
        rejected++;
      }
    }
  }

  return { nominationsVoted, confirmed, rejected };
}

/**
 * Policy-free append seam. All authority, roster, vacancy, nominee, and clock
 * validation belongs to sponsorCabinetNomination before this mutates state.
 */
function appendCabinetNomination(
  world: WorldState,
  opts: {
    countryId: string;
    positionId: string;
    nomineeId: string;
    nomineeName: string;
    nomineeParty: string | null;
    proposedBy: string | null;
    proposedByName: string | null;
    votingEndsOnTurn: number;
  }
): string {
  const id = `cab_nom_${world.meta.turn}_${world.cabinetNominations.length + 1}`;
  world.cabinetNominations.push({
    id,
    countryId: opts.countryId,
    positionId: opts.positionId,
    nomineeId: opts.nomineeId,
    nomineeName: opts.nomineeName,
    nomineeParty: opts.nomineeParty,
    proposedBy: opts.proposedBy,
    proposedByName: opts.proposedByName,
    status: "active",
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    votes: {},
    votingEndsOnTurn: opts.votingEndsOnTurn,
    proposedAtTurn: world.meta.turn,
    ...(opts.positionId === "vicePresident" ? {
      houseVotesFor: 0,
      houseVotesAgainst: 0,
      houseVotesAbstain: 0,
      houseVotes: {},
    } : {}),
  });
  return id;
}
