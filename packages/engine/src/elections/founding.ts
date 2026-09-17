import type { WorldRng } from "../rng.js";
import type { WorldState } from "../types.js";
import { pickNextCanonicalCycle } from "../electionEngine/resolution/canonicalCycle.js";
import type { ElectionPlan } from "../electionEngine/resolution/electionSpawning.js";
import {
  cycleContextForWorld,
  electionRecordId,
  electionSeriesForWorld,
  fillCandidates,
  recordSeriesKey,
  seriesKey,
} from "./orchestration.js";
import type { ElectionRecord } from "./types.js";

/**
 * Founding / pre-iteration lifecycle (#223).
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
 * Native port: `WorldMeta.preIteration` / `preIterationTurns` (`../types.ts`)
 * are stamped by the explicit world-setup opt-in
 * (`NewWorldOptions.foundingElections`, default OFF) and cleared here.
 * `cycleContextForWorld` (`./orchestration.ts`) threads them into the
 * canonical context, so the already-ported founding branch in
 * `pickNextCanonicalCycle` schedules the cycle-0 sweep and the
 * canonical-spawner guards stay suppressed while the phase runs. The New
 * Game "founding" initialization only selects authored legislature
 * composition — it is not this lifecycle and never drives the badge.
 *
 * Deliberate deviations, all documented at the opt-in: no preset-default
 * auto-enable (reference defaults 1953-default/1979-default on), no priors
 * vacant-chamber seeding (founding races seat the authored cast through the
 * real tally path), and a 0-based offset stamp (`preIterationTurns` =
 * completion turn, where the 1-based reference stamps `completedTurn - 1`).
 *
 * Creation-time deadlock diagnosis: the per-type planners
 * (`planNextElectionForType`, `planNextHouseElection`,
 * `planNextCommonsElection` in `electionSpawning.ts`) bail with null while
 * `ctx.preIterationActive` is set, so stamping the marker and then running
 * the normal `runElectionTimers` sweep spawns ZERO races — the detector's
 * at-least-one-resolved guard can never fire, the phase never completes,
 * and the calendar stays frozen forever. The dedicated `runFoundingSweep`
 * below therefore calls `pickNextCanonicalCycle` directly (which owns the
 * founding branch) instead of going through those planners. It runs once,
 * at creation, and never writes candidacies (no `runAutoReelectionEntry`),
 * so world setup cannot re-enter player state.
 */
export function isFoundingActive(
  elections: readonly ElectionRecord[] | undefined | null
): boolean {
  if (!Array.isArray(elections)) return false;
  return elections.some(
    (record) => record != null && record.cycle === 0 && record.status !== "resolved"
  );
}

/**
 * Port of `detectPreIterationComplete`
 * (`src/lib/turn/preIterationLifecycle.ts`). Runs after election resolution
 * each turn; a no-op unless a founding phase is active.
 *
 * Complete once no cycle-0 race is still pending (active/upcoming) AND at
 * least one has resolved — the latter guards against firing before the
 * sweep exists. Like the reference, a resolver closing a race with no
 * candidates or no votes must not read as complete, so every resolved
 * cycle-0 race needs candidate coverage (at least one candidate) and tally
 * coverage (a positive vote total). Adapted to solo storage: candidates and
 * tallies live on the record itself (`candidates`, `tally`), not in
 * separate `electionCandidates` / `electionVoteTallies` collections.
 *
 * On completion the marker flips off, `completedTurn` is stamped, and
 * `preIterationTurns` takes the completion turn so the calendar resumes at
 * the era start (see `WorldMeta.preIterationTurns`). Returns true exactly
 * when this call completed the phase.
 */
export function detectFoundingComplete(world: WorldState): boolean {
  if (world.meta.preIteration?.active !== true) return false;
  const founding = world.elections.filter(
    (record) => record != null && record.cycle === 0
  );
  if (founding.some((record) => record.status === "active" || record.status === "upcoming")) {
    return false;
  }
  const resolved = founding.filter((record) => record.status === "resolved");
  if (resolved.length === 0) return false;
  for (const record of resolved) {
    if (!Array.isArray(record.candidates) || record.candidates.length === 0) return false;
    let votes = 0;
    if (record.tally && typeof record.tally === "object") {
      for (const count of Object.values(record.tally)) {
        if (typeof count === "number" && Number.isFinite(count)) votes += count;
      }
    }
    if (votes <= 0) return false;
  }
  world.meta.preIteration.active = false;
  world.meta.preIteration.completedTurn = world.meta.turn;
  world.meta.preIterationTurns = world.meta.turn;
  return true;
}

/**
 * Idempotent world-setup stamp for the founding lifecycle. Sets
 * `preIteration = { active: true, startedTurn }` with `preIterationTurns = 0`
 * exactly once: a no-op when a phase is already active, and — critically —
 * never reopens a completed phase (a present `completedTurn` stays final so
 * a re-created or re-imported world cannot resurrect the freeze). Returns
 * true exactly when this call stamped the marker.
 */
export function stampFoundingMarker(world: WorldState): boolean {
  const marker = world.meta.preIteration;
  if (marker?.active === true) return false;
  if (typeof marker?.completedTurn === "number") return false;
  world.meta.preIteration = { active: true, startedTurn: world.meta.turn };
  world.meta.preIterationTurns = 0;
  return true;
}

/**
 * Safety bound on founding races per sweep. One race per in-scope series is
 * the expected shape (a 1953 US world enumerates a few hundred series); the
 * cap only guards pathological packs and keeps the sweep plus candidate fill
 * a bounded creation-time cost.
 */
export const MAX_FOUNDING_RACES = 600;

/**
 * Dedicated bounded founding sweep. Runs once at world creation after
 * `stampFoundingMarker`, while the marker is active: every in-scope series
 * without an existing record gets one real cycle-0 race through the ported
 * founding branch in `pickNextCanonicalCycle` (fixed 24-turn primary + 24
 * turn general starting now), activated and candidate-filled in id-sorted
 * order exactly like the per-turn timer path. Series whose type has no
 * canonical schedule this era (era-gated probe returns null — e.g. ES 1953
 * Franco) are skipped, as are series that already hold any record, so the
 * sweep is idempotent. Returns the number of races spawned.
 *
 * Deliberately NOT `runElectionTimers`: those planners return null while
 * the marker is active (see the module doc), and the timer path also writes
 * player candidacies via `runAutoReelectionEntry`, which has no business
 * running during world setup.
 */
export function runFoundingSweep(world: WorldState, rng: WorldRng, maxRaces: number = MAX_FOUNDING_RACES): number {
  if (world.meta.preIteration?.active !== true) return 0;
  const cap = Number.isFinite(maxRaces) && maxRaces > 0 ? Math.floor(maxRaces) : 0;
  if (cap <= 0) return 0;
  const ctx = cycleContextForWorld(world);
  const turn = world.meta.turn;
  const occupied = new Set(world.elections.map((record) => recordSeriesKey(record)));
  const fresh: ElectionRecord[] = [];
  for (const spec of electionSeriesForWorld(world)) {
    if (fresh.length >= cap) break;
    const key = seriesKey(spec);
    if (occupied.has(key)) continue;
    const spawn = pickNextCanonicalCycle({
      electionType: spec.electionType,
      prevCycle: 0,
      currentTurn: turn,
      ctx,
      countryId: spec.countryId,
      ...(spec.senateClass !== undefined ? { senateClass: spec.senateClass } : {}),
      ...(spec.chamberClass !== undefined ? { chamberClass: spec.chamberClass } : {}),
    });
    if (!spawn || spawn.cycle !== 0) continue;
    occupied.add(key);
    const plan = {
      electionType: spec.electionType,
      countryId: spec.countryId,
      state: spec.state,
      cycle: spawn.cycle,
    } as ElectionPlan;
    fresh.push({
      id: electionRecordId(plan, spec.senateClass ?? spec.chamberClass),
      electionType: spec.electionType,
      countryId: spec.countryId,
      ...(spec.state !== undefined ? { state: spec.state } : {}),
      ...((spec.senateClass ?? spec.chamberClass) !== undefined
        ? { senateClass: (spec.senateClass ?? spec.chamberClass) as 1 | 2 | 3 }
        : {}),
      cycle: spawn.cycle,
      status: spawn.startTurn <= turn ? "active" : "upcoming",
      startTurn: spawn.startTurn,
      primaryEndTurn: spawn.primaryEndTurn,
      endTurn: spawn.endTurn,
      totalSeats: spec.totalSeats,
      chamberKey: spec.chamberKey,
      candidates: [],
      tally: {},
    });
  }
  for (const record of fresh.sort((a, b) => a.id.localeCompare(b.id))) {
    world.elections.push(record);
    if (record.status === "upcoming" && turn >= record.startTurn) record.status = "active";
    if (record.status === "active" && record.candidates.length === 0) {
      fillCandidates(world, rng, record);
    }
  }
  return fresh.length;
}
