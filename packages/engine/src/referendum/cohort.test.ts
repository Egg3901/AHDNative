import { describe, expect, it } from "vitest";
import {
  aggregateYesShare,
  cumulativeCampaignEffect,
  deriveCampaignYesShare,
  effLean,
  effTurnout,
  leanFromUnits,
  referendumYesShare,
  saturate,
  upsertPollPoint,
} from "./cohort.js";

// Vectors mirror AHDGame's cohortEngine.test.ts, resolveYesShare.test.ts and
// pollSnapshot.test.ts against this verbatim port. Where mainline asserts a
// decimal expansion (saturate(1.5, 25) = 1.498), the same expansion is pinned
// here, so a transcription error fails loudly.

describe("saturate (read-time soft cap)", () => {
  it("is 0 at 0 and ≈ identity for small raw", () => {
    expect(saturate(0, 25)).toBe(0);
    expect(saturate(1.5, 25)).toBeCloseTo(1.498, 3);
  });

  it("asymptotes to the cap and never exceeds it", () => {
    expect(saturate(1000, 25)).toBeGreaterThan(24.9);
    expect(saturate(1000, 25)).toBeLessThanOrEqual(25);
    expect(saturate(-1000, 25)).toBeLessThan(-24.9);
  });

  it("effLean/effTurnout bind the caps", () => {
    expect(effLean(1000)).toBeCloseTo(25, 0);
    expect(effTurnout(1000)).toBeCloseTo(20, 0);
  });
});

describe("cumulativeCampaignEffect / leanFromUnits", () => {
  it("first unit moves the authored 0.5pp", () => {
    expect(cumulativeCampaignEffect(1)).toBeCloseTo(0.5, 10);
  });

  it("diminishing returns: the 21st unit moves less than the 1st", () => {
    const first = cumulativeCampaignEffect(1) - cumulativeCampaignEffect(0);
    const later = cumulativeCampaignEffect(21) - cumulativeCampaignEffect(20);
    expect(later).toBeLessThan(first);
    expect(later).toBeGreaterThan(0);
  });

  it("yes units raise, no units lower, symmetric spend cancels", () => {
    expect(leanFromUnits(10, 0)).toBeGreaterThan(0);
    expect(leanFromUnits(0, 10)).toBeLessThan(0);
    expect(leanFromUnits(10, 10)).toBeCloseTo(0, 5);
  });
});

describe("aggregateYesShare", () => {
  const cohorts = [
    { groupId: "a", share: 0.5, turnout: 60, yesLean: 40 },
    { groupId: "b", share: 0.5, turnout: 60, yesLean: 60 },
  ];

  it("is the turnout-weighted mean with no modifiers (== 50 here)", () => {
    expect(aggregateYesShare(cohorts, [], 0)).toBeCloseTo(50, 10);
  });

  it("a small raw leanMod moves the aggregate by ~the raw amount", () => {
    const open = aggregateYesShare(cohorts, [], 0);
    const v = aggregateYesShare(
      cohorts,
      [
        { groupId: "a", turnoutMod: 0, leanMod: 1.5 },
        { groupId: "b", turnoutMod: 0, leanMod: 1.5 },
      ],
      0
    );
    expect(v - open).toBeCloseTo(1.5, 1);
  });

  it("a huge raw leanMod is capped (not linear)", () => {
    const v = aggregateYesShare(cohorts, [{ groupId: "b", turnoutMod: 0, leanMod: 1000 }], 0);
    expect(v).toBeLessThan(63);
  });

  it("a uniform lean shift moves every cohort", () => {
    expect(aggregateYesShare(cohorts, [], 5)).toBeCloseTo(55, 5);
  });

  it("clamps the result to [0,100]", () => {
    expect(aggregateYesShare(cohorts, [], 999)).toBe(100);
    expect(aggregateYesShare(cohorts, [], -999)).toBe(0);
  });

  it("the single-cohort fallback baseline aggregates to the opening desire", () => {
    const fallback = [{ groupId: "_all", share: 1, turnout: 60, yesLean: 62 }];
    expect(aggregateYesShare(fallback, [], leanFromUnits(0, 0))).toBeCloseTo(62, 10);
  });
});

describe("referendumYesShare", () => {
  const baseline = [
    { groupId: "a", share: 0.5, turnout: 60, yesLean: 70 },
    { groupId: "b", share: 0.5, turnout: 60, yesLean: 30 },
  ];

  it("uses the cohort aggregate when a baseline exists, ignoring the stale scalar", () => {
    expect(
      referendumYesShare({
        cohortBaseline: baseline,
        cohortModifiers: [],
        campaignSpendUnits: { yes: 0, no: 0 },
        campaignBaseYesShare: 50,
        yesShare: 999,
      })
    ).toBeCloseTo(50, 5);
  });

  it("folds PS spend in as a uniform lean shift", () => {
    const withPs = referendumYesShare({
      cohortBaseline: baseline,
      cohortModifiers: [],
      campaignSpendUnits: { yes: 20, no: 0 },
      campaignBaseYesShare: 50,
      yesShare: 0,
    });
    expect(withPs).toBeGreaterThan(50);
  });

  it("falls back to the legacy scalar derivation with no baseline", () => {
    const v = referendumYesShare({
      cohortModifiers: [],
      campaignSpendUnits: { yes: 10, no: 0 },
      campaignBaseYesShare: 50,
      yesShare: 0,
    });
    expect(v).toBeGreaterThan(50);
    expect(v).toBeCloseTo(deriveCampaignYesShare(50, 10, 0), 10);
  });
});

describe("upsertPollPoint", () => {
  it("appends a clamped reading in turn order", () => {
    const h = upsertPollPoint([{ turn: 1, yesShare: 50 }], 2, 120);
    expect(h).toEqual([
      { turn: 1, yesShare: 50 },
      { turn: 2, yesShare: 100 },
    ]);
  });

  it("clamps negatives to 0", () => {
    expect(upsertPollPoint([], 1, -5)).toEqual([{ turn: 1, yesShare: 0 }]);
  });

  it("is idempotent by turn ; replaces the same-turn reading, no duplicate", () => {
    const h = upsertPollPoint([{ turn: 5, yesShare: 40 }], 5, 42);
    expect(h).toEqual([{ turn: 5, yesShare: 42 }]);
  });

  it("re-sorts when an out-of-order turn is inserted", () => {
    const h = upsertPollPoint([{ turn: 10, yesShare: 60 }], 3, 55);
    expect(h.map((p) => p.turn)).toEqual([3, 10]);
  });

  it("trims to the most recent `cap` readings", () => {
    let h: { turn: number; yesShare: number }[] = [];
    for (let t = 1; t <= 5; t++) h = upsertPollPoint(h, t, 50, 3);
    expect(h.map((p) => p.turn)).toEqual([3, 4, 5]);
  });

  it("treats undefined history as empty", () => {
    expect(upsertPollPoint(undefined, 1, 50)).toEqual([{ turn: 1, yesShare: 50 }]);
  });
});
