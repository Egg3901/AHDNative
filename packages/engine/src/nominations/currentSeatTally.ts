import type { WorldState } from "../types.js";
import { heldSeatCount } from "../government/seatWeights.js";

export type NominationVote = "for" | "against" | "abstain";

export interface NominationTally {
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
}

export function isSenateChamber(chamberKey: string): boolean {
  return chamberKey === "senate" || chamberKey === "upper" || chamberKey === "senate_us";
}

export function isHouseChamber(chamberKey: string): boolean {
  return chamberKey === "house" || chamberKey === "lower";
}

function currentSeatVoterKeys(
  world: WorldState,
  countryId: string,
  chamber: "senate" | "house",
  nppPrefix: "pol_" | "npp_",
): Map<string, number> {
  const matchesChamber = chamber === "senate" ? isSenateChamber : isHouseChamber;
  const keys = new Map<string, number>(
    world.politicians
      .filter((politician) => politician.countryId === countryId && matchesChamber(politician.chamberKey))
      .map((politician) => [`${nppPrefix}${politician.id}`, heldSeatCount(politician)]),
  );
  const playerSeat = world.player.legislativeSeat;
  if (playerSeat?.countryId === countryId && matchesChamber(playerSeat.chamberKey)) keys.set("player", heldSeatCount(playerSeat));
  return keys;
}

export function tallyCurrentSeatVotes(
  world: WorldState,
  countryId: string,
  votes: Record<string, NominationVote>,
  chamber: "senate" | "house" = "senate",
  nppPrefix: "pol_" | "npp_" = "pol_",
): NominationTally {
  const eligibleKeys = currentSeatVoterKeys(world, countryId, chamber, nppPrefix);
  const tally = { votesFor: 0, votesAgainst: 0, votesAbstain: 0 };
  for (const [key, vote] of Object.entries(votes)) {
    const weight = eligibleKeys.get(key);
    if (weight === undefined) continue;
    if (vote === "for") tally.votesFor += weight;
    else if (vote === "against") tally.votesAgainst += weight;
    else tally.votesAbstain += weight;
  }
  return tally;
}

export function assertNominationVote(vote: unknown): asserts vote is NominationVote {
  if (vote !== "for" && vote !== "against" && vote !== "abstain") {
    throw new Error("Vote must be for, against, or abstain");
  }
}
