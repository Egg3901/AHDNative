import type { WorldState } from "../types.js";
import type { Corporation } from "./types.js";
import { privateEnterprisePermittedInCountry } from "./privateEnterpriseGate.js";
import { isCorpStateOwned } from "../bonds/corporateBonds.js";

const VOTE_WINDOW_TURNS = 24;

/** Source default public-company shareholder thresholds from AHDGame legalStructures.ts. */
export function sourceRelocationVoteThreshold(countryId: string): number {
  const sourceDefaults: Readonly<Record<string, number>> = {
    UK: 0.4,
    JP: 0.6,
    DE: 0.35,
    IE: 0.5,
    BR: 0.5,
    CN: 0.45,
    NG: 0.5,
    US: 0.5,
  };
  return sourceDefaults[countryId] ?? 0.5;
}

function eligibleShares(corporation: Corporation): number {
  return corporation.shareholders.reduce((sum, holder) =>
    sum + (Number.isFinite(holder.shares) && holder.shares > 0 ? holder.shares : 0), 0);
}

function currentBallots(corporation: Corporation): Map<"player" | "npc", "yes" | "no"> {
  const latest = new Map<"player" | "npc", "yes" | "no">();
  for (const vote of corporation.relocationVote?.votes ?? []) latest.set(vote.voterId, vote.choice);
  return latest;
}

function destinationIsOpen(world: WorldState, corporation: Corporation, countryId: string): boolean {
  return countryId === corporation.countryId || isCorpStateOwned(corporation) || privateEnterprisePermittedInCountry(world, countryId);
}

/** Source openCorporationVote relocation producer, bounded to Native's two shareholder identities. */
export function openCorporationRelocationVote(
  world: WorldState,
  corporationId: string,
  destinationRegionId: string,
): { ok: true; voteId: string } | { ok: false; error: string } {
  const corporation = world.corporations[corporationId];
  if (!corporation) return { ok: false, error: "Corporation not found" };
  if (corporation.ceoId !== "player" || corporation.ceoType !== "player" || corporation.ceoVacant === true) {
    return { ok: false, error: "Only the active CEO may propose a relocation" };
  }
  if (corporation.isPrivate === true) return { ok: false, error: "Private corporations do not require shareholder votes" };
  if (corporation.relocationVote?.status === "open") return { ok: false, error: "Another corporate vote is already in progress" };
  const destination = world.regions[destinationRegionId];
  if (!destination || destination.corporationHeadquartersOnly) return { ok: false, error: "Invalid headquarters region" };
  if (destinationRegionId === corporation.headquartersRegionId) return { ok: false, error: "Corporation is already headquartered in this region" };
  if (!destinationIsOpen(world, corporation, destination.countryId)) {
    return { ok: false, error: "Private corporations cannot relocate into a command economy" };
  }
  const shares = eligibleShares(corporation);
  if (!(shares > 0)) return { ok: false, error: "Corporation has no eligible shareholder voting power" };
  const turn = world.meta.turn;
  const voteId = `corp-relocation:${corporation.id}:t${turn}`;
  corporation.relocationVote = {
    id: voteId,
    status: "open",
    proposedTurn: turn,
    deadlineTurn: turn + VOTE_WINDOW_TURNS,
    destinationRegionId,
    destinationCountryId: destination.countryId,
    sourceCountryId: corporation.countryId,
    passThreshold: sourceRelocationVoteThreshold(corporation.countryId),
    eligibleSharesAtOpen: shares,
    votes: [],
  };
  return { ok: true, voteId };
}

function applyPassedRelocation(world: WorldState, corporation: Corporation): boolean {
  const vote = corporation.relocationVote;
  if (!vote || vote.status !== "passed") return false;
  const destination = world.regions[vote.destinationRegionId];
  if (!destination || destination.countryId !== vote.destinationCountryId || destination.corporationHeadquartersOnly) return false;
  // Source re-checks the marketization dial at effect time, since the economy
  // can return to the command band while a 24-turn vote is open.
  if (!destinationIsOpen(world, corporation, destination.countryId)) return false;
  corporation.countryId = destination.countryId;
  corporation.headquartersRegionId = destination.id;
  return true;
}

/** Cast/update the player's current source-weighted shareholder ballot. */
export function castCorporationRelocationVote(
  world: WorldState,
  corporationId: string,
  choice: "yes" | "no",
): { ok: true; status: "open" | "passed" | "failed" | "cancelled" } | { ok: false; error: string } {
  const corporation = world.corporations[corporationId];
  const vote = corporation?.relocationVote;
  if (!corporation || !vote || vote.status !== "open") return { ok: false, error: "No open relocation vote exists" };
  const shares = eligibleShares(corporation);
  if (shares !== vote.eligibleSharesAtOpen) {
    vote.status = "cancelled";
    return { ok: false, error: "The shareholder register changed; the vote was cancelled" };
  }
  const playerShares = corporation.shareholders.filter((holder) => holder.holder === "player")
    .reduce((sum, holder) => sum + holder.shares, 0);
  if (!(playerShares > 0)) return { ok: false, error: "You hold no shares in this corporation" };
  const ballots = currentBallots(corporation);
  ballots.set("player", choice);
  vote.votes = [...ballots.entries()].map(([voterId, ballot]) => ({ voterId, choice: ballot }));
  resolveOpenVote(world, corporation);
  return { ok: true, status: vote.status };
}

function resolveOpenVote(world: WorldState, corporation: Corporation): void {
  const vote = corporation.relocationVote;
  if (!vote || vote.status !== "open") return;
  if (eligibleShares(corporation) !== vote.eligibleSharesAtOpen) {
    vote.status = "cancelled";
    return;
  }
  const sharesByHolder = new Map(corporation.shareholders.map((holder) => [holder.holder, holder.shares]));
  const ballots = currentBallots(corporation);
  const yes = [...ballots].reduce((sum, [holder, choice]) => sum + (choice === "yes" ? sharesByHolder.get(holder)! : 0), 0);
  const no = [...ballots].reduce((sum, [holder, choice]) => sum + (choice === "no" ? sharesByHolder.get(holder)! : 0), 0);
  const required = Math.ceil(vote.eligibleSharesAtOpen * vote.passThreshold);
  const maxPossibleYes = yes + (vote.eligibleSharesAtOpen - yes - no);
  if (yes >= required) {
    vote.status = "passed";
    applyPassedRelocation(world, corporation);
  } else if (maxPossibleYes < required || world.meta.turn >= vote.deadlineTurn) {
    vote.status = "failed";
  }
}

/** Deadline consumer corresponding to Game's turn vote reminder/resolver. */
export function resolveDueCorporateRelocationVotes(world: WorldState): void {
  for (const corporation of Object.values(world.corporations)) {
    if (corporation.relocationVote?.status === "open" && world.meta.turn >= corporation.relocationVote.deadlineTurn) {
      resolveOpenVote(world, corporation);
    }
  }
}

/** Fail-closed structural validation for the saved shareholder-vote continuation. */
export function validateCorporateRelocationVote(value: unknown, corporationId: string): void {
  if (value === undefined) return;
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`Corporation ${corporationId} has invalid relocation vote`);
  const vote = value as Record<string, unknown>;
  if (typeof vote["id"] !== "string" || vote["id"] !== `corp-relocation:${corporationId}:t${vote["proposedTurn"]}` ||
      !["open", "passed", "failed", "cancelled"].includes(String(vote["status"])) ||
      !Number.isSafeInteger(vote["proposedTurn"]) || (vote["proposedTurn"] as number) < 0 ||
      !Number.isSafeInteger(vote["deadlineTurn"]) || (vote["deadlineTurn"] as number) <= (vote["proposedTurn"] as number) ||
      typeof vote["destinationRegionId"] !== "string" || !vote["destinationRegionId"] ||
      typeof vote["destinationCountryId"] !== "string" || !vote["destinationCountryId"] ||
      typeof vote["sourceCountryId"] !== "string" || !vote["sourceCountryId"] ||
      typeof vote["passThreshold"] !== "number" || !Number.isFinite(vote["passThreshold"]) || vote["passThreshold"] <= 0 || vote["passThreshold"] > 1 ||
      typeof vote["eligibleSharesAtOpen"] !== "number" || !Number.isFinite(vote["eligibleSharesAtOpen"]) || vote["eligibleSharesAtOpen"] <= 0 ||
      !Array.isArray(vote["votes"])) {
    throw new Error(`Corporation ${corporationId} has invalid relocation vote`);
  }
  const voterIds = new Set<string>();
  for (const ballot of vote["votes"]) {
    if (ballot === null || typeof ballot !== "object" || Array.isArray(ballot)) throw new Error(`Corporation ${corporationId} has invalid relocation ballot`);
    const row = ballot as Record<string, unknown>;
    if ((row["voterId"] !== "player" && row["voterId"] !== "npc") || (row["choice"] !== "yes" && row["choice"] !== "no") || voterIds.has(row["voterId"])) {
      throw new Error(`Corporation ${corporationId} has invalid relocation ballot`);
    }
    voterIds.add(row["voterId"]);
  }
}
