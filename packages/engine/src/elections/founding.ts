import type { ElectionRecord } from "./types.js";

/**
 * Founding / pre-iteration lifecycle projection (#223).
 *
 * Reference (AHDGame at e364c0495): the authoritative signal is the global
 * `GameState.preIteration` (`src/lib/db/types/gameState.ts:143-159`) —
 * stamped `{ active: true, startedTurn: 1 }` with `preIterationTurns = 0` by
 * the reset bootstrap opt-in (`src/lib/admin/resetGameWorld.ts:363-367`),
 * kept alive while cycle-0 founding races are unresolved, and cleared by
 * `detectPreIterationComplete` (`src/lib/turn/preIterationLifecycle.ts`) once
 * every founding race has resolved with full candidate + tally coverage
 * (`preIterationTurns = completedTurn - 1`). The status bar renders its
 * "Founding" badge exactly while that flag is active
 * (`src/components/StatusBar.tsx:371-376`).
 *
 * Native has no bootstrap opt-in and no persisted lifecycle marker:
 * `WorldMeta` carries no preIteration field (`../types.ts`), world creation
 * seats authored compositions with `elections: []` (`../world.ts`), and
 * `cycleContextForWorld` hardcodes `preIterationActive: false`
 * (`./orchestration.ts`). The New Game "founding" initialization only selects
 * authored legislature composition — it is not the reference lifecycle and
 * must not drive the badge. The ported founding branch in
 * `pickNextCanonicalCycle` and the canonical-spawner guards stay dormant
 * until a real bootstrap spawner exists.
 *
 * So this projects only the observable leg of the reference detector: the
 * badge is active while at least one real cycle-0 founding race is
 * unresolved. No dates, no turn-zero guesses, no invented flag — and no
 * persisted field, so existing save bytes and hashes are untouched. On
 * today's engine this is false for every reachable world (scheduling starts
 * at cycle >= 1), which is the honest answer until cycle-0
 * spawning/resolution and the calendar offset land.
 */
export function isFoundingActive(
  elections: readonly ElectionRecord[] | undefined | null
): boolean {
  if (!Array.isArray(elections)) return false;
  return elections.some(
    (record) => record != null && record.cycle === 0 && record.status !== "resolved"
  );
}
