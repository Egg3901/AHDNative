/**
 * SCOTUS nomination sponsorship — presidential nominations for vacant Court seats.
 *
 * Sources:
 *  - src/app/api/whitehouse/scotus/nominate/route.ts (president-only 403,
 *    seatNumber 1-9, 24-hour Senate window, senator notification fan-out)
 *  - src/lib/scotus/nominateJustice.ts createJusticeNomination (unknown-seat,
 *    not-vacant, duplicate-active, nominee-found, same-country checks;
 *    votingEndsOnTurn = currentTurn + 24)
 *  - src/lib/db/types/scotus.ts (seat vacancy = no character/npp/historical
 *    occupant; nomination mirrors CabinetNomination vote lifecycle)
 *
 * Native single-player adaptation (same as sponsorCabinetNomination): the
 * source accepts another player character OR a generated NPP legal scholar
 * with no eligibility restriction (#3598). Offline Native has one player
 * record, the sitting President, so same-country generated politicians are
 * the nominee pool; both paths collapse to nomineeMode "character", matching
 * the existing SCOTUS ballot fixtures.
 *
 * Validation runs before any mutation, so every rejection is atomic.
 * Confirmation seating reuses the #268 vote engine (castScotusNominationVote
 * + processScotusTurn); this module only sponsors.
 */

import type { WorldState } from "../types.js";
import type { ScotusNomination } from "./types.js";
import { ensureScotusSeats } from "./scotusTurn.js";

/** Native turns per source 24-hour Senate voting window (same clock as cabinet). */
export const SCOTUS_NOMINATION_WINDOW_TURNS = 24;

export interface SponsorScotusNominationInput {
  countryId: string;
  seatNumber: number;
  nomineeId: string;
}

/**
 * Public presidential sponsorship boundary.
 * Throws on authority, seat, vacancy, duplicate, nominee, or clock failures
 * without mutating world.scotusNominations.
 */
export function sponsorScotusNomination(
  world: WorldState,
  input: SponsorScotusNominationInput,
): ScotusNomination {
  const executive = world.executives[input.countryId];
  if (world.player.countryId !== input.countryId || executive?.presidentId !== "player") {
    throw new Error("Only the President of this country can propose Supreme Court nominations");
  }
  if (!Number.isSafeInteger(world.meta.turn) || world.meta.turn < 0) {
    throw new Error("Invalid nomination voting deadline");
  }
  ensureScotusSeats(world);
  const seat = world.supremeCourtSeats.find(
    (candidate) => candidate.countryId === input.countryId && candidate.seatNumber === input.seatNumber,
  );
  if (!seat) throw new Error("Unknown seat");
  if (seat.justiceMode !== null) throw new Error("Seat is not vacant");
  if (world.scotusNominations.some((nomination) =>
    nomination.countryId === input.countryId && nomination.seatNumber === input.seatNumber
      && nomination.status === "active")) {
    throw new Error("An active nomination for this seat already exists");
  }
  const isPlayer = input.nomineeId === "player";
  const politician = isPlayer
    ? null
    : world.politicians.find((candidate) => candidate.id === input.nomineeId);
  if (!isPlayer && !politician) throw new Error(`Nominee ${input.nomineeId} not found`);
  const nomineeCountry = isPlayer ? world.player.countryId : politician!.countryId;
  if (nomineeCountry !== input.countryId) throw new Error(`Nominee not from ${input.countryId}`);
  const nomineeName = isPlayer ? world.player.name : politician!.name;
  const nomineeParty = isPlayer ? world.player.partyId : politician!.partyId;

  world.scotusNominations ??= [];
  const id = `scotus_nom_${input.countryId}_${world.meta.turn}_${world.scotusNominations.length + 1}`;
  const nomination: ScotusNomination = {
    id,
    countryId: input.countryId,
    seatNumber: input.seatNumber,
    nomineeMode: "character",
    nomineeId: input.nomineeId,
    nomineeName,
    nomineeParty,
    proposedBy: "player",
    status: "active",
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    votes: {},
    votingEndsOnTurn: world.meta.turn + SCOTUS_NOMINATION_WINDOW_TURNS,
    proposedAtTurn: world.meta.turn,
  };
  world.scotusNominations.push(nomination);
  return nomination;
}
