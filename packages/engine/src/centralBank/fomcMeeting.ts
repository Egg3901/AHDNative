/**
 * FOMC committee meeting lifecycle — issue #119 port.
 *
 * Source: AHDGame e364c04954ed628beef73a993a8e9e156650a31e
 *   src/lib/turn/fomcMeetingTurn.ts (processFomcMeetings / castFomcBallot — the
 *   thin shell over the monetary-governance state machine) and
 *   src/lib/monetaryGovernance/rules/machine.ts (handleTurnStart / cast_ballot /
 *   resolveMeetingInto / expireSeats / mirrorChair / maybeRollTerm /
 *   maybeVacancyNotice). This module ports the deterministic core of that machine
 *   for the Native turn-clocked engine:
 *
 *   per turn (turn_start), for every bank carrying a non-empty `fomcBoard`:
 *     1. expire every seat whose staggered term has passed (vacate, never
 *        restock — the committee is staffed by nomination + confirmation);
 *     2. mirror the board's chair seat onto the single-chair fields;
 *     3. emit a throttled "board seats vacant" notice to the executive;
 *     4. roll the per-term rate-change budget;
 *     5. resolve the active meeting at its deadline (no-shows abstain);
 *     6. open a fresh meeting on the cadence while the board can carry a motion.
 *
 * Every branch that the reference does not gate in is reproduced; every branch
 * whose *input* Native does not model is left out and called out in the file
 * doc / report (see "Reported gaps" below).
 *
 * Determinism: turn-clocked. No Date.now, no wall clock, no Math.random — the
 * reference's `now: Date`/ms deadline fields become turn numbers.
 *
 * Reported gaps (reference input not modelled in Native — see report):
 *  - `spawnTechnocratNpp` + `seedFomcBoards`: Native has no NPP-technocrat
 *    generator and no iteration-start seeding step, so a technocrat seat may
 *    carry `nppId: null`. `seedFomcBoard` here seats reference-shaped boards
 *    with alignment + staggered terms but no spawned technocrat identity.
 *  - jurisdiction / `resolveJurisdiction` / `loadExecutionPolicies`: Native has
 *    no shared-currency jurisdiction resolution wired into the bank, so the
 *    fx-commitment execution block (`rateChangeRefusalFor`) is not ported.
 *  - `gameConfig.commandEconomyEnabled`: the command-economy execution block is
 *    not ported (Native's commandEconomy state is per-country, not a
 *    per-jurisdiction execution policy).
 *  - `FOMC_PLAYER_VOTE_WINDOW_MS` (24h wall clock): Native has no wall clock, so
 *    only the game-clock `resolvesOnTurn` window is modelled.
 */

import type { WorldState } from "../types.js";
import {
  CENTRAL_BANK_COUNTRY_ANCHORS,
  FOMC_BOARD_SIZE,
  FOMC_COMMITTEE_COUNTRY_IDS,
  FOMC_MEETING_HISTORY_MAX,
  FOMC_MEETING_INTERVAL_TURNS,
  FOMC_TERM_TURNS,
  FOMC_VACANCY_REMINDER_INTERVAL_TURNS,
  FOMC_VOTE_WINDOW_TURNS,
  MAX_RATE_CHANGE_DELTA,
  MAX_RATE_CUT_DELTA,
  RATE_CHANGES_PER_TERM,
  RATE_CHANGE_COOLDOWN_TURNS,
  snapToPrimeRateGrid,
} from "./constants.js";
import {
  boardCanCarryMotions,
  playerSeats,
  proposeChairMotion,
  seatPreferredVote,
  tallyMeeting,
  type FomcMacroContext,
} from "./fomc.js";
import type { CentralBank, FomcBallot, FomcMeeting, FomcSeat, FomcVote } from "./types.js";

const EPSILON = 1e-9;

/**
 * Staggered term expiry so at most one seat opens per window: seat i of N
 * expires 1/N of a term sooner than seat i+1. Source: seedFomcBoard.ts
 * staggeredExpiry.
 */
function staggeredExpiry(seatIndex: number, boardSize: number, startTurn: number): number {
  const span = Math.max(1, Math.round(((seatIndex + 1) * FOMC_TERM_TURNS) / boardSize));
  return startTurn + span;
}

/**
 * A reference-shaped committee board: FOMC_BOARD_SIZE technocrat seats,
 * alternating hawk/dove, seat 1 the chair, each with a staggered term.
 * Source: seedFomcBoard.ts seedFomcBoards (technocrat NPP identity omitted —
 * see this file's "Reported gaps").
 */
export function createFomcBoard(startTurn: number): FomcSeat[] {
  const board: FomcSeat[] = [];
  for (let i = 0; i < FOMC_BOARD_SIZE; i++) {
    board.push({
      seatId: `seat-${i + 1}`,
      isChair: i === 0,
      occupantType: "npp",
      characterId: null,
      characterName: null,
      nppId: null,
      alignment: i % 2 === 0 ? "hawk" : "dove",
      appointedByPresidentId: null,
      appointedAtTurn: startTurn,
      termExpiresAtTurn: staggeredExpiry(i, FOMC_BOARD_SIZE, startTurn),
    });
  }
  return board;
}

/**
 * Seat a reference-shaped FOMC board on a bank that lacks one. Idempotent, and
 * gated on the committee country set exactly as the reference. Source:
 * seedFomcBoard.ts seedFomcBoards (returns the number seeded).
 */
export function seedFomcBoard(
  world: WorldState,
  countryId: string,
  startTurn: number = world.meta.turn,
): boolean {
  const bank = world.centralBanks[countryId];
  if (!bank) return false;
  if (!FOMC_COMMITTEE_COUNTRY_IDS.has(countryId)) return false;
  if (bank.fomcBoard && bank.fomcBoard.length > 0) return false;
  bank.fomcBoard = createFomcBoard(startTurn);
  bank.activeFomcMeeting = null;
  bank.rateChangesThisTerm = 0;
  bank.fomcTermStartedAtTurn = startTurn;
  mirrorChair(bank);
  return true;
}

/** Macro inputs every seat reasons over for one meeting. Adapts reference
 * fomcMeetingTurn.ts loadMacroContext to Native's already-ported macro reads
 * (the same fields centralBankChairTurnPhase consumes). */
function loadFomcMacroContext(world: WorldState, bank: CentralBank): FomcMacroContext | null {
  const country = world.countries[bank.countryId];
  const anchor = CENTRAL_BANK_COUNTRY_ANCHORS[bank.countryId];
  if (!country || !anchor) return null;
  return {
    neutralRate: anchor.neutralPrimeRate,
    inflationRate: country.economy.inflationRate * 100,
    targetInflation: anchor.targetInflation,
    gdpGrowth: country.economy.growthRate * 100,
    currentRate: snapToPrimeRateGrid(bank.primeRate),
  };
}

/** Current execution constraints for a carried motion. Source: machine.ts
 * committeeRateExecutionRefusal (command-economy + fx-commitment blocks omitted
 * — see file doc). */
export function committeeRateExecutionRefusal(
  bank: Pick<CentralBank, "primeRate" | "rateChangesThisTerm" | "lastRateChangeTurn">,
  delta: number,
  turn: number,
): string | null {
  if (!Number.isFinite(delta) || !Number.isFinite(bank.primeRate)) return "invalid-rate";
  if (delta > MAX_RATE_CHANGE_DELTA + EPSILON) return "delta-hike";
  if (delta < -(MAX_RATE_CUT_DELTA + EPSILON)) return "delta-cut";
  const requested = snapToPrimeRateGrid(bank.primeRate) + delta;
  if (requested < 0 || requested > 25) return "out-of-range";
  if ((bank.rateChangesThisTerm ?? 0) >= RATE_CHANGES_PER_TERM) return "term-cap";
  if (typeof bank.lastRateChangeTurn === "number" && turn - bank.lastRateChangeTurn < RATE_CHANGE_COOLDOWN_TURNS) {
    return "cooldown";
  }
  return null;
}

/** Whether the per-term budget and cooldown allow a move now. Source: machine.ts canChangeRate
 * (command-economy + fx blocks omitted — see file doc). */
function canChangeRate(bank: CentralBank, turn: number): boolean {
  if ((bank.rateChangesThisTerm ?? 0) >= RATE_CHANGES_PER_TERM) return false;
  const last = bank.lastRateChangeTurn;
  if (typeof last === "number" && turn - last < RATE_CHANGE_COOLDOWN_TURNS) return false;
  return true;
}

function deadlineHit(meeting: FomcMeeting, turn: number): boolean {
  return turn >= meeting.resolvesOnTurn;
}

/**
 * Vacate every seat whose staggered term has expired. No auto-seating (the
 * reference never seats a machine candidate). Source: machine.ts expireSeats.
 */
function expireSeats(bank: CentralBank, turn: number): { replaced: number; chairRefreshed: boolean } {
  let replaced = 0;
  let chairRefreshed = false;
  bank.fomcBoard = (bank.fomcBoard ?? []).map((seat) => {
    if (seat.termExpiresAtTurn != null && seat.termExpiresAtTurn <= turn) {
      replaced++;
      if (seat.isChair) chairRefreshed = true;
      return {
        ...seat,
        occupantType: "vacant" as const,
        characterId: null,
        characterName: null,
        nppId: null,
        appointedByPresidentId: null,
        appointedAtTurn: turn,
        termExpiresAtTurn: null,
      };
    }
    return seat;
  });
  return { replaced, chairRefreshed };
}

/**
 * Mirror the board's chair seat onto the bank's single-chair fields. Source:
 * machine.ts mirrorChair (the `vacancyAwaitingAutomaticSelection` flag is not
 * modelled — the selection phase skips committee banks; see centralBank/phases.ts).
 */
function mirrorChair(bank: CentralBank): void {
  const panel = bank.fomcBoard ?? [];
  const chair = panel.find((s) => s.isChair) ?? panel[0];
  if (!chair) return;
  bank.chairAlignment = chair.alignment;
  bank.chairTermExpiresAtTurn = chair.termExpiresAtTurn;
  if (chair.occupantType === "player" && chair.characterId) {
    bank.chairMode = "character";
    bank.chairAppointedBy = chair.appointedByPresidentId ?? null;
  } else if (chair.occupantType === "vacant") {
    bank.chairMode = "npp";
    bank.chairAppointedBy = null;
  } else {
    bank.chairMode = "npp";
    bank.chairAppointedBy = chair.appointedByPresidentId ?? null;
  }
}

/**
 * Emit a throttled "board seats vacant" notice to the executive. Source:
 * machine.ts maybeVacancyNotice + fomcMeetingTurn.ts notifyFomcVacancy (Native
 * has no per-user notifications channel; the notice is posted to world.news).
 */
function maybeVacancyNotice(
  world: WorldState,
  bank: CentralBank,
  turn: number,
  seatsExpired: boolean,
): void {
  const panel = bank.fomcBoard ?? [];
  const vacant = panel.filter((s) => s.occupantType === "vacant").length;
  if (vacant === 0) return;
  if (!FOMC_COMMITTEE_COUNTRY_IDS.has(bank.countryId)) return;
  const last = bank.lastFomcVacancyNoticeAtTurn;
  const due =
    seatsExpired || typeof last !== "number" || turn - last >= FOMC_VACANCY_REMINDER_INTERVAL_TURNS;
  if (!due) return;
  const hasActiveNomination = world.fomcNominations.some(
    (n) => n.bankId === bank.countryId && n.status === "active",
  );
  if (hasActiveNomination) return;
  bank.lastFomcVacancyNoticeAtTurn = turn;
  const chairHoldsRate = !boardCanCarryMotions(panel);
  const message = chairHoldsRate
    ? `${vacant} of ${panel.length} committee seats on the ${bank.countryId} rate-setting board are vacant, so the board cannot carry a rate motion. The chair holds the rate directly until enough governors are confirmed.`
    : `${vacant} of ${panel.length} committee seats on the ${bank.countryId} rate-setting board are vacant.`;
  world.news.push({ turn, date: world.meta.date, headline: message });
}

/** Roll the per-term rate-change budget when the term elapses. Source: machine.ts maybeRollTerm. */
function maybeRollTerm(bank: CentralBank, turn: number): void {
  const start = bank.fomcTermStartedAtTurn;
  if (typeof start !== "number") {
    bank.fomcTermStartedAtTurn = turn;
  } else if (turn - start >= FOMC_TERM_TURNS) {
    bank.fomcTermStartedAtTurn = turn;
    bank.rateChangesThisTerm = 0;
  }
}

/**
 * Table a motion and collect the automatic ballots. NPP seats vote their own
 * preference immediately; player seats vote live and vacant seats abstain.
 * Source: machine.ts buildMeeting.
 */
function buildMeeting(bank: CentralBank, macro: FomcMacroContext, turn: number): FomcMeeting {
  const panel = bank.fomcBoard ?? [];
  const chair = panel.find((s) => s.isChair) ?? panel[0];
  const ctx: FomcMacroContext = { ...macro, currentRate: snapToPrimeRateGrid(bank.primeRate) };
  const { motion, proposedDelta } = proposeChairMotion(chair?.alignment ?? "hawk", ctx, {
    canChangeRate: canChangeRate(bank, turn),
  });
  const ballots: FomcBallot[] = [];
  for (const seat of panel) {
    if (seat.occupantType === "npp") {
      ballots.push({
        seatId: seat.seatId,
        vote: seatPreferredVote(seat.alignment, ctx),
        auto: true,
        castAtTurn: turn,
      });
    }
  }
  return {
    meetingId: `${bank.countryId}-m${turn}`,
    openedAtTurn: turn,
    motion,
    proposedDelta,
    status: "voting",
    ballots,
    resolvesOnTurn: turn + FOMC_VOTE_WINDOW_TURNS,
  };
}

/** Open a fresh meeting. Source: machine.ts openMeetingInto. */
function openMeetingInto(bank: CentralBank, macro: FomcMacroContext, turn: number): FomcMeeting {
  const meeting = buildMeeting(bank, macro, turn);
  bank.activeFomcMeeting = meeting;
  bank.lastFomcMeetingTurn = turn;
  return meeting;
}

export interface ResolveMeetingOutcome {
  resolved: boolean;
  moved: boolean;
}

/**
 * Resolve a voting meeting when it is decided (or the deadline forces it). A
 * decided tally alone never closes a meeting while a seated player can still
 * ballot; the deadline force-resolves with no-shows abstaining. Never resolves
 * a meeting on the turn it opened. Source: machine.ts resolveMeetingInto.
 */
export function resolveMeetingInto(
  bank: CentralBank,
  meeting: FomcMeeting,
  turn: number,
  forceDeadline: boolean,
): ResolveMeetingOutcome {
  const noChange: ResolveMeetingOutcome = { resolved: false, moved: false };
  if (meeting.status !== "voting") return noChange;
  if (meeting.openedAtTurn >= turn) return noChange;

  const panel = bank.fomcBoard ?? [];
  const tally = tallyMeeting(meeting.ballots, meeting.motion, panel.length);
  const awaitingPlayer = playerSeats(panel).some(
    (s) => !meeting.ballots.some((b) => b.seatId === s.seatId),
  );
  if ((!tally.decided || awaitingPlayer) && !forceDeadline) return noChange;

  const passed = tally.passed;
  const requiresMove = passed && meeting.motion !== "hold" && Math.abs(meeting.proposedDelta) > EPSILON;
  const executionBlockedReason = requiresMove
    ? committeeRateExecutionRefusal(bank, meeting.proposedDelta, turn)
    : null;
  const moved = requiresMove && executionBlockedReason == null;

  const resolved: FomcMeeting = {
    ...meeting,
    status: "resolved",
    result: passed ? "passed" : "failed",
    executionOutcome: executionBlockedReason ? "blocked" : moved ? "applied" : "not-required",
    ...(executionBlockedReason ? { executionBlockedReason } : {}),
    resolvedAtTurn: turn,
  };

  if (moved) {
    // Normalize both sides of the arithmetic onto the quarter-point grid
    // before applying, so an off-grid stored rate never locks out a valid move.
    const previousRate = snapToPrimeRateGrid(bank.primeRate);
    const newRate = snapToPrimeRateGrid(previousRate + meeting.proposedDelta);
    bank.primeRate = newRate;
    bank.lastRateChangeTurn = turn;
    bank.rateChangesThisTerm = (bank.rateChangesThisTerm ?? 0) + 1;
  }

  bank.activeFomcMeeting = null;
  bank.fomcMeetingHistory = [...(bank.fomcMeetingHistory ?? []), resolved].slice(
    -FOMC_MEETING_HISTORY_MAX,
  );
  return { resolved: true, moved };
}

/** One turn of the reference's `turn_start` deadline event for one bank. Source: machine.ts handleTurnStart. */
function handleTurnStartForBank(world: WorldState, bank: CentralBank, turn: number): void {
  const { replaced } = expireSeats(bank, turn);
  if (replaced > 0) mirrorChair(bank);
  maybeVacancyNotice(world, bank, turn, replaced > 0);
  maybeRollTerm(bank, turn);

  // GAP: reference returns early here for a government-controlled bank
  // (machine.ts handleTurnStart). Native does not model the government-controlled
  // flag on the bank; the committee is US-only and the US is never
  // government-controlled in solo, so this branch has no live input.

  // Only open when no meeting was active at turn start: a meeting that just
  // resolved this turn does not immediately re-open in the same turn.
  const hadActiveMeeting = bank.activeFomcMeeting != null;
  const meeting = bank.activeFomcMeeting;
  if (meeting && meeting.status === "voting") {
    resolveMeetingInto(bank, meeting, turn, deadlineHit(meeting, turn));
  }

  if (!hadActiveMeeting && !bank.activeFomcMeeting && boardCanCarryMotions(bank.fomcBoard ?? [])) {
    const macro = loadFomcMacroContext(world, bank);
    if (macro) {
      const last = bank.lastFomcMeetingTurn;
      const due = typeof last !== "number" || turn - last >= FOMC_MEETING_INTERVAL_TURNS;
      if (due) openMeetingInto(bank, macro, turn);
    }
  }
}

/**
 * Per-turn FOMC committee phase body. A thin shell: for every bank carrying a
 * committee board, run one `turn_start` deadline event. Strict no-op for banks
 * without a board (legacy single-chair banks are untouched). Source:
 * fomcMeetingTurn.ts processFomcMeetings.
 */
export function processFomcMeetings(world: WorldState): void {
  const turn = world.meta.turn;
  for (const bank of Object.values(world.centralBanks)) {
    const board = bank.fomcBoard;
    if (!board || board.length === 0) continue;
    handleTurnStartForBank(world, bank, turn);
  }
}

export type CastFomcBallotResult =
  | { ok: false; reason: "no-meeting" | "not-seated" | "already-voted" }
  | { ok: true; resolved: boolean; motion: FomcVote; moved: boolean };

/**
 * Record a live player board member's ballot on the active meeting and, per the
 * "auto-pass before the timer" rule, resolve immediately once the outcome is
 * decided and no other player seat is still waiting to ballot. Idempotent per
 * seat per meeting. Source: fomcMeetingTurn.ts castFomcBallot.
 */
export function castFomcBallot(
  world: WorldState,
  opts: { bankId: string; characterId: string; vote: FomcVote },
): CastFomcBallotResult {
  const turn = world.meta.turn;
  const bank = world.centralBanks[opts.bankId];
  const meeting = bank?.activeFomcMeeting;
  const panel = bank?.fomcBoard ?? [];
  const refuse = (reason: "no-meeting" | "not-seated" | "already-voted"): CastFomcBallotResult => ({
    ok: false,
    reason,
  });
  if (!bank || !meeting || meeting.status !== "voting") return refuse("no-meeting");

  const seat = panel.find((s) => s.occupantType === "player" && s.characterId === opts.characterId);
  if (turn > meeting.resolvesOnTurn) return refuse("no-meeting");
  if (!seat) return refuse("not-seated");
  if (meeting.ballots.some((b) => b.seatId === seat.seatId)) return refuse("already-voted");

  const updated: FomcMeeting = {
    ...meeting,
    ballots: [...meeting.ballots, { seatId: seat.seatId, vote: opts.vote, auto: false, castAtTurn: turn }],
  };
  bank.activeFomcMeeting = updated;
  const outcome = resolveMeetingInto(bank, updated, turn, false);
  if (!outcome.resolved) bank.activeFomcMeeting = updated;
  return { ok: true, resolved: outcome.resolved, motion: meeting.motion, moved: outcome.moved };
}
