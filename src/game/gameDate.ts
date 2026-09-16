/**
 * Shared player-facing in-game date formatting (#226).
 *
 * Native stores the game clock as an ISO calendar day (`world.meta.date` /
 * `GameView.date`), advancing `DAYS_PER_TURN` (7) days per turn, and keeps a
 * 1-based-in-reference turn counter (`world.meta.turn`, 0 at world creation).
 * Every other in-game time surface (elections, bills, notifications, bonds,
 * referendums, offices) is derived from that clock and stores/serialises ISO.
 *
 * The reference (AHDGame) renders the SAME clock on its "LARP" calendar and
 * never shows the raw ISO day to players. Evidence:
 *   - src/lib/utils/formatters.ts:825-828 `turnToLarpDate()` returns
 *     `${month}, Week ${weekOfMonth}, ${year}` — e.g. "April, Week 3, 1953".
 *   - src/lib/utils/formatters.ts:784-795 `turnToLarpParts()`: 48 turns = 1
 *     year = 12 months x 4 weeks.
 *   - src/lib/utils/formatters.test.ts:359-384 pins those exact strings.
 *   - src/components/StatusBar.tsx:376-379 renders `rawTurnToLarpDate(...)`.
 *
 * This module is the one place Native turns that clock into the player-facing
 * calendar, matching the reference byte-for-byte ("Month, Week N, Year"). It is
 * display-only: the underlying ISO strings stay ISO (lexicographic order still
 * equals chronological order), so sorting/comparison logic is untouched.
 *
 * Calendar mapping: Native counts turns from 0 at the era start, while the
 * reference calendar's first turn is January Week 1. So Native turn T maps to
 * the reference's turn T+1 — see {@link gameDateParts}. The era start (turn 0)
 * is recovered from any clock by walking back `turn * DAYS_PER_TURN` days, so
 * the helper needs no separate era input.
 */
import { addDaysIso, DAYS_PER_TURN } from "@ahdclient/engine";

/** 48 turns per year = 12 months of exactly 4 weeks (reference calendar). */
export const TURNS_PER_YEAR = 48;

/** Month names in reference order; only ever indexed 0..11. */
const LARP_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Minimal world clock: the current turn plus its ISO day. */
export interface GameClock {
  turn: number;
  date: string;
  foundingActive?: boolean;
  foundingOffset?: number;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Whole UTC days for an ISO calendar day, or null when not a valid ISO day. */
function dayNumber(iso: string): number | null {
  if (typeof iso !== "string" || !ISO_DAY.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

function foundingOffsetOf(clock: GameClock): number {
  const offset = clock.foundingOffset;
  return typeof offset === "number" && Number.isFinite(offset) && offset > 0
    ? Math.floor(offset)
    : 0;
}

function rawTurnOf(clock: GameClock): number {
  return typeof clock.turn === "number" && Number.isFinite(clock.turn) && clock.turn > 0
    ? Math.floor(clock.turn)
    : 0;
}

export function calendarTurnForClock(clock: GameClock): number {
  if (clock.foundingActive === true) return 0;
  return Math.max(0, rawTurnOf(clock) - foundingOffsetOf(clock));
}

/**
 * The era's start day implied by a clock: the world date walked back by the
 * clock's calendar position (see {@link calendarTurnForClock}). While a
 * founding phase is active the frozen date is the era start, so it is
 * returned as-is.
 */
export function clockEpoch(clock: GameClock): string {
  if (clock.foundingActive === true && typeof clock.date === "string") return clock.date;
  return addDaysIso(clock.date, -calendarTurnForClock(clock) * DAYS_PER_TURN);
}

/** Calendar year the era's clock starts in (turn 0's year). */
export function clockStartingYear(clock: GameClock): number {
  const year = Number.parseInt(clockEpoch(clock).slice(0, 4), 10);
  return Number.isFinite(year) ? year : 1953;
}

/**
 * Native turn for an ISO game day, given the current clock. Both the target and
 * the clock live on the same 7-day grid, so this is exact for real game dates.
 * Falls back to the clock's own turn when either date is malformed.
 */
export function turnForGameDate(isoDate: string, clock: GameClock): number {
  const target = dayNumber(isoDate);
  const anchor = dayNumber(clock.date);
  if (target === null || anchor === null) return calendarTurnForClock(clock);
  return calendarTurnForClock(clock) + Math.round((target - anchor) / DAYS_PER_TURN);
}

/**
 * Reference calendar position of a Native turn (0-based from the era start):
 * month + week-within-month + year, clamped at the era's first week.
 */
export function gameDateParts(
  turn: number,
  startingYear: number
): { month: string; weekOfMonth: number; year: number } {
  const t = Number.isFinite(turn) && turn > 0 ? Math.floor(turn) : 0;
  // Native turn 0 is January Week 1 (reference turn 1).
  const turnsInYear = (t % TURNS_PER_YEAR) + 1;
  return {
    month: LARP_MONTHS[Math.floor((turnsInYear - 1) / 4)] ?? LARP_MONTHS[0],
    weekOfMonth: ((turnsInYear - 1) % 4) + 1,
    year: startingYear + Math.floor(t / TURNS_PER_YEAR),
  };
}

export function formatGameTurn(turn: number, clock: GameClock): string {
  const calendarTurn =
    typeof turn === "number" && Number.isFinite(turn)
      ? Math.max(0, Math.floor(turn) - foundingOffsetOf(clock))
      : 0;
  return formatCalendarTurn(calendarTurn, clock);
}

function formatCalendarTurn(calendarTurn: number, clock: GameClock): string {
  const { month, weekOfMonth, year } = gameDateParts(calendarTurn, clockStartingYear(clock));
  return `${month}, Week ${weekOfMonth}, ${year}`;
}

/**
 * Format an ISO game day on the reference calendar. Returns "" for a missing or
 * malformed day so callers can fall back (e.g. "Unknown") rather than leak ISO.
 */
export function formatGameDate(isoDate: string | null | undefined, clock: GameClock): string {
  if (typeof isoDate !== "string" || dayNumber(isoDate) === null) return "";
  return formatCalendarTurn(turnForGameDate(isoDate, clock), clock);
}
