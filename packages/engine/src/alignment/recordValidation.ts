/**
 * Fail-closed load validation for persisted alignment rows (#112).
 *
 * Source: AHDGame src/lib/alignment/normalize.ts INVARIANT — every share is
 * a multiple of 0.01 in [0,100], and sum(shares) + nonAligned === 100.
 * "Any code path that writes `shares` without it [normalizeShares] is a
 * defect." Native's write paths (world.ts seeding, save.ts migration)
 * already route through normalizeShares, but the load path never checked
 * EXISTING rows: a corrupt or foreign row (unknown pole, off-grid share,
 * broken total) would reach contestRank/tugOfWarCandidate as if valid.
 *
 * Scope: bipolar WEST/EAST only. A row carrying any other pole key
 * (WASHINGTON/MOSCOW/BEIJING) fails closed rather than being silently
 * dropped — multipolar poles are the named B13 blocker (see
 * alignment/types.ts) and must arrive through an explicit port, never
 * through a lenient loader. This validator grants no drift, crisis, or
 * influence behavior; it only refuses to load rows the engine cannot
 * truthfully read.
 */
import { ALIGNMENT_POLES } from "./constants.js";
import type { AlignmentRecord } from "./types.js";

/** Storage grid: hundredths of a point. Source: normalize.ts UNITS_PER_POINT. */
const GRID_UNITS_PER_POINT = 100;
/** Exact distribution total. Source: normalize.ts TOTAL_UNITS. */
const DISTRIBUTION_TOTAL = 100;
/** Float-dust tolerance for grid/total comparisons (whole hundredths only). */
const EPS = 1e-6;

const isOnGrid = (v: number): boolean =>
  Number.isFinite(v) && Math.abs(v * GRID_UNITS_PER_POINT - Math.round(v * GRID_UNITS_PER_POINT)) < EPS;

const isKnownPole = (pole: string): boolean =>
  (ALIGNMENT_POLES as readonly string[]).includes(pole);

/**
 * Throw on the first present-but-invalid alignment row. Absent maps stay
 * absent (no materialization, so untouched saves round-trip byte-identical);
 * only stored rows that violate the source invariant fail closed — the same
 * absent-vs-invalid rule as the union/pension/bank-charter validators in
 * save.ts.
 */
export function validateAlignmentRecords(alignments: Record<string, AlignmentRecord>): void {
  for (const [key, record] of Object.entries(alignments)) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`Alignment ${key} has an invalid record`);
    }
    if (record.countryId !== key) {
      throw new Error(`Alignment key does not match id: ${key}`);
    }
    if (!Number.isFinite(record.updatedTurn) || record.updatedTurn < 0) {
      throw new Error(`Alignment ${key} has an invalid updatedTurn`);
    }
    if (!record.shares || typeof record.shares !== "object" || Array.isArray(record.shares)) {
      throw new Error(`Alignment ${key} has invalid shares`);
    }
    let total = 0;
    for (const [pole, value] of Object.entries(record.shares)) {
      if (!isKnownPole(pole)) {
        throw new Error(`Alignment ${key} carries an unknown pole: ${pole}`);
      }
      if (typeof value !== "number" || !isOnGrid(value) || value < 0 || value > DISTRIBUTION_TOTAL) {
        throw new Error(`Alignment ${key} has an invalid share for ${pole}`);
      }
      total += value;
    }
    if (
      typeof record.nonAligned !== "number" ||
      !isOnGrid(record.nonAligned) ||
      record.nonAligned < 0 ||
      record.nonAligned > DISTRIBUTION_TOTAL
    ) {
      throw new Error(`Alignment ${key} has an invalid nonAligned remainder`);
    }
    total += record.nonAligned;
    if (Math.abs(total - DISTRIBUTION_TOTAL) > EPS) {
      throw new Error(`Alignment ${key} shares do not sum to 100`);
    }
  }
}
