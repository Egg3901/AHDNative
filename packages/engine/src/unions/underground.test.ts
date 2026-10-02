import { describe, expect, it } from "vitest";
import {
  decayUndergroundHeat,
  undergroundDetectionChance,
  resolveUndergroundDrive,
  repealUndergroundConversion,
  undergroundStatus,
} from "./underground.js";

describe("source underground union rules", () => {
  it("prices quiet and mass drives from approval and halves progress while exposed", () => {
    expect(resolveUndergroundDrive({ mode: "quiet", approval: 50, exposed: false })).toEqual({ strengthGain: 4, heat: 5 });
    expect(resolveUndergroundDrive({ mode: "mass", approval: 30, exposed: true })).toEqual({ strengthGain: 4.5, heat: 18 });
  });

  it("decays heat, caps detection chance and exposes only inside the recorded window", () => {
    expect(decayUndergroundHeat(31)).toBe(29);
    expect(undergroundDetectionChance(30, 2)).toBe(10);
    expect(undergroundDetectionChance(100, 5)).toBe(60);
    expect(undergroundStatus({ heat: 30, exposedUntilTurn: 8 }, 8)).toBe("exposed");
    expect(undergroundStatus({ heat: 30, exposedUntilTurn: 8 }, 9)).toBe("suspected");
  });

  it("converts only half the shadow pool when the ban is repealed", () => {
    expect(repealUndergroundConversion(100)).toBe(50);
    expect(repealUndergroundConversion(Number.NaN)).toBe(0);
  });
});
