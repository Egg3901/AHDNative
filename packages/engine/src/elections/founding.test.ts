import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { isFoundingActive } from "./founding.js";
import { runElectionTimers } from "./orchestration.js";
import type { ElectionRecord } from "./types.js";

function record(overrides: Partial<ElectionRecord> = {}): ElectionRecord {
  return {
    id: "house:US:NY:c0",
    electionType: "house",
    countryId: "US",
    state: "NY",
    cycle: 0,
    status: "upcoming",
    startTurn: 0,
    primaryEndTurn: 24,
    endTurn: 48,
    totalSeats: 1,
    chamberKey: "house",
    candidates: [],
    tally: {},
    ...overrides,
  };
}

describe("isFoundingActive", () => {
  it("is false without election state", () => {
    expect(isFoundingActive(undefined)).toBe(false);
    expect(isFoundingActive(null)).toBe(false);
    expect(isFoundingActive([])).toBe(false);
  });

  it("is true while a cycle-0 founding race is unresolved", () => {
    expect(isFoundingActive([record({ status: "upcoming" })])).toBe(true);
    expect(isFoundingActive([record({ status: "active" })])).toBe(true);
  });

  it("is false once every cycle-0 race has resolved", () => {
    expect(isFoundingActive([record({ status: "resolved" })])).toBe(false);
    expect(
      isFoundingActive([
        record({ id: "a", status: "resolved" }),
        record({ id: "b", status: "resolved" }),
      ])
    ).toBe(false);
  });

  it("ignores regular scheduled cycles, resolved or not", () => {
    expect(isFoundingActive([record({ id: "c1", cycle: 1, status: "upcoming" })])).toBe(false);
    expect(isFoundingActive([record({ id: "c1", cycle: 1, status: "active" })])).toBe(false);
    expect(isFoundingActive([record({ id: "c2", cycle: 2, status: "active" })])).toBe(false);
  });

  it("stays false through real scheduling: the solo engine starts at cycle >= 1", () => {
    const world = createWorld({ seed: "founding-lifecycle", playerName: "Player", countryId: "US", era: "1953" });
    expect(isFoundingActive(world.elections)).toBe(false);
    runElectionTimers(world, rngFromSeed("founding-lifecycle"));
    for (const rec of world.elections) {
      expect(rec.cycle).toBeGreaterThanOrEqual(1);
    }
    expect(isFoundingActive(world.elections)).toBe(false);
  });
});
