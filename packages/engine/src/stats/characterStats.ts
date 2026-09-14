/**
 * RPG stat system constants, allocation and display helpers.
 *
 * Ported from AHDGame `src/lib/stats/statsConstants.ts`,
 * `src/lib/stats/statMultiplier.ts`, and `src/lib/stats/statMeta.ts` at
 * e364c04954ed628beef73a993a8e9e156650a31e. The engine keeps its own copy
 * because `@ahd/game-rules` is provenance-pinned to the fundraiser action
 * scope only; every magnitude below is byte-identical to the cited source.
 *
 * Seven stats, each a float clamped to [1, 10], allocated at character
 * creation from a fixed point budget and shaped by play.
 */

/** The seven stat keys, in canonical display order. Source: statsConstants.ts STAT_KEYS. */
export const STAT_KEYS = [
  "charisma",
  "debate",
  "energy",
  "fundraising",
  "businessAcumen",
  "statecraft",
  "intellect",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

/** Persisted under `player.stats`. Each value is a float clamped to [1, 10]. */
export type CharacterStats = Record<StatKey, number>;

// ── Range & allocation ──────────────────────────────────────────────────────
export const STAT_MIN = 1;
export const STAT_MAX = 10;
/** Total points spent across all seven stats at creation (min 1 each → 21 free). */
export const STAT_POINT_BUDGET = 28;
/** Free points distributable above the 1-floor: 28 − 7. */
export const STAT_FREE_POINTS = STAT_POINT_BUDGET - STAT_KEYS.length;

// ── Efficacy multiplier ───────────────────────────────────────────────────────
/** Gentle ±20% swing: slope per point away from the pivot. */
export const EFFICACY_SLOPE = 0.04;
/** Stat value that yields a neutral 1.0× multiplier. */
export const EFFICACY_PIVOT = 5.5;
/** Neutral fallback for characters that predate the stat system (pre-migration). */
export const NEUTRAL_STAT = EFFICACY_PIVOT;

/** Energy-scaled action economy limits. Source: statsConstants.ts ENERGY_*_ACTION_CAP/HOARD_THRESHOLD. */
export const ENERGY_BASE_ACTION_CAP = 200;
export const ENERGY_MAX_ACTION_CAP = 250;
export const ENERGY_BASE_HOARD_THRESHOLD = 100;
export const ENERGY_MAX_HOARD_THRESHOLD = 125;

/** Clamp a stat value to the legal [STAT_MIN, STAT_MAX] range. Source: statsConstants.ts clampStat. */
export function clampStat(value: number): number {
  return Math.min(STAT_MAX, Math.max(STAT_MIN, value));
}

/** The all-floor opener: every stat at STAT_MIN, STAT_FREE_POINTS unspent. */
export function defaultStatBuild(): CharacterStats {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, STAT_MIN])) as CharacterStats;
}

/**
 * Gentle ±20% efficacy multiplier for a stat value. Applied to action OUTCOMES.
 * Source: statMultiplier.ts statMultiplier.
 */
export function statMultiplier(stat: number): number {
  return 1 + (clampStat(stat) - EFFICACY_PIVOT) * EFFICACY_SLOPE;
}

/** Linear interpolation across the legal [1, 10] stat band. Source: statMeta.ts lerpByStat. */
function lerpByStat(value: number, atMin: number, atMax: number): number {
  const t = (clampStat(value) - STAT_MIN) / (STAT_MAX - STAT_MIN);
  return atMin + (atMax - atMin) * t;
}

/**
 * Short, stat-specific summary of the current mechanical bonus at a stat value.
 * Energy reports concrete action-cap/bank numbers; every other stat reports its
 * efficacy multiplier. Source: statMeta.ts statBonus.
 */
export function statBonus(key: StatKey, value: number): { label: string; detail: string } {
  if (key === "energy") {
    const cap = Math.round(lerpByStat(value, ENERGY_BASE_ACTION_CAP, ENERGY_MAX_ACTION_CAP));
    const bank = Math.round(lerpByStat(value, ENERGY_BASE_HOARD_THRESHOLD, ENERGY_MAX_HOARD_THRESHOLD));
    return { label: `${cap} cap`, detail: `${cap} action stockpile cap · bank up to ${bank}` };
  }
  const mult = statMultiplier(value);
  const pct = Math.round((mult - 1) * 100);
  const signed = `${pct > 0 ? "+" : ""}${pct}%`;
  return {
    label: `${mult.toFixed(2)}x`,
    detail: `${mult.toFixed(2)}x effectiveness (${signed} vs. the baseline at ${EFFICACY_PIVOT})`,
  };
}

export type StatAllocationResult =
  | { ok: true; stats: CharacterStats }
  | { ok: false; error: string };

/**
 * Pure validator for a creation/grandfather stat allocation. Enforces exactly the
 * seven canonical keys, each an integer in [1, 10], summing to STAT_POINT_BUDGET.
 * Source: src/lib/stats/validateStatAllocation.ts validateStatAllocation.
 */
export function validateStatAllocation(input: unknown): StatAllocationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Stats must be an object." };
  }
  const keys = Object.keys(input as Record<string, unknown>);
  if (keys.length !== STAT_KEYS.length) {
    return { ok: false, error: `Expected exactly ${STAT_KEYS.length} stats.` };
  }
  const stats = {} as CharacterStats;
  let sum = 0;
  for (const key of STAT_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return { ok: false, error: `Stat "${key}" must be an integer.` };
    }
    if (value < STAT_MIN || value > STAT_MAX) {
      return { ok: false, error: `Stat "${key}" must be between ${STAT_MIN} and ${STAT_MAX}.` };
    }
    stats[key] = value;
    sum += value;
  }
  if (sum !== STAT_POINT_BUDGET) {
    return { ok: false, error: `Stats must total exactly ${STAT_POINT_BUDGET} (got ${sum}).` };
  }
  return { ok: true, stats };
}
