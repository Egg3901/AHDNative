import { describe, expect, it } from "vitest";
import { advanceOutputGap } from "./macroCountryTurn.js";

// Independently executed Game 88fb2de965 src/lib/metricEngine/outputGap.ts.
// The source bounds the persisted gap and headline rate together.
describe("source output gap stock and rate bounds", () => {
  it("retains the exact stock change when a boom reaches the growth ceiling", () => {
    const result = advanceOutputGap(0, 100, 2, 48);
    expect(result.gap).toBeCloseTo(13 / 48, 12);
    expect(result.gdpGrowth).toBe(15);
    expect(result.impulse).toBe(98);
    expect(2 + result.gap * 48).toBe(result.gdpGrowth);
  });

  it("retains the exact stock change when a contraction reaches the growth floor", () => {
    const result = advanceOutputGap(0, -100, 2, 48);
    expect(result.gap).toBeCloseTo(-17 / 48, 12);
    expect(result.gdpGrowth).toBe(-15);
    expect(result.impulse).toBe(-102);
    expect(2 + result.gap * 48).toBe(result.gdpGrowth);
  });

  it("normalizes prior stock, potential and the time divisor before bounding", () => {
    expect(advanceOutputGap(999, 100, 99, 48)).toMatchObject({
      gap: 15, gdpGrowth: 15, impulse: 85,
    });
    expect(advanceOutputGap(0, 100, 2, 0)).toMatchObject({
      gap: 13, gdpGrowth: 15, impulse: 98,
    });
  });
});
