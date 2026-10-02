import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  decayUndergroundHeat,
  undergroundDetectionChance,
  resolveUndergroundDrive,
  repealUndergroundConversion,
  undergroundStatus,
} from "./underground.js";
import { createWorld } from "../world.js";
import { processUndergroundTurn } from "./undergroundTurn.js";

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

  it("processes banned cells once and uses the current source seeded detection key", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "underground-turn-source", playerName: "Alex" });
    const union = world.unions["UK-manufacturing"]!;
    world.budgets.UK!.unionsBanned = true;
    union.heat = 100;
    union.recentUndergroundDriveCount = 5;
    // Current authority vector: AHDGame cb66acdf src/lib/turn/unions/undergroundTurn.ts
    // calls seededRoll(scopeId, turn, "underground-detection", "illicit-unions-v1");
    // src/lib/events/substrate/rng.ts hashes `${scopeId}:${turn}:${kind}:${salt}`
    // with SHA-256 and reads the first big-endian uint32 before `% 100 + 1`.
    const digest = createHash("sha256").update("UK-manufacturing:7:underground-detection:illicit-unions-v1").digest().readUInt32BE(0);
    const expectedRoll = (digest % 100) + 1;
    expect(expectedRoll).toBe(15);

    const result = processUndergroundTurn(world, 7);

    expect(result.newlyExposed).toBe(1);
    expect(union.exposedUntilTurn).toBe(12);
    expect(union.heat).toBe(98);
    expect(union.recentUndergroundDriveCount).toBe(2.5);
    expect(processUndergroundTurn(world, 7)).toEqual({ unionsChecked: 0, newlyExposed: 0 });
  });
});
