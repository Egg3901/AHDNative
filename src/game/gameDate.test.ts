import { describe, expect, it } from "vitest";
import {
  calendarTurnForClock,
  clockEpoch,
  clockStartingYear,
  formatGameDate,
  formatGameTurn,
  gameDateParts,
  turnForGameDate,
  TURNS_PER_YEAR,
} from "./gameDate";

// The 1953 pack starts on 1953-01-06 (packages/content/src/packs/1953.ts) and
// the engine advances the ISO day 7 days per turn (packages/engine/src/calendar.ts).
const era1953 = { turn: 0, date: "1953-01-06" };
// The 1991 pack starts on 1991-01-01.
const era1991 = { turn: 0, date: "1991-01-01" };

describe("gameDateParts", () => {
  it("maps Native turn 0 to January Week 1 (reference turn 1)", () => {
    expect(gameDateParts(0, 1953)).toEqual({ month: "January", weekOfMonth: 1, year: 1953 });
  });

  it("walks 12 months of 4 weeks and rolls the year at 48 turns", () => {
    expect(gameDateParts(3, 1953)).toEqual({ month: "January", weekOfMonth: 4, year: 1953 });
    expect(gameDateParts(4, 1953)).toEqual({ month: "February", weekOfMonth: 1, year: 1953 });
    expect(gameDateParts(14, 1953)).toEqual({ month: "April", weekOfMonth: 3, year: 1953 });
    expect(gameDateParts(47, 1953)).toEqual({ month: "December", weekOfMonth: 4, year: 1953 });
    expect(gameDateParts(48, 1953)).toEqual({ month: "January", weekOfMonth: 1, year: 1954 });
  });

  it("clamps invalid or negative turns to the era's first week", () => {
    expect(gameDateParts(-5, 1991)).toEqual({ month: "January", weekOfMonth: 1, year: 1991 });
    expect(gameDateParts(Number.NaN, 1991)).toEqual({ month: "January", weekOfMonth: 1, year: 1991 });
  });
});

describe("clockEpoch / clockStartingYear", () => {
  it("recovers the era start from any later clock", () => {
    expect(clockEpoch(era1953)).toBe("1953-01-06");
    expect(clockEpoch({ turn: 26, date: "1953-07-07" })).toBe("1953-01-06");
    expect(clockEpoch({ turn: 52, date: "1954-01-05" })).toBe("1953-01-06");
    expect(clockStartingYear({ turn: 52, date: "1954-01-05" })).toBe(1953);
    expect(clockStartingYear(era1991)).toBe(1991);
  });
});

describe("turnForGameDate", () => {
  it("inverts the 7-day-per-turn day grid exactly", () => {
    expect(turnForGameDate("1953-01-06", era1953)).toBe(0);
    expect(turnForGameDate("1953-01-13", era1953)).toBe(1);
    expect(turnForGameDate("1953-07-07", { turn: 26, date: "1953-07-07" })).toBe(26);
    expect(turnForGameDate("1954-01-05", era1953)).toBe(52);
  });

  it("falls back to the clock's own turn on malformed input", () => {
    expect(turnForGameDate("not-a-date", { turn: 7, date: "1953-02-24" })).toBe(7);
    expect(turnForGameDate("1953-02-24", { turn: 7, date: "nope" })).toBe(7);
  });
});

describe("formatGameTurn", () => {
  it("matches the reference calendar format", () => {
    // Mirrors AHDGame formatters.test.ts "renders the month and the week within
    // that month" translated to Native's 0-based turn (reference turn = Native + 1).
    expect(formatGameTurn(0, era1953)).toBe("January, Week 1, 1953");
    expect(formatGameTurn(3, era1953)).toBe("January, Week 4, 1953");
    expect(formatGameTurn(4, era1953)).toBe("February, Week 1, 1953");
    expect(formatGameTurn(14, era1953)).toBe("April, Week 3, 1953");
    expect(formatGameTurn(44, era1953)).toBe("December, Week 1, 1953");
    expect(formatGameTurn(47, era1953)).toBe("December, Week 4, 1953");
    expect(formatGameTurn(48, era1953)).toBe("January, Week 1, 1954");
  });

  it("honors the era's starting year", () => {
    expect(formatGameTurn(0, era1991)).toBe("January, Week 1, 1991");
    expect(formatGameTurn(47, era1991)).toBe("December, Week 4, 1991");
    expect(formatGameTurn(48, era1991)).toBe("January, Week 1, 1992");
  });

  it("never leaves a gap or overlap across a whole year", () => {
    const seen = new Set<string>();
    for (let turn = 0; turn < TURNS_PER_YEAR; turn++) seen.add(formatGameTurn(turn, era1953));
    expect(seen.size).toBe(TURNS_PER_YEAR);
  });
});

describe("formatGameDate", () => {
  it("formats an ISO game day via the current clock", () => {
    expect(formatGameDate("1953-01-06", era1953)).toBe("January, Week 1, 1953");
    expect(formatGameDate("1953-01-13", era1953)).toBe("January, Week 2, 1953");
    // Clock mid-year: the era epoch is still recovered correctly.
    expect(formatGameDate("1953-07-07", { turn: 26, date: "1953-07-07" })).toBe("July, Week 3, 1953");
    // 96 turns after the start = two reference years (48 turns each).
    expect(formatGameDate("1954-11-09", era1953)).toBe("January, Week 1, 1955");
  });

  it("returns empty string for malformed or missing dates instead of leaking ISO", () => {
    expect(formatGameDate("", era1953)).toBe("");
    expect(formatGameDate("not-a-date", era1953)).toBe("");
    expect(formatGameDate("1953-1-6", era1953)).toBe("");
    expect(formatGameDate(null, era1953)).toBe("");
    expect(formatGameDate(undefined, era1953)).toBe("");
  });

  it("matches formatGameTurn for the clock's own day", () => {
    const clock = { turn: 9, date: "1953-03-10" };
    expect(formatGameDate(clock.date, clock)).toBe(formatGameTurn(clock.turn, clock));
  });
});

describe("founding lifecycle projection (#223)", () => {
  it("pins the calendar at the era start while the phase is active", () => {
    const clock = { turn: 30, date: "1953-01-06", foundingActive: true as const };
    expect(calendarTurnForClock(clock)).toBe(0);
    expect(clockEpoch(clock)).toBe("1953-01-06");
    expect(clockStartingYear(clock)).toBe(1953);
    expect(turnForGameDate("1953-01-06", clock)).toBe(0);
    expect(formatGameDate("1953-01-06", clock)).toBe("January, Week 1, 1953");
  });

  it("resumes at the era start through the stamped offset after completion", () => {
    const clock = { turn: 52, date: "1953-02-03", foundingOffset: 48 };
    expect(calendarTurnForClock(clock)).toBe(4);
    expect(clockEpoch(clock)).toBe("1953-01-06");
    expect(clockStartingYear(clock)).toBe(1953);
    expect(formatGameDate("1953-02-03", clock)).toBe("February, Week 1, 1953");
    expect(formatGameTurn(48, clock)).toBe("January, Week 1, 1953");
    expect(formatGameTurn(52, clock)).toBe("February, Week 1, 1953");
  });

  it("stays the identity mapping without founding fields", () => {
    expect(calendarTurnForClock({ turn: 26, date: "1953-07-07" })).toBe(26);
    expect(formatGameTurn(48, era1953)).toBe("January, Week 1, 1954");
  });
});
