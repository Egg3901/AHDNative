import type { WorldState } from "../types.js";
import type { ReferendumRecord } from "./types.js";
import { seededVariance } from "./seededVariance.js";

/**
 * W25: referendumLifecycle. Ports the vote-resolution edge of mainline's
 * five-stage state machine (src/lib/referendum/processReferendumLifecycle.ts,
 * live via the `referendumLifecycle` turn phase, turnPhaseNames.ts:124,
 * stateEffectsPhase.ts:521-526, registered immediately after
 * `independenceDesireDrift` — mirrored here by devolution/phases.ts running
 * before referendum/phases.ts in registry.ts):
 *
 *   granted     -> campaigning              PORT-STUB (not ported this wave)
 *   campaigning -> polling                  PORT-STUB (not ported this wave)
 *   polling     -> actuating | settled      PORTED (this file)
 *   actuating   -> completed | cancelled    PORT-STUB (not ported this wave)
 *
 * Why only one edge: the other three all depend on systems AHDClient does not
 * have yet —
 *  - granted->campaigning and campaigning->polling need the Layer-1 cohort
 *    engine (buildReferendumCohorts/referendumYesShare,
 *    src/lib/referendum/cohortEngine.ts + resolveYesShare.ts) and poll-history
 *    tracking (upsertPollPoint) to produce a real yesShare to vote on.
 *  - actuating->completed|cancelled needs the Westminster/Dáil consent-bill
 *    gate (processReferendumLifecycle.ts:216-333) plus the secession/
 *    reunification "actuation" engine (transfer/actuateReferendum.ts) that
 *    actually mutates country/region ownership — a materially different,
 *    large port on its own.
 *  - There is also no `requestReferendum` player action ported yet
 *    (src/lib/referendum/requestReferendum.ts, gated on
 *    `referendumRequestEligibility` + the independence-desire threshold from
 *    independenceDesireDrift.ts), so nothing in solo can create a "granted"
 *    record today. This file's phase is therefore a real, tested transition
 *    on any `world.referendums` record a future wave's request action (or a
 *    test fixture) puts into "polling" — not dead code, just not yet
 *    reachable end-to-end.
 *
 * `resolveReferendumVote` below is a verbatim port of
 * src/lib/constants/referendum.ts:152-165 (constants CAMPAIGN_VARIANCE_BAND=4,
 * REFERENDUM_PASS_THRESHOLD=50 also verbatim). The variance source is now
 * also verbatim: `seededVariance(id, turn)` (see seededVariance.ts), matching
 * mainline's FNV hash over the record id + turn. This phase draws nothing
 * from the shared world RNG (see seededVariance.ts file doc for the RNG
 * policy and why the old `rng.next() * 2 - 1` draw was reference-divergent).
 */

export const CAMPAIGN_VARIANCE_BAND = 4;
export const REFERENDUM_PASS_THRESHOLD = 50;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function resolveReferendumVote(args: {
  yesShare: number;
  varianceRoll: number;
}): { finalYesShare: number; turnout: number; passed: boolean } {
  const swing = clamp(args.varianceRoll, -1, 1) * CAMPAIGN_VARIANCE_BAND;
  const finalYesShare = clamp(args.yesShare + swing, 0, 100);
  const turnout = clamp(55 + Math.abs(finalYesShare - 50) * 0.6, 0, 100);
  return {
    finalYesShare,
    turnout,
    passed: finalYesShare > REFERENDUM_PASS_THRESHOLD,
  };
}

export function runReferendumLifecycle(world: WorldState): void {
  for (const ref of world.referendums) {
    if (ref.status !== "polling") continue;
    const outcome = resolveReferendumVote({ yesShare: ref.yesShare, varianceRoll: seededVariance(ref.id, world.meta.turn) });
    ref.finalYesShare = outcome.finalYesShare;
    ref.turnout = outcome.turnout;
    ref.passed = outcome.passed;
    ref.resolvedTurn = world.meta.turn;
    if (outcome.passed) {
      // actuating->completed|cancelled is PORT-STUB (see file doc): the
      // record parks in "actuating" rather than fabricating a secession
      // outcome AHDClient has no engine for yet.
      ref.status = "actuating";
    } else {
      ref.status = "settled";
    }
    const label = ref.kind === "independence" ? "independence" : "reunification";
    world.news.push({
      turn: world.meta.turn,
      date: world.meta.date,
      headline: outcome.passed
        ? `${ref.regionId} votes Yes on ${label} (${outcome.finalYesShare.toFixed(1)}%)`
        : `${ref.regionId} votes No on ${label} (${outcome.finalYesShare.toFixed(1)}% Yes)`,
    });
  }
}

export type { ReferendumRecord };
