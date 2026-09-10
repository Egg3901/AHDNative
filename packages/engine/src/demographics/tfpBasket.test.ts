import { describe, expect, it } from "vitest";
import {
  agglomeration,
  potentialGrowth,
  tfpBasket,
  TFP_BASELINE,
  TFP_BOUNDS,
  TFP_REFERENCE_INPUTS,
} from "./laborForce.js";

/**
 * Independently recomputed from AHDGame src/lib/metricEngine/potentialGrowth.ts
 * at e364c04954ed628beef73a993a8e9e156650a31e. These numbers are not copied from
 * AHDGame test files; they are the closed-form result of that revision's formula.
 *
 * tfp = clamp(
 *   1.2
 *   + 0.25 * ((rd - 2.5) / 2)
 *   + 0.5 * ((skill - 60) / 30)
 *   + 0.2 * ((transport - 55) / 45)
 *   + 0.15 * ((broadband - 75) / 25)
 *   + 0.1 * ((grid - 98.5) / 1.45)
 *   + 1.5 * (u/(u+40) - 55/95),
 *   0.2, 2.6)
 */
describe("tfpBasket primary-source vectors (AHDGame e364c0495)", () => {
  it("pins reference constants from potentialGrowth.ts", () => {
    expect(TFP_BASELINE).toBe(1.2);
    expect(TFP_BOUNDS[0]).toBe(0.2);
    expect(TFP_BOUNDS[1]).toBe(2.6);
    expect(TFP_REFERENCE_INPUTS).toEqual({
      rdIntensity: 2.5,
      workforceSkill: 60,
      transportEfficiency: 55,
      broadbandAccess: 75,
      powerGridReliability: 98.5,
      urbanizationRate: 55,
    });
  });

  it("equals TFP_BASELINE exactly at reference inputs and when all inputs are absent", () => {
    expect(tfpBasket(TFP_REFERENCE_INPUTS)).toBe(1.2);
    expect(tfpBasket({})).toBe(1.2);
  });

  it("applies independently computed single-term deviations", () => {
    expect(tfpBasket({ rdIntensity: 4.5 })).toBe(1.45);
    expect(tfpBasket({ rdIntensity: 0.5 })).toBe(0.95);
    expect(tfpBasket({ workforceSkill: 90 })).toBe(1.7);
    expect(tfpBasket({ workforceSkill: 30 })).toBe(0.7);
    expect(tfpBasket({ transportEfficiency: 90 })).toBeCloseTo(1.3555555555555556, 12);
    expect(tfpBasket({ transportEfficiency: 20 })).toBeCloseTo(1.0444444444444443, 12);
    expect(tfpBasket({ broadbandAccess: 99 })).toBeCloseTo(1.3439999999999999, 12);
    expect(tfpBasket({ broadbandAccess: 50 })).toBe(1.05);
    expect(tfpBasket({ powerGridReliability: 99.9 })).toBeCloseTo(1.2965517241379314, 12);
    expect(tfpBasket({ powerGridReliability: 97 })).toBeCloseTo(1.096551724137931, 12);
    expect(tfpBasket({ urbanizationRate: 90 })).toBeCloseTo(1.3700404858299593, 12);
    expect(tfpBasket({ urbanizationRate: 25 })).toBeCloseTo(0.908502024291498, 12);
  });

  it("agglomeration(92) is concave versus agglomeration(25)", () => {
    expect(agglomeration(92)).toBeCloseTo(92 / 132, 12);
    expect(agglomeration(25)).toBeCloseTo(25 / 65, 12);
    expect(agglomeration(92)).toBeGreaterThan(agglomeration(25));
    const lowStep =
      tfpBasket({ ...TFP_REFERENCE_INPUTS, urbanizationRate: 50 }) -
      tfpBasket({ ...TFP_REFERENCE_INPUTS, urbanizationRate: 40 });
    const highStep =
      tfpBasket({ ...TFP_REFERENCE_INPUTS, urbanizationRate: 90 }) -
      tfpBasket({ ...TFP_REFERENCE_INPUTS, urbanizationRate: 80 });
    expect(lowStep).toBeCloseTo(0.08333333333333348, 12);
    expect(highStep).toBeCloseTo(0.038461538461538325, 12);
    expect(highStep).toBeLessThan(lowStep);
  });

  it("clamps joint extremes to TFP_BOUNDS and never goes negative from TFP alone", () => {
    expect(
      tfpBasket({
        rdIntensity: 6,
        workforceSkill: 100,
        transportEfficiency: 100,
        urbanizationRate: 100,
      }),
    ).toBe(2.6);
    expect(
      tfpBasket({
        rdIntensity: 0,
        workforceSkill: 0,
        transportEfficiency: 0,
        urbanizationRate: 0,
      }),
    ).toBe(0.2);
    expect(
      tfpBasket({
        rdIntensity: 0.5,
        workforceSkill: 30,
        transportEfficiency: 20,
        broadbandAccess: 50,
        powerGridReliability: 97,
        urbanizationRate: 25,
      }),
    ).toBe(0.2);
    expect(
      tfpBasket({
        rdIntensity: 4.5,
        workforceSkill: 90,
        transportEfficiency: 90,
        broadbandAccess: 99,
        powerGridReliability: 99.9,
        urbanizationRate: 92,
      }),
    ).toBeCloseTo(2.5231407725164536, 12);
  });

  it("rejects non-finite inputs by falling back to the reference term", () => {
    expect(
      tfpBasket({ rdIntensity: Number.NaN, workforceSkill: Number.POSITIVE_INFINITY, urbanizationRate: Number.NaN }),
    ).toBe(1.2);
  });

  it("feeds Solow potentialGrowth without changing labor or capital shares", () => {
    const gL = 0.4;
    const gK = 2.0;
    expect(potentialGrowth(gL, gK, tfpBasket(TFP_REFERENCE_INPUTS))).toBeCloseTo(2.144, 12);
    expect(potentialGrowth(gL, gK, tfpBasket({ rdIntensity: 4.5 }))).toBeCloseTo(2.394, 12);
    expect(potentialGrowth(gL, gK, tfpBasket({ rdIntensity: 0.5 }))).toBeCloseTo(1.894, 12);
  });
});
