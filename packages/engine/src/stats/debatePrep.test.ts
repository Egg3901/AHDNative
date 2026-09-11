import { describe, expect, it } from "vitest";
import {
  DEBATE_PREP_ACTION_COST,
  DEBATE_PREP_SUCCESS_CHANCE,
  STAT_MAX,
  STAT_MIN,
  rollDebatePrep,
} from "./debatePrep.js";

// Reference vectors for the authoritative roll
// (AHDGame src/lib/stats/debatePrep.ts at 36192953d: success iff
// rng() < DEBATE_PREP_SUCCESS_CHANCE, +1 clamped at STAT_MAX).

describe("rollDebatePrep reference vectors", () => {
  it("ports the authoritative cost and chance constants", () => {
    expect(DEBATE_PREP_ACTION_COST).toBe(1);
    expect(DEBATE_PREP_SUCCESS_CHANCE).toBe(0.15);
    expect(STAT_MIN).toBe(1);
    expect(STAT_MAX).toBe(10);
  });

  it("succeeds below the threshold and raises Debate by exactly 1", () => {
    expect(rollDebatePrep(() => 0, 5)).toEqual({ success: true, debate: 6 });
    expect(rollDebatePrep(() => 0.149999, 1)).toEqual({ success: true, debate: 2 });
  });

  it("fails at or above the threshold and leaves Debate unchanged", () => {
    expect(rollDebatePrep(() => 0.15, 5)).toEqual({ success: false, debate: 5 });
    expect(rollDebatePrep(() => 0.999999, 9)).toEqual({ success: false, debate: 9 });
  });

  it("clamps a successful roll at the stat cap", () => {
    expect(rollDebatePrep(() => 0, STAT_MAX)).toEqual({ success: true, debate: STAT_MAX });
  });

  it("never moves the stat outside [STAT_MIN, STAT_MAX]", () => {
    for (const start of [STAT_MIN, 5, STAT_MAX]) {
      for (const r of [0, 0.5, 0.999999]) {
        const { debate } = rollDebatePrep(() => r, start);
        expect(debate).toBeGreaterThanOrEqual(STAT_MIN);
        expect(debate).toBeLessThanOrEqual(STAT_MAX);
      }
    }
  });
});
