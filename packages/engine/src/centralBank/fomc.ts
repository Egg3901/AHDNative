/**
 * Pure FOMC committee logic — issue #119 port.
 *
 * Source: AHDGame e364c04954ed628beef73a993a8e9e156650a31e
 *   src/lib/centralBank/fomc.ts ("Pure FOMC committee logic. No DB, no clock —
 *   deterministic and unit-testable."). Ported verbatim; the only change is
 *   that `computeNppChairRateTarget`/`computeNppChairRateStep` come from this
 *   package's already-ported centralBank/constants.ts (identical formulas), and
 *   FOMC_MOVE_THRESHOLD lives in constants.ts alongside the other FOMC numbers.
 *
 * Each governor seat has a hawk/dove alignment. A seat's *preferred* move is the
 * sign of the Taylor-rule step it would take on its own (the same rule the
 * autonomous single chair uses, tilted by alignment). The chair proposes a
 * motion; every seat's ballot is a direction (hike/cut/hold) and it "agrees"
 * with the motion when the directions match.
 *
 * A motion passes only on a strict majority of the FULL board — unvoted
 * (no-show) and vacant seats abstain and count against it. So a divided or
 * apathetic board holds. NPP seats auto-vote their preference the moment a
 * meeting opens; player seats vote live or fall back to abstain at resolution.
 */

import {
  FOMC_MOVE_THRESHOLD,
  computeNppChairRateStep,
  computeNppChairRateTarget,
} from "./constants.js";
import type { FomcBallot, FomcSeat, FomcVote } from "./types.js";

/** Below this absolute rate step (pp) a seat prefers to hold rather than move. Source: centralBank/fomc.ts. */
export { FOMC_MOVE_THRESHOLD };

/** Macro inputs shared by every seat when it forms a view for one meeting. Source: centralBank/fomc.ts FomcMacroContext. */
export interface FomcMacroContext {
  neutralRate: number;
  inflationRate: number;
  targetInflation: number;
  gdpGrowth: number;
  currentRate: number;
}

/**
 * The signed rate step (pp) a seat of the given alignment would take on its own.
 * Positive ⇒ wants to hike, negative ⇒ wants to cut. Source: fomc.ts seatDesiredStep.
 */
export function seatDesiredStep(alignment: "hawk" | "dove", ctx: FomcMacroContext): number {
  const target = computeNppChairRateTarget({
    neutralRate: ctx.neutralRate,
    inflationRate: ctx.inflationRate,
    targetInflation: ctx.targetInflation,
    gdpGrowth: ctx.gdpGrowth,
    alignment,
  });
  return computeNppChairRateStep({ currentRate: ctx.currentRate, targetRate: target, alignment });
}

/** Direction implied by a signed step, applying the hold deadband. Source: fomc.ts directionFromStep. */
export function directionFromStep(step: number): FomcVote {
  if (step > FOMC_MOVE_THRESHOLD) return "hike";
  if (step < -FOMC_MOVE_THRESHOLD) return "cut";
  return "hold";
}

/** The move a seat would cast for on its own. Source: fomc.ts seatPreferredVote. */
export function seatPreferredVote(alignment: "hawk" | "dove", ctx: FomcMacroContext): FomcVote {
  return directionFromStep(seatDesiredStep(alignment, ctx));
}

/**
 * The chair's motion for a meeting. When `canChangeRate` is false (per-term cap
 * hit, cooldown active, or command economy) the chair can only table a hold.
 * `proposedDelta` is the signed pp applied to primeRate if the motion passes.
 * Source: fomc.ts proposeChairMotion.
 */
export function proposeChairMotion(
  chairAlignment: "hawk" | "dove",
  ctx: FomcMacroContext,
  opts: { canChangeRate: boolean },
): { motion: FomcVote; proposedDelta: number } {
  const step = seatDesiredStep(chairAlignment, ctx);
  const dir = directionFromStep(step);
  if (!opts.canChangeRate || dir === "hold") return { motion: "hold", proposedDelta: 0 };
  return { motion: dir, proposedDelta: step };
}

/** A ballot agrees with the motion when it points the same direction. Source: fomc.ts ballotAgrees. */
export function ballotAgrees(ballot: FomcVote, motion: FomcVote): boolean {
  return ballot === motion;
}

/** Strict majority of a full board of `boardSize` seats. Source: fomc.ts majorityThreshold. */
export function majorityThreshold(boardSize: number): number {
  return Math.floor(boardSize / 2) + 1;
}

/**
 * Whether the committee can actually carry a motion right now.
 *
 * A motion needs a strict majority of the FULL board; vacant seats abstain and
 * count against it. So the board is only functional while the number of seated
 * members (any non-vacant occupant) is at least that threshold: with fewer, no
 * motion can ever pass no matter how the seated members vote, and the committee
 * is structurally dead (in the absence of a working board the chair holds the
 * rate directly). Source: fomc.ts boardCanCarryMotions (ticket #1238 follow-up).
 */
export function boardCanCarryMotions(board: readonly FomcSeat[]): boolean {
  const seated = board.filter((s) => s.occupantType !== "vacant").length;
  return seated >= majorityThreshold(board.length);
}

export interface FomcTally {
  agree: number;
  disagree: number;
  /** Seats with no ballot cast (no-show / vacant). */
  abstain: number;
  /** Votes needed to pass (majority of the full board). */
  needed: number;
  /** True once the outcome can no longer change: passed, or can't reach a majority. */
  decided: boolean;
  passed: boolean;
}

/**
 * Tally a motion against the ballots cast. Every seat that has not cast a ballot
 * abstains and counts against the motion. `decided` reports early resolution:
 * the motion has passed, or enough abstentions/disagreements make a majority
 * impossible even if all remaining seats agreed. Source: fomc.ts tallyMeeting.
 */
export function tallyMeeting(
  ballots: readonly FomcBallot[],
  motion: FomcVote,
  boardSize: number,
): FomcTally {
  const cast = ballots.length;
  let agree = 0;
  for (const b of ballots) if (ballotAgrees(b.vote, motion)) agree++;
  const disagree = cast - agree;
  const abstain = Math.max(0, boardSize - cast);
  const needed = majorityThreshold(boardSize);
  const passed = agree >= needed;
  const maxPossibleAgree = agree + abstain; // if every remaining seat agreed
  const decided = passed || maxPossibleAgree < needed;
  return { agree, disagree, abstain, needed, decided, passed };
}

/** Seats that vote automatically (NPP or vacant); player seats vote live. Source: fomc.ts isAutoSeat. */
export function isAutoSeat(seat: FomcSeat): boolean {
  return seat.occupantType !== "player";
}

/** Seats a live player controls and must be prompted to vote. Source: fomc.ts playerSeats. */
export function playerSeats(board: readonly FomcSeat[]): FomcSeat[] {
  return board.filter((s) => s.occupantType === "player");
}
