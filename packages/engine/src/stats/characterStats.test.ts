import { describe, expect, it } from "vitest";
import {
  STAT_FREE_POINTS,
  STAT_KEYS,
  STAT_MIN,
  STAT_POINT_BUDGET,
  type CharacterStats,
} from "./characterStats.js";
import { statMultiplier } from "./characterStats.js";
import { statBonus } from "./characterStats.js";

/** The reference "all floor" opener: seven stats at STAT_MIN, all free points unspent. */
function floorBuild(): CharacterStats {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, STAT_MIN])) as CharacterStats;
}

describe("character stat constants (reference statsConstants.ts parity)", () => {
  it("pins the reference seven keys in canonical display order", () => {
    expect(STAT_KEYS).toEqual([
      "charisma",
      "debate",
      "energy",
      "fundraising",
      "businessAcumen",
      "statecraft",
      "intellect",
    ]);
  });

  it("derives the free-point budget from the point budget and floor", () => {
    // Reference: STAT_POINT_BUDGET 28, STAT_MIN 1, seven keys -> 21 free points.
    expect(STAT_MIN).toBe(1);
    expect(STAT_POINT_BUDGET).toBe(28);
    expect(STAT_FREE_POINTS).toBe(STAT_POINT_BUDGET - STAT_KEYS.length);
    expect(STAT_FREE_POINTS).toBe(21);
  });

  it("keeps a default floor build at exactly STAT_FREE_POINTS remaining", () => {
    const remaining = STAT_FREE_POINTS - STAT_KEYS.reduce((sum, key) => sum + (floorBuild()[key] - STAT_MIN), 0);
    expect(remaining).toBe(21);
  });
});

describe("statMultiplier (reference statMultiplier.ts parity)", () => {
  it("pivots at 5.5 to a neutral 1.0x and clamps out-of-range input", () => {
    expect(statMultiplier(5.5)).toBeCloseTo(1, 10);
    expect(statMultiplier(1)).toBeCloseTo(0.82, 10);
    expect(statMultiplier(10)).toBeCloseTo(1.18, 10);
    expect(statMultiplier(0)).toBeCloseTo(statMultiplier(1), 10);
    expect(statMultiplier(42)).toBeCloseTo(statMultiplier(10), 10);
  });
});

describe("statBonus (reference statMeta.ts parity)", () => {
  it("reports Energy as concrete action cap/bank numbers, not an efficacy multiplier", () => {
    expect(statBonus("energy", 1)).toEqual({ label: "200 cap", detail: "200 action stockpile cap · bank up to 100" });
    expect(statBonus("energy", 10)).toEqual({ label: "250 cap", detail: "250 action stockpile cap · bank up to 125" });
  });

  it("reports every other stat as an efficacy multiplier", () => {
    expect(statBonus("charisma", 1).label).toBe("0.82x");
    expect(statBonus("charisma", 10).label).toBe("1.18x");
  });
});
