/**
 * Union organizers — #320.
 *
 * Ports AHDGame's UnionOrganizer collection (src/lib/db/types/union.ts:157-179)
 * and the strength helpers (src/lib/unions/unionEconomy.ts) at pinned
 * e364c04954ed628beef73a993a8e9e156650a31e. An organizer is a character who
 * has run organize drives on one union; their banked strength is their vote
 * weight in the leadership election AND their share of political-contribution
 * payouts (distributePoliticalContributions in political.ts reads exactly the
 * { characterId, strength } shares eligibleOrganizerShares builds below).
 *
 * Native adaptations (cited, not invented):
 * - ObjectId/Dates become deterministic string ids (`${unionId}:${characterId}`)
 *   and turn numbers: JSON-safe, no ObjectId/Date/Map, same shape as Union.
 * - totalSpent is cut: the reference marks it legacy itself ("organizing now
 *   costs action points, not cash"). Drive crediting (ORGANIZE_STRENGTH_GAIN
 *   per drive to both pools) lands with the organize commands (#322); this
 *   slice records identity + strength, decays it, and pays out on it.
 * - Union.strength (the pool organizers pile into) lives on unions/types.ts
 *   Union as an optional field that absent reads as zero — the reference's
 *   own absent-means-zero rule for pre-organizing-v2 documents.
 *
 * Source: <mainline-checkout>/src/lib/db/types/union.ts UnionOrganizer
 *         <mainline-checkout>/src/lib/unions/unionEconomy.ts unionStrength,
 *         isUnionLeadershipElectionOpen, UNION_STRENGTH_DECAY_PER_TURN,
 *         ORGANIZE_STRENGTH_GAIN, LEADERSHIP_ELECTION_MIN_STRENGTH
 */

import type { WorldState } from "../types.js";
import type { InfluenceShare } from "./political.js";

/**
 * Fraction of union strength lost every turn, applied to the union pool AND
 * to each organizer's banked total. Source: unionEconomy.ts
 * UNION_STRENGTH_DECAY_PER_TURN (verbatim).
 */
export const UNION_STRENGTH_DECAY_PER_TURN = 0.005;

/** Union strength one organize drive adds. Source: unionEconomy.ts ORGANIZE_STRENGTH_GAIN. */
export const ORGANIZE_STRENGTH_GAIN = 10;

/** Strength required before organizers can vote for a president. Source: unionEconomy.ts LEADERSHIP_ELECTION_MIN_STRENGTH. */
export const LEADERSHIP_ELECTION_MIN_STRENGTH = 100;

/**
 * One organizer's banked standing in one union. JSON-safe. Keyed
 * `${unionId}:${characterId}` (mirrors Union's `${countryId}-${sectorType}`
 * deterministic identity — no ObjectId registry to collide in).
 */
export interface UnionOrganizer {
  /** `${unionId}:${characterId}`. Unique, deterministic. */
  id: string;
  /** `${countryId}-${sectorType}`. Must resolve to a recorded union. */
  unionId: string;
  /** Opaque organizer identity (character/politician id). Non-empty. */
  characterId: string;
  /**
   * Banked vote weight: what this organizer's drives added, less the same
   * per-turn decay the union pool takes. Finite, >= 0. Source: UnionOrganizer.strength.
   */
  strength: number;
  /** Drives run. Integer, >= 0. Source: UnionOrganizer.organizeCount. */
  organizeCount: number;
  createdAtTurn: number;
  updatedAtTurn: number;
}

/** Deterministic organizer id. The id IS the (union, organizer) identity invariant. */
export function organizerIdFor(unionId: string, characterId: string): string {
  return `${unionId}:${characterId}`;
}

/** Zeroed organizer row; strength accrues through organize drives (#322). */
export function createUnionOrganizer(
  unionId: string,
  characterId: string,
  turn: number,
): UnionOrganizer {
  return {
    id: organizerIdFor(unionId, characterId),
    unionId,
    characterId,
    strength: 0,
    organizeCount: 0,
    createdAtTurn: turn,
    updatedAtTurn: turn,
  };
}

/** Strength as stored, treating a missing field on pre-existing rows as zero. Source: unionEconomy.ts unionStrength. */
export function unionStrength(union: { strength?: number }): number {
  const s = union.strength;
  return typeof s === "number" && Number.isFinite(s) && s > 0 ? s : 0;
}

/**
 * True when organizers can contest the presidency. Source: unionEconomy.ts
 * isUnionLeadershipElectionOpen (verbatim threshold).
 */
export function isUnionLeadershipElectionOpen(union: { strength?: number }): boolean {
  return unionStrength(union) >= LEADERSHIP_ELECTION_MIN_STRENGTH;
}

/**
 * Strict organizer validation (#320). The id must be the deterministic
 * `${unionId}:${characterId}` join, the union must resolve to a recorded
 * union whose own (countryId, sectorType) key matches (so a hand-edited
 * unionId cannot smuggle a cross-pair pointer past the map key), the
 * organizer identity must be non-empty, and strength/count must be
 * finite non-negative (count integral). Null/undefined rows are corruption,
 * not defaultable absence — every row is explicitly recorded.
 */
export function validateUnionOrganizer(world: WorldState, organizer: UnionOrganizer): void {
  const row = organizer as unknown as Record<string, unknown>;
  const unionId = row["unionId"];
  const characterId = row["characterId"];
  const strength = row["strength"];
  const organizeCount = row["organizeCount"];
  if (
    typeof unionId !== "string" ||
    unionId.length === 0 ||
    typeof characterId !== "string" ||
    characterId.length === 0 ||
    row["id"] !== organizerIdFor(unionId, characterId)
  ) {
    throw new Error(`Invalid union organizer identity`);
  }
  // Organizer/union/country identity: the pointer must resolve to the union
  // it names, and that union's own country/sector key must agree — a rival
  // pair's id or a dangling pointer is corruption, never coverage.
  const unions = world.unions as Record<string, { id: string; countryId: string; sectorType: string }>;
  const union = unions[unionId];
  if (!union || union.id !== unionId || `${union.countryId}-${union.sectorType}` !== unionId) {
    throw new Error(`Invalid union organizer union reference for ${row["id"]}`);
  }
  if (typeof strength !== "number" || !Number.isFinite(strength) || strength < 0) {
    throw new Error(`Invalid union organizer strength for ${row["id"]}`);
  }
  if (
    typeof organizeCount !== "number" ||
    !Number.isFinite(organizeCount) ||
    !Number.isInteger(organizeCount) ||
    organizeCount < 0
  ) {
    throw new Error(`Invalid union organizer organize count for ${row["id"]}`);
  }
}

/** Strict map validation: keys must match row ids (same key-equals-id rule as corporate sectors). */
export function validateUnionOrganizers(
  world: WorldState,
  organizers: Record<string, UnionOrganizer>,
): void {
  for (const [key, organizer] of Object.entries(organizers)) {
    if (key !== (organizer as unknown as Record<string, unknown>)["id"]) {
      throw new Error(`Invalid union organizer key does not match id: ${key}`);
    }
    validateUnionOrganizer(world, organizer);
  }
}

/**
 * Lazy organizer access (#320). Absent-means-empty: pre-#320 saves carry no
 * map, and a fresh world starts with no drives run. Present-but-invalid rows
 * fail closed through validateUnionOrganizers. No RNG is consumed.
 */
export function unionOrganizers(world: WorldState): Record<string, UnionOrganizer> {
  const rows = world.unionOrganizers ?? {};
  validateUnionOrganizers(world, rows);
  world.unionOrganizers = rows;
  return rows;
}

/**
 * Eligible payout shares for one union: organizers with banked strength > 0,
 * sorted by organizer identity ascending. This is the exact InfluenceShare[]
 * shape distributePoliticalContributions takes; the sort plus the last-share
 * float absorption there keep split payouts deterministic. Mirrors the
 * reference turn query (unionId in owned set, strength > 0).
 */
export function eligibleOrganizerShares(world: WorldState, unionId: string): InfluenceShare[] {
  const rows = world.unionOrganizers ?? {};
  return Object.values(rows)
    .filter(
      (row) =>
        row.unionId === unionId &&
        typeof row.characterId === "string" &&
        typeof row.strength === "number" &&
        Number.isFinite(row.strength) &&
        row.strength > 0,
    )
    .map((row) => ({ characterId: row.characterId, strength: row.strength }))
    .sort((a, b) => (a.characterId < b.characterId ? -1 : a.characterId > b.characterId ? 1 : 0));
}

/**
 * Per-turn strength decay (#320). Multiplies the union pool and every
 * organizer bank by (1 - UNION_STRENGTH_DECAY_PER_TURN), exactly the
 * reference $mul on both collections. Suspended unions stay frozen with
 * their organizers, same as dues. Zero/absent strengths are untouched and
 * no RNG is consumed.
 */
export function decayUnionStrength(world: WorldState, turn: number): void {
  const multiplier = 1 - UNION_STRENGTH_DECAY_PER_TURN;
  const suspended = new Set<string>();
  for (const union of Object.values(world.unions)) {
    if (union.suspended) suspended.add(union.id);
  }
  for (const union of Object.values(world.unions)) {
    if (suspended.has(union.id)) continue;
    const pool = unionStrength(union);
    if (pool > 0) {
      union.strength = pool * multiplier;
      union.updatedAtTurn = turn;
    }
  }
  for (const organizer of Object.values(world.unionOrganizers ?? {})) {
    if (suspended.has(organizer.unionId)) continue;
    if (
      typeof organizer.strength === "number" &&
      Number.isFinite(organizer.strength) &&
      organizer.strength > 0
    ) {
      organizer.strength = organizer.strength * multiplier;
      organizer.updatedAtTurn = turn;
    }
  }
}
