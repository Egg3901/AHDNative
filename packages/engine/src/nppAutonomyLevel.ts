/**
 * Autonomous-politician tier contract (issue #345).
 *
 * Canonical source: AHDGame `src/lib/db/types/gameState.ts`
 * (`NppAutonomyLevel = "off" | "v0" | ... | "v5"` with the tier doc:
 * off = no autonomy anywhere, v0 = shipped behavior in non-player
 * countries, v1 = v0 + governing brain, v2 = v1 + comingling with
 * player-enabled countries, v3 = full player-parity agency, v4 = v3
 * applied globally with tighter player-country throttles, v5 = v4 +
 * persistent governing goals), the shipped `v4` default from
 * `src/app/api/singleplayer/new-game/route.ts`, and the rank ordering
 * plus player-country rail from `src/lib/nppAutonomy/featureFlag.ts`
 * (`NPP_AUTONOMY_LEVEL_RANK`, `nppAutonomyLevelAtLeast`,
 * `getNppAutonomyLevelForCountry`: below v2 resolves to off in
 * player-enabled countries).
 *
 * The tier says WHICH activities autonomous politicians may perform —
 * never how competently they perform them (that is the difficulty axis,
 * a separate contract in `singleplayerDifficulty.ts`).
 */

export const NPP_AUTONOMY_LEVELS = ["off", "v0", "v1", "v2", "v3", "v4", "v5"] as const;

export type NppAutonomyLevel = (typeof NPP_AUTONOMY_LEVELS)[number];

export const DEFAULT_NPP_AUTONOMY_LEVEL: NppAutonomyLevel = "v4";

/**
 * Canonical rank ordering. Branch on `nppAutonomyLevelAtLeast`, never on
 * strict equality — `level === "v3"` silently turns a v3+ feature off at
 * v4, the bug class the reference export exists to prevent.
 * Source: AHDGame `src/lib/nppAutonomy/featureFlag.ts`.
 */
export const NPP_AUTONOMY_LEVEL_RANK: Record<NppAutonomyLevel, number> = {
  off: 0,
  v0: 1,
  v1: 2,
  v2: 3,
  v3: 4,
  v4: 5,
  v5: 6,
};

export function isNppAutonomyLevel(value: unknown): value is NppAutonomyLevel {
  return (
    typeof value === "string" &&
    (NPP_AUTONOMY_LEVELS as readonly string[]).includes(value)
  );
}

export function resolveNppAutonomyLevel(value?: unknown): NppAutonomyLevel {
  if (value === undefined) return DEFAULT_NPP_AUTONOMY_LEVEL;
  if (!isNppAutonomyLevel(value)) {
    throw new Error(`Unknown autonomy tier: ${String(value)}`);
  }
  return value;
}

/** Pure rank comparison on an already-read level: this tier and above. */
export function nppAutonomyLevelAtLeast(level: NppAutonomyLevel, min: NppAutonomyLevel): boolean {
  return NPP_AUTONOMY_LEVEL_RANK[level] >= NPP_AUTONOMY_LEVEL_RANK[min];
}

/**
 * Effective autonomy level for a specific country, after applying the
 * player-enablement rail. Non-player countries run the configured level
 * as-is; the player country only comes alive at the comingle tiers (v2
 * and above) and resolves to "off" below v2. Source: AHDGame
 * `src/lib/nppAutonomy/featureFlag.ts getNppAutonomyLevelForCountry`.
 *
 * Accepts an absent axis (resolves to the `v4` default), so worlds that
 * store only a non-default tier read through the same path as fresh
 * defaults (see WorldState.nppAutonomyLevel).
 */
export function effectiveNppAutonomyLevelForCountry(
  level: NppAutonomyLevel | undefined,
  countryId: string,
  playerCountryId: string,
): NppAutonomyLevel {
  const resolved = resolveNppAutonomyLevel(level);
  if (resolved === "off") return "off";
  if (countryId !== playerCountryId) return resolved;
  return NPP_AUTONOMY_LEVEL_RANK[resolved] >= NPP_AUTONOMY_LEVEL_RANK.v2 ? resolved : "off";
}

/** Does the country's effective tier meet `min`? (tier-gated features) */
export function nppAutonomyAtLeastForCountry(
  level: NppAutonomyLevel | undefined,
  countryId: string,
  playerCountryId: string,
  min: NppAutonomyLevel,
): boolean {
  return nppAutonomyLevelAtLeast(
    effectiveNppAutonomyLevelForCountry(level, countryId, playerCountryId),
    min,
  );
}
