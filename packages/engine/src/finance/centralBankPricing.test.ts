import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { ensureCentralBankPricingPhaseIn, resolveCentralBankPricingAdjustment } from "./centralBankPricing.js";
import { computeSavingsInterestForTurn } from "./savingsInterest.js";
import { computeLocInterestForTurn } from "./lineOfCredit.js";

describe("central-bank pricing rollout", () => {
  // The pinned Game helpers (01797b2; source `TURNS_PER_YEAR=48`) were run
  // independently at this exact balance, prime and inflation vector.
  it("matches Game 01797b2's independently executed turn 0, 4, and 8 vectors", () => {
    const vectors = [
      { turn: 0, spread: 0, bonus: 0, savings: 15, loc: 2.08 },
      { turn: 4, spread: 1, bonus: 0.125, savings: 16.25, loc: 2.29 },
      { turn: 8, spread: 2, bonus: 0.25, savings: 17.5, loc: 2.5 },
    ];
    for (const vector of vectors) {
      const adjustment = resolveCentralBankPricingAdjustment(vector.turn, 0);
      expect(adjustment).toMatchObject({
        spreadHikePercentPoints: vector.spread,
        depositBonusPercentPoints: vector.bonus,
      });
      expect(computeSavingsInterestForTurn(48_000, 5, "USD", 2, adjustment.depositBonusPercentPoints)).toBe(vector.savings);
      expect(computeLocInterestForTurn(1_000, 0, 5, 5 + adjustment.spreadHikePercentPoints, "USD")).toBe(vector.loc);
    }
  });

  it("anchors an uninitialized world on its prior turn and saves that rollout state", () => {
    const world = createWorld({ seed: "cb-pricing-anchor", playerName: "Saver", countryId: "US", era: "1953" });
    world.meta.turn = 4;
    const adjustment = ensureCentralBankPricingPhaseIn(world);
    expect(adjustment).toMatchObject({ startedTurn: 3, spreadHikePercentPoints: 0.25, depositBonusPercentPoints: 0.03125 });
    const loaded = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    expect(loaded.centralBankPricingPhaseIn).toEqual({ startedTurn: 3 });
  });
});
