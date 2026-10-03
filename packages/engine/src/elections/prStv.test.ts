import { describe, expect, it } from "vitest";
import { castRankedBallots, countPrStv, mergeRankedBallots, validateRankedBallots } from "./prStv.js";

describe("source-pinned Irish PR-STV count", () => {
  it("transfers elected-candidate surplus and can elect a candidate who trails on first preferences", () => {
    const ballots = [
      { weight: 45, preferences: ["a", "c"] },
      { weight: 30, preferences: ["b"] },
      { weight: 20, preferences: ["c"] },
      { weight: 5, preferences: ["d", "c"] },
    ];
    const result = countPrStv(["a", "b", "c", "d"], 2, ballots);
    expect(result.quota).toBe(34);
    expect(result.elected).toEqual(["a", "c"]);
    expect(result.seats).toEqual({ a: 1, b: 0, c: 1, d: 0 });
    expect(result.rounds.map((round) => round.action)).toEqual(["elect", "eliminate", "elect"]);
    expect(result.rounds[0]!.transferValue).toBeCloseTo(11 / 45, 10);
    expect(result.rounds.every((round) => round.conservationResidual === 0)).toBe(true);
    validateRankedBallots(ballots, { a: 45, b: 30, c: 20, d: 5 });
  });

  it("uses prior counts before candidate ID for ties and remains independent of candidate input order", () => {
    const ballots = [
      { weight: 5, preferences: ["a"] },
      { weight: 5, preferences: ["b"] },
      { weight: 5, preferences: ["c"] },
    ];
    expect(countPrStv(["b", "a", "c"], 1, ballots)).toEqual(
      countPrStv(["c", "a", "b"], 1, ballots),
    );
    expect(countPrStv(["b", "a", "c"], 1, ballots).elected).toEqual(["a"]);
  });

  it("retains fractional parcel value and reports an exact zero conservation residual", () => {
    const result = countPrStv(["a", "b", "c", "d"], 2, [
      { weight: 40, preferences: ["a", "d", "c"] },
      { weight: 25, preferences: ["b"] },
      { weight: 24, preferences: ["c"] },
      { weight: 11, preferences: ["d", "c"] },
    ]);
    expect(result.elected).toEqual(["a", "c"]);
    expect(result.rounds[1]!.candidates).toEqual(["d"]);
    expect(result.rounds[2]!.totals.c).toBeCloseTo(41, 8);
    expect(result.rounds.every((round) => round.conservationResidual === 0)).toBe(true);
    expect(result.arithmetic).toBe("exact_rational");
  });

  it("compacts identical cast rankings and refuses inconsistent first-preference evidence", () => {
    const candidates = [
      { candidateId: "a", party: "one", charEP: -2, charSP: 0 },
      { candidateId: "b", party: "one", charEP: 3, charSP: 0 },
      { candidateId: "c", party: "two", charEP: -1, charSP: 0 },
    ];
    const ballots = castRankedBallots(candidates, { a: 45, b: 0, c: 30 });
    expect(ballots).toEqual([
      { weight: 45, preferences: ["a", "b", "c"] },
      { weight: 30, preferences: ["c", "a", "b"] },
    ]);
    expect(mergeRankedBallots(ballots, ballots).map((row) => row.weight)).toEqual([90, 60]);
    expect(() => validateRankedBallots(ballots, { a: 44, b: 0, c: 30 })).toThrow(/disagree/);
  });
});
