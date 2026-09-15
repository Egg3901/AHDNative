import { addDaysIso, DAYS_PER_TURN, nextEraForDate } from "../calendar.js";
import type { TurnPhase } from "./types.js";

export const advanceCalendarPhase: TurnPhase = {
  name: "advanceCalendar",
  run(world) {
    world.meta.turn += 1;
    // #223 founding freeze (ports the reference calendar pin: `calendarTurn`
    // returns 1 while `preIteration.active` in `src/lib/utils/gameDate.ts`).
    // The raw turn counter still advances — campaigns, windows and the
    // detector all run on it — but the ISO date (and with it the era label)
    // stays at the era start until the founding elections finish. The
    // completion detector stamps `preIterationTurns` so the display clock
    // resumes at the era start instead of jumping (see `WorldMeta`).
    if (world.meta.preIteration?.active === true) return;
    world.meta.date = addDaysIso(world.meta.date, DAYS_PER_TURN);
    // Label update only, via the legacy-safe nextEraForDate (era-truth v40):
    // never regresses a legacy-era save, promotes forward at real era
    // boundaries. The era-crossing announcement itself (W33) lives in its
    // own tail phase, eraCrossingPhase, mirroring mainline's separation of
    // the calendar advance from the dedicated `eraCrossing` turn phase.
    world.meta.era = nextEraForDate(world.meta.date, world.meta.era);
  },
};
