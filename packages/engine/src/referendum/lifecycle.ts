import type { WorldState } from "../types.js";
import type { ReferendumRecord } from "./types.js";
import {
  referendumYesShare,
  upsertPollPoint,
  type ReferendumCohort,
} from "./cohort.js";
import { seededVariance } from "./seededVariance.js";

/**
 * W25: referendumLifecycle. Ports the vote-resolution edge of mainline's
 * five-stage state machine (src/lib/referendum/processReferendumLifecycle.ts,
 * live via the `referendumLifecycle` turn phase, turnPhaseNames.ts:124,
 * stateEffectsPhase.ts:521-526, registered immediately after
 * `independenceDesireDrift` (mirrored here by devolution/phases.ts running
 * before referendum/phases.ts in registry.ts):
 *
 *   granted     -> campaigning              PORTED (timer + cohort snapshot + opening poll)
 *   campaigning -> polling                  PORTED (timer + canonical recompute + poll snapshot)
 *   polling     -> actuating | settled      PORTED (this file, resolves on the canonical share)
 *   actuating   -> completed | cancelled    PORT-STUB (not ported this wave)
 *
 * The two campaign edges port mainline's status transitions (which are pure
 * timer gates: granted flips next turn unconditionally; campaigning flips when
 * `campaignCloseTurn != null && currentTurn >= campaignCloseTurn`) AND the
 * data writes that make the vote resolve on computed rather than stale data:
 *  - granted->campaigning snapshots the cohort baseline and seeds the opening
 *    poll point (processReferendumLifecycle.ts:105-129). Mainline builds the
 *    baseline from the Layer-1 bucket profile; AHDNative regions have no
 *    Layer-1 substrate, so this takes mainline's own verbatim fallback for
 *    exactly that case (buildCohortBaseline: a single `{ groupId: "_all" }`
 *    cohort with yesLean = opening desire). The wire "opened" event is
 *    skipped: AHDClient has no wire (mainline itself treats wire writes as
 *    best-effort `.catch(() => {})`).
 *  - campaigning recomputes the canonical Yes share every turn via
 *    `referendumYesShare` (cohort aggregate, PS spend folded in) and upserts
 *    the per-turn poll snapshot, folding the final reading into the
 *    campaigning->polling transition write (processReferendumLifecycle.ts:131-
 *    201). The wire "swing" event is skipped for the same reason as above.
 *    `buildReferendumCohorts` / the affinity table / the bucket profile stay
 *    unported until a Layer-1 substrate exists (see cohort.ts file doc).
 *  - polling resolves on the canonical aggregate, never the stored scalar
 *    (processReferendumLifecycle.ts:203-214).
 *  - actuating->completed|cancelled needs the Westminster/Dail consent-bill
 *    gate (processReferendumLifecycle.ts:216-333) plus the secession/
 *    reunification "actuation" engine (transfer/actuateReferendum.ts) that
 *    actually mutates country/region ownership; a materially different,
 *    large port on its own.
 *  - `actions/execute.ts` now exposes the bounded Native equivalent of
 *    `requestReferendum`: it applies the source eligibility gate and writes a
 *    granted record with the window the grant would have written
 *    (`campaignOpenTurn`, `campaignCloseTurn = grantTurn +
 *    CAMPAIGN_WINDOW_TURNS`, `campaignBaseYesShare`). Native still has no
 *    devolved First Minister office ledger, so the action catalog owns the
 *    source's three-point cost. Consent bills and actuation remain explicitly
 *    unported; a passed vote parks in `actuating` below.
 * Each record advances at most one edge per turn, matching mainline's
 * per-record `continue` after each branch.
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
/** Campaign length once granted, in turns. Verbatim from
 * `src/lib/constants/referendum.ts:CAMPAIGN_WINDOW_TURNS`. */
export const CAMPAIGN_WINDOW_TURNS = 48;

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

/**
 * Cohort baseline for a region with no Layer-1 substrate: mainline's verbatim
 * `buildCohortBaseline` fallback (processReferendumLifecycle.ts:55-66), a
 * single synthetic cohort so the aggregate equals the opening desire. The
 * re-centering guarantee then holds by construction.
 */
function fallbackCohortBaseline(openDesire: number): ReferendumCohort[] {
  return [{ groupId: "_all", share: 1, turnout: 60, yesLean: openDesire }];
}

export function runReferendumLifecycle(world: WorldState): void {
  for (const ref of world.referendums) {
    if (ref.status === "granted") {
      // Mainline flips granted->campaigning unconditionally on the next turn
      // and snapshots the cohort model anchored to the opening desire
      // (processReferendumLifecycle.ts:105-129). One edge per turn: do not
      // fall through to the polling gate.
      const openDesire = ref.campaignBaseYesShare ?? ref.yesShare;
      ref.pollHistory = upsertPollPoint(
        ref.pollHistory,
        ref.campaignOpenTurn ?? world.meta.turn,
        openDesire
      );
      ref.cohortBaseline = fallbackCohortBaseline(openDesire);
      ref.status = "campaigning";
      continue;
    }
    if (ref.status === "campaigning") {
      // Live-seed a baseline for a campaign that predates the cohort model,
      // mirroring mainline (processReferendumLifecycle.ts:133-139).
      if (!ref.cohortBaseline || ref.cohortBaseline.length === 0) {
        ref.cohortBaseline = fallbackCohortBaseline(ref.campaignBaseYesShare ?? ref.yesShare);
      }
      // Canonical Yes share = cohort aggregate (PS folded in), the value the
      // vote will resolve on ; never the stale stored scalar.
      const canonical = referendumYesShare(ref);
      // Live-seed an opening poll point for a campaign that predates poll
      // history, then record this turn's reading (mainline lines 159-167).
      let pollHistory = ref.pollHistory ?? [];
      if (pollHistory.length === 0) {
        pollHistory = upsertPollPoint(
          pollHistory,
          ref.campaignOpenTurn ?? world.meta.turn,
          ref.campaignBaseYesShare ?? ref.yesShare
        );
      }
      pollHistory = upsertPollPoint(pollHistory, world.meta.turn, canonical);
      // Display-only write, matching mainline's else branch: the stored scalar
      // follows the canonical aggregate every turn.
      ref.pollHistory = pollHistory;
      ref.yesShare = canonical;
      // The grant-set window closes the campaign (`campaignCloseTurn != null
      // && currentTurn >= campaignCloseTurn`). A null close never fires,
      // matching the source guard; the lifecycle does not invent the window.
      if (ref.campaignCloseTurn != null && world.meta.turn >= ref.campaignCloseTurn) {
        ref.status = "polling";
      }
      continue;
    }
    if (ref.status !== "polling") continue;
    // Authoritative Yes share = the cohort aggregate (PS + ground game folded
    // in) ; independent of any raced display updates (mainline lines 203-207).
    const canonicalYesShare = referendumYesShare(ref);
    const outcome = resolveReferendumVote({ yesShare: canonicalYesShare, varianceRoll: seededVariance(ref.id, world.meta.turn) });
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
