/**
 * Singleplayer difficulty contract (issue #334, difficulty axis).
 *
 * Canonical source: AHDGame `src/lib/db/types/gameState.ts`
 * (`SingleplayerDifficulty = "easy" | "normal" | "hard"`), accepted values
 * and the `normal` default from
 * `src/app/api/singleplayer/new-game/route.ts`, and the resource tuning
 * table from `src/lib/singleplayerDifficulty/rules/index.ts`. Difficulty
 * says how competently autonomous politicians perform — never which
 * activities they may perform (that is the autonomy tier, a separate axis).
 */

export const SINGLEPLAYER_DIFFICULTIES = ["easy", "normal", "hard"] as const;

export type SingleplayerDifficulty = (typeof SINGLEPLAYER_DIFFICULTIES)[number];

export const DEFAULT_SINGLEPLAYER_DIFFICULTY: SingleplayerDifficulty = "normal";

export interface SingleplayerNppTuning {
  /** Passive NPP action points granted by the fund phase. */
  actionPointsPerTurn: number;
  /** Maximum banked action points in the NPP fund phase. */
  actionPointCap: number;
  /** Multiplier on the donor-fund result. */
  fundMultiplier: number;
}

/**
 * Live NPP fund-phase parity constants. Normal local play stays tied to
 * these, exactly as the reference keeps normal on the live constants.
 * Source: AHDGame `src/lib/singleplayerDifficulty/rules/index.ts`
 * (NPP_ACTIONS_PER_TURN, NPP_ACTION_CAP).
 */
export const NPP_ACTIONS_PER_TURN = 2;
export const NPP_ACTION_CAP = 100;

const TUNING: Record<SingleplayerDifficulty, SingleplayerNppTuning> = {
  easy: { actionPointsPerTurn: 1, actionPointCap: 50, fundMultiplier: 0.75 },
  normal: {
    actionPointsPerTurn: NPP_ACTIONS_PER_TURN,
    actionPointCap: NPP_ACTION_CAP,
    fundMultiplier: 1,
  },
  hard: { actionPointsPerTurn: 3, actionPointCap: 150, fundMultiplier: 1.25 },
};

export function isSingleplayerDifficulty(value: unknown): value is SingleplayerDifficulty {
  return (
    typeof value === "string" &&
    (SINGLEPLAYER_DIFFICULTIES as readonly string[]).includes(value)
  );
}

export function resolveSingleplayerDifficulty(value?: unknown): SingleplayerDifficulty {
  if (value === undefined) return DEFAULT_SINGLEPLAYER_DIFFICULTY;
  if (!isSingleplayerDifficulty(value)) {
    throw new Error(`Unknown difficulty: ${String(value)}`);
  }
  return value;
}

export function singleplayerNppTuning(
  difficulty: SingleplayerDifficulty | undefined,
): SingleplayerNppTuning {
  return TUNING[difficulty ?? DEFAULT_SINGLEPLAYER_DIFFICULTY];
}
