/**
 * Coalitions including disband votes.
 * Ports src/lib/turn/coalitionDisbandCheck.ts resolveExpiredDisbandVotes
 * and coalition chair sync via src/lib/coalitions/syncCoalitionChair.ts
 * with solo WorldState mutations.
 */

import type { WorldState } from "../types.js";
import type { WorldRng } from "../rng.js";
import type { CoalitionRecord } from "./types.js";
import { COALITION_DISBAND_VOTE_DURATION_TURNS } from "./constants.js";
import { isPartyLeadershipAuthority } from "./leadershipTenure.js";

export function ensureCoalitionsForWorld(world: WorldState): void {
  // No auto-creation; coalitions are player/NPC initiated. But ensure array exists.
  if (!world.coalitions) world.coalitions = [];
}

export function createCoalition(
  world: WorldState,
  params: { countryId: string; name: string; abbreviation: string; color?: string; founderPartyId: string; actorId?: string },
): CoalitionRecord {
  const founderParty = world.parties[params.founderPartyId];
  if (!founderParty) throw new Error(`Unknown party ${params.founderPartyId}`);
  if (!world.countries[params.countryId]) throw new Error(`Unknown country ${params.countryId}`);
  if (founderParty.countryId !== params.countryId) throw new Error("Founder party is not in the coalition country");
  const name = params.name.trim();
  const abbreviation = params.abbreviation.trim();
  if (!name || !abbreviation) throw new Error("Coalition name and abbreviation are required");
  if (world.coalitions.some((co) => co.countryId === params.countryId && co.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`Coalition name already exists in ${params.countryId}`);
  }
  if (world.coalitions.some((co) => co.countryId === params.countryId && co.abbreviation.toLowerCase() === abbreviation.toLowerCase())) {
    throw new Error(`Coalition abbreviation already exists in ${params.countryId}`);
  }
  if (founderParty.coalitionId || world.coalitions.some((co) => co.memberPartyIds.includes(params.founderPartyId))) {
    throw new Error("Party is already in a coalition");
  }
  const actorId = params.actorId ?? params.founderPartyId;
  if (!isPartyLeadershipAuthority(world, params.founderPartyId, actorId)) {
    throw new Error("Coalition creation requires the national chair or acting vice chair");
  }
  const seq = world.coalitions.length > 0 ? Math.max(...world.coalitions.map((c) => c.sequentialId)) + 1 : 1;
  const id = `coalition-${params.countryId}-${seq}`;
  const rec: CoalitionRecord = {
    id,
    sequentialId: seq,
    countryId: params.countryId,
    name,
    abbreviation,
    color: params.color ?? "#888888",
    memberPartyIds: [params.founderPartyId],
    chairPartyId: params.founderPartyId,
    chairCharacterId: (founderParty?.chairId as string | null) ?? null,
    disbandVote: null,
    createdAtTurn: world.meta.turn,
    updatedAtTurn: world.meta.turn,
  };
  world.coalitions.push(rec);
  // Keep the party-side membership pointer in sync with the coalition record.
  const partyExt = world.parties[params.founderPartyId] as unknown as Record<string, unknown>;
  if (partyExt) partyExt["coalitionId"] = id;
  return rec;
}

export function joinCoalition(world: WorldState, coalitionId: string, partyId: string, actorId?: string): void {
  const co = world.coalitions.find((c) => c.id === coalitionId);
  if (!co) throw new Error(`Unknown coalition ${coalitionId}`);
  const party = world.parties[partyId];
  if (!party) throw new Error(`Unknown party ${partyId}`);
  if (party.countryId !== co.countryId) throw new Error("Party is not in the coalition country");
  if (co.memberPartyIds.includes(partyId)) throw new Error("Party already in coalition");
  if (party.coalitionId || world.coalitions.some((candidate) => candidate.memberPartyIds.includes(partyId))) {
    throw new Error("Party is already in a coalition");
  }
  if (!isPartyLeadershipAuthority(world, partyId, actorId ?? partyId)) {
    throw new Error("Joining a coalition requires the national chair or acting vice chair");
  }
  co.memberPartyIds.push(partyId);
  co.updatedAtTurn = world.meta.turn;
  const partyExt = world.parties[partyId] as unknown as Record<string, unknown>;
  if (partyExt) partyExt["coalitionId"] = co.id;
}

export function initiateDisbandVote(world: WorldState, coalitionId: string, initiatorPartyId: string, actorId?: string): void {
  const co = world.coalitions.find((c) => c.id === coalitionId);
  if (!co) throw new Error(`Unknown coalition ${coalitionId}`);
  if (!co.memberPartyIds.includes(initiatorPartyId)) throw new Error("Initiator not in coalition");
  if (!isPartyLeadershipAuthority(world, initiatorPartyId, actorId ?? initiatorPartyId)) {
    throw new Error("Disband votes require the national chair or acting vice chair");
  }
  if (co.disbandVote) throw new Error("Disband vote already active");
  co.disbandVote = {
    initiatedByPartyId: initiatorPartyId,
    initiatedAtTurn: world.meta.turn,
    expiresOnTurn: world.meta.turn + COALITION_DISBAND_VOTE_DURATION_TURNS,
    votes: {},
  };
  co.updatedAtTurn = world.meta.turn;
}

export function voteDisband(world: WorldState, coalitionId: string, partyId: string, vote: "yes" | "no"): void {
  const co = world.coalitions.find((c) => c.id === coalitionId);
  if (!co) throw new Error(`Unknown coalition ${coalitionId}`);
  if (!co.disbandVote) throw new Error("No active disband vote");
  if (!co.memberPartyIds.includes(partyId)) throw new Error("Party not in coalition");
  co.disbandVote.votes[partyId] = vote;
  co.updatedAtTurn = world.meta.turn;
}

export function resolveExpiredDisbandVotes(world: WorldState, _rng: WorldRng): { resolved: number; disbanded: number } {
  const turn = world.meta.turn;
  let resolved = 0;
  let disbanded = 0;
  const toDelete: string[] = [];
  for (const co of world.coalitions) {
    if (!co.disbandVote) continue;
    if (co.disbandVote.expiresOnTurn > turn) continue;
    resolved++;
    const yesVotes = Object.values(co.disbandVote.votes).filter((v) => v === "yes").length;
    const totalMembers = co.memberPartyIds.length;
    const majorityThreshold = Math.floor(totalMembers / 2) + 1;
    if (yesVotes >= majorityThreshold) {
      // Disband: clear coalitionId on members, delete coalition
      for (const pid of co.memberPartyIds) {
        const partyExt = world.parties[pid] as unknown as Record<string, unknown> | undefined;
        if (partyExt && partyExt["coalitionId"] === co.id) delete partyExt["coalitionId"];
      }
      toDelete.push(co.id);
      world.news.push({
        turn: world.meta.turn,
        date: world.meta.date,
        headline: `Coalition "${co.name}" disbanded by majority vote (${yesVotes}/${totalMembers})`,
      });
      disbanded++;
    } else {
      co.disbandVote = null;
      co.updatedAtTurn = world.meta.turn;
      world.news.push({
        turn: world.meta.turn,
        date: world.meta.date,
        headline: `Coalition "${co.name}" disband vote failed (${yesVotes}/${totalMembers} yes)`,
      });
    }
  }
  if (toDelete.length > 0) {
    world.coalitions = world.coalitions.filter((c) => !toDelete.includes(c.id));
  }
  for (const co of world.coalitions) {
    if (co.chairPartyId) syncCoalitionChairsForParty(world, co.chairPartyId);
  }
  return { resolved, disbanded };
}

export function syncCoalitionChairsForParty(world: WorldState, partyId: string): void {
  const currentChair = world.parties[partyId]?.chairId ?? null;
  for (const co of world.coalitions) {
    if (co.chairPartyId !== partyId || co.chairCharacterId === currentChair) continue;
    co.chairCharacterId = currentChair;
    co.updatedAtTurn = world.meta.turn;
  }
}
