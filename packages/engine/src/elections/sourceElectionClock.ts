import type { WorldState } from "../types.js";

/** AHDGame's source election clock uses 48 turns per year. */
export const SOURCE_TURNS_PER_YEAR = 48;

export interface SourceElectionClock {
  startingYear: number;
  calendarTurn: number;
  currentYear: number;
}

/**
 * Resolve the source calendar for election/demographic consumers.
 *
 * This ports Game's `calendarTurn(rawTurn, clock)` plus
 * `startingYear + floor((calendarTurn - 1) / TURNS_PER_YEAR)`. Native's
 * completed-turn counter is zero-based while Game's raw currentTurn is
 * one-based, hence the `turn + 1`. Founding freezes the calendar at source
 * turn 1; after founding, Native's completion-turn offset maps back to turn 1.
 *
 * Legacy saves without an explicit source anchor return null. Their date is
 * not a safe substitute: imported/custom dates and Native's 52-week display
 * calendar do not encode Game's 48-turn source clock.
 */
export function sourceElectionClockForWorld(world: WorldState): SourceElectionClock | null {
  const startingYear = world.meta.startingYear;
  if (!Number.isSafeInteger(startingYear) || startingYear! < 1000 || startingYear! > 9999) return null;

  const calendarTurn = world.meta.preIteration?.active === true
    ? 1
    : Math.max(1, world.meta.turn + 1 - (world.meta.preIterationTurns ?? 0));
  return {
    startingYear: startingYear!,
    calendarTurn,
    currentYear: startingYear! + Math.floor((calendarTurn - 1) / SOURCE_TURNS_PER_YEAR),
  };
}
