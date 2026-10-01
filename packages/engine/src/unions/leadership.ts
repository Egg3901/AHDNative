import type { WorldState } from "../types.js";
import { LEADERSHIP_ELECTION_MIN_STRENGTH, unionStrength } from "./organizers.js";

export type UnionLeadershipResult =
  | { ok: true; pendingLeaderCharacterId: string | null }
  | { ok: false; reason: "union-not-found" | "wrong-country" | "suspended" | "election-not-open" | "no-organizing-strength" };

export type AcceptUnionLeadershipResult =
  | { ok: true; ownerType: "player"; ownerId: "player" }
  | { ok: false; reason: "union-not-found" | "wrong-country" | "suspended" | "no-offer" | "already-leads-union" };

/**
 * Cast the solo player's organizer-weighted leadership ballot for themselves.
 * Source rules require an open strength-threshold election and a positive
 * organizer bank; the solo world has one human organizer, represented by the
 * stable `player` identity. NPP incumbency remains in place until acceptance.
 */
export function castUnionLeadershipVote(world: WorldState, unionId: string): UnionLeadershipResult {
  const union = world.unions[unionId];
  if (!union) return { ok: false, reason: "union-not-found" };
  if (world.player.countryId !== union.countryId) return { ok: false, reason: "wrong-country" };
  if (union.suspended) return { ok: false, reason: "suspended" };
  if (unionStrength(union) < LEADERSHIP_ELECTION_MIN_STRENGTH) {
    return { ok: false, reason: "election-not-open" };
  }

  const organizer = world.unionOrganizers?.[`${union.id}:player`];
  if (!organizer || organizer.characterId !== "player" || organizer.strength <= 0) {
    return { ok: false, reason: "no-organizing-strength" };
  }

  union.leadershipVotes = { ...(union.leadershipVotes ?? {}), player: "player" };
  const weights = new Map<string, number>();
  for (const row of Object.values(world.unionOrganizers ?? {})) {
    if (row.unionId === union.id && Number.isFinite(row.strength) && row.strength > 0) {
      weights.set(row.characterId, row.strength);
    }
  }
  const tallies = new Map<string, number>();
  for (const [voterId, candidateId] of Object.entries(union.leadershipVotes)) {
    const weight = weights.get(voterId) ?? 0;
    if (weight > 0) tallies.set(candidateId, (tallies.get(candidateId) ?? 0) + weight);
  }
  const incumbent = union.ownerType === "player" ? union.ownerId ?? null : null;
  let leaderId: string | null = null;
  let leaderWeight = 0;
  for (const candidateId of [...tallies.keys()].sort()) {
    const weight = tallies.get(candidateId)!;
    if (weight > leaderWeight || (weight === leaderWeight && incumbent === candidateId)) {
      leaderId = candidateId;
      leaderWeight = weight;
    }
  }

  if (!leaderId || leaderId === incumbent) {
    union.pendingLeaderCharacterId = null;
    return { ok: true, pendingLeaderCharacterId: null };
  }
  union.pendingLeaderCharacterId = leaderId;
  return { ok: true, pendingLeaderCharacterId: leaderId };
}

/** Accept the outstanding solo-player presidency offer, preserving the old seat until this call. */
export function acceptUnionLeadership(world: WorldState, unionId: string): AcceptUnionLeadershipResult {
  const union = world.unions[unionId];
  if (!union) return { ok: false, reason: "union-not-found" };
  if (world.player.countryId !== union.countryId) return { ok: false, reason: "wrong-country" };
  if (union.suspended) return { ok: false, reason: "suspended" };
  if (union.pendingLeaderCharacterId !== "player") return { ok: false, reason: "no-offer" };

  const alreadyLeadsAnother = Object.values(world.unions).some(
    (row) => row.id !== union.id && row.ownerType === "player" && row.ownerId === "player",
  );
  if (alreadyLeadsAnother) return { ok: false, reason: "already-leads-union" };

  union.ownerType = "player";
  union.ownerId = "player";
  union.pendingLeaderCharacterId = null;
  union.updatedAtTurn = world.meta.turn;
  return { ok: true, ownerType: "player", ownerId: "player" };
}
