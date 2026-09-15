/**
 * Singleplayer play-mode contract (issue #346, world-simulation mode).
 *
 * Canonical source: AHDGame `src/lib/db/types/gameState.ts`
 * (`SingleplayerMode = "normal" | "head-of-state" | "worldsim"`),
 * `src/app/api/singleplayer/new-game/route.ts` (mode default normal,
 * `permanentHeadOfState` set only for head-of-state) and
 * `src/lib/singleplayerServer.ts` (worldsim is a playerless world with the
 * spectator surface at `/singleplayer/worldsim`).
 *
 * Native projects the axis onto the existing `player.mode` binding:
 * career is the default (canonical normal), hos is head-of-state (bound to
 * the seeded ruling party through `player.hosPartyId`, exactly one
 * permanent role), worldsim marks a spectator world. A worldsim world still
 * carries the required `WorldState.player` record as a spectator
 * placeholder — canonical worldsim has zero characters, which Native's
 * single-document shape cannot express — so the spectator distinction is
 * enforced by the mode-gated consumers: the session offers no character
 * actions and refuses character acts, while turns run the identical engine
 * (canonical `advanceWorldsim` likewise reuses the shared turn processor).
 * Mode says who the player is, never how the world simulates.
 */

export const SINGLEPLAYER_MODES = ["career", "hos", "worldsim"] as const;

export type SingleplayerMode = (typeof SINGLEPLAYER_MODES)[number];

export const DEFAULT_SINGLEPLAYER_MODE: SingleplayerMode = "career";

export function isSingleplayerMode(value: unknown): value is SingleplayerMode {
  return (
    typeof value === "string" &&
    (SINGLEPLAYER_MODES as readonly string[]).includes(value)
  );
}

export function resolveSingleplayerMode(value?: unknown): SingleplayerMode {
  if (value === undefined) return DEFAULT_SINGLEPLAYER_MODE;
  if (!isSingleplayerMode(value)) {
    throw new Error(`Unknown play mode: ${String(value)}`);
  }
  return value;
}

/** Spectator predicate: a worldsim world has no player character. */
export function isWorldsimMode(mode: SingleplayerMode | undefined): boolean {
  return (mode ?? DEFAULT_SINGLEPLAYER_MODE) === "worldsim";
}
