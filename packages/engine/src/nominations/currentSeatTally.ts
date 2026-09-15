import type { WorldState } from "../types.js";

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
): Set<string> {
  const matchesChamber = chamber === "senate" ? isSenateChamber : isHouseChamber;
  const keys = new Set(
    world.politicians
      .filter((politician) => politician.countryId === countryId && matchesChamber(politician.chamberKey))
      .map((politician) => `pol_${politician.id}`),
  );
  const playerSeat = world.player.legislativeSeat;
  if (playerSeat?.countryId === countryId && matchesChamber(playerSeat.chamberKey)) keys.add("player");
  return keys;
}

export function tallyCurrentSeatVotes(
  world: WorldState,
  countryId: string,
  votes: Record<string, NominationVote>,
  chamber: "senate" | "house" = "senate",
): NominationTally {
  const eligibleKeys = currentSeatVoterKeys(world, countryId, chamber);
  const tally = { votesFor: 0, votesAgainst: 0, votesAbstain: 0 };
  for (const [key, vote] of Object.entries(votes)) {
    if (!eligibleKeys.has(key)) continue;
    if (vote === "for") tally.votesFor++;
    else if (vote === "against") tally.votesAgainst++;
    else tally.votesAbstain++;
  }
  return tally;
}

export function assertNominationVote(vote: unknown): asserts vote is NominationVote {
  if (vote !== "for" && vote !== "against" && vote !== "abstain") {
    throw new Error("Vote must be for, against, or abstain");
  }
}
