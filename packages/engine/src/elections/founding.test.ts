import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { rngFromSeed } from "../rng.js";
import { deserializeSave, serializeSave } from "../save.js";
import {
  detectFoundingComplete,
  isFoundingActive,
  runFoundingSweep,
  stampFoundingMarker,
} from "./founding.js";
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

describe("stampFoundingMarker", () => {
  it("stamps an active marker once and never reopens a completed phase", () => {
    const world = createWorld({ seed: "founding-stamp", playerName: "Player", countryId: "US", era: "1953" });
    expect(world.meta.preIteration).toBeUndefined();
    expect(stampFoundingMarker(world)).toBe(true);
    expect(world.meta.preIteration).toMatchObject({ active: true, startedTurn: 0 });
    expect(world.meta.preIterationTurns).toBe(0);
    expect(stampFoundingMarker(world)).toBe(false);
    world.meta.preIteration!.active = false;
    world.meta.preIteration!.completedTurn = 48;
    expect(stampFoundingMarker(world)).toBe(false);
    expect(world.meta.preIteration!.completedTurn).toBe(48);
  });
});

describe("runFoundingSweep", () => {
  it("is a no-op without an active marker", () => {
    const world = createWorld({ seed: "founding-sweep-off", playerName: "Player", countryId: "US", era: "1953" });
    expect(runFoundingSweep(world, rngFromSeed("founding-sweep-off"))).toBe(0);
    expect(world.elections).toHaveLength(0);
  });

  it("spawns one bounded cycle-0 race per in-scope series, then nothing", () => {
    const world = createWorld({ seed: "founding-sweep", playerName: "Player", countryId: "US", era: "1953" });
    expect(stampFoundingMarker(world)).toBe(true);
    const spawned = runFoundingSweep(world, rngFromSeed("founding-sweep"));
    expect(spawned).toBeGreaterThan(0);
    expect(spawned).toBeLessThanOrEqual(600);
    expect(world.elections).toHaveLength(spawned);
    const ids = new Set(world.elections.map((rec) => rec.id));
    expect(ids.size).toBe(spawned);
    for (const rec of world.elections) {
      expect(rec.cycle).toBe(0);
      expect(rec.startTurn).toBe(0);
      expect(rec.primaryEndTurn - rec.startTurn).toBe(24);
      expect(rec.endTurn - rec.primaryEndTurn).toBe(24);
      expect(rec.status).toBe("active");
      expect(rec.candidates.length).toBeGreaterThan(0);
    }
    expect(isFoundingActive(world.elections)).toBe(true);
    // Idempotent and bounded: a second sweep adds nothing.
    expect(runFoundingSweep(world, rngFromSeed("founding-sweep"))).toBe(0);
    expect(world.elections).toHaveLength(spawned);
  });

  it("respects an explicit race cap", () => {
    const world = createWorld({ seed: "founding-cap", playerName: "Player", countryId: "US", era: "1953" });
    stampFoundingMarker(world);
    expect(runFoundingSweep(world, rngFromSeed("founding-cap"), 3)).toBe(3);
    expect(world.elections).toHaveLength(3);
  });
});

describe("detectFoundingComplete", () => {
  function foundingWorld(seed: string) {
    const world = createWorld({ seed, playerName: "Player", countryId: "US", era: "1953" });
    stampFoundingMarker(world);
    runFoundingSweep(world, rngFromSeed(seed));
    return world;
  }

  function resolveAll(world: ReturnType<typeof createWorld>) {
    for (const rec of world.elections) {
      rec.status = "resolved";
      if (rec.candidates.length === 0) {
        rec.candidates = [{ id: "cand-a", name: "A", partyId: "US_DEM", incumbent: false } as never];
      }
      rec.tally = { "cand-a": 100 };
    }
  }

  it("is a no-op without an active marker", () => {
    const world = createWorld({ seed: "founding-detect-off", playerName: "Player", countryId: "US", era: "1953" });
    expect(detectFoundingComplete(world)).toBe(false);
  });

  it("stays active while any founding race is pending", () => {
    const world = foundingWorld("founding-pending");
    resolveAll(world);
    world.elections[0]!.status = "active";
    expect(detectFoundingComplete(world)).toBe(false);
    expect(world.meta.preIteration?.active).toBe(true);
  });

  it("does not complete on empty or voteless resolutions", () => {
    const world = foundingWorld("founding-empty");
    resolveAll(world);
    world.elections[0]!.candidates = [];
    expect(detectFoundingComplete(world)).toBe(false);
    resolveAll(world);
    world.elections[0]!.tally = {};
    expect(detectFoundingComplete(world)).toBe(false);
    expect(world.meta.preIteration?.active).toBe(true);
  });

  it("completes once every founding race resolves with coverage, stamping the offset", () => {
    const world = foundingWorld("founding-complete");
    world.meta.turn = 48;
    resolveAll(world);
    expect(detectFoundingComplete(world)).toBe(true);
    expect(world.meta.preIteration).toMatchObject({ active: false, startedTurn: 0, completedTurn: 48 });
    expect(world.meta.preIterationTurns).toBe(48);
    expect(isFoundingActive(world.elections)).toBe(false);
    expect(detectFoundingComplete(world)).toBe(false);
  });
});

describe("founding convergence through the real turn loop (#223)", () => {
  it("resolves every founding race, clears the marker, and resumes the calendar", () => {
    const world = createWorld({
      seed: "founding-converge",
      playerName: "Player",
      countryId: "US",
      era: "1953",
      foundingElections: true,
    });
    const startDate = world.meta.date;
    expect(world.meta.preIteration?.active).toBe(true);
    expect(world.elections.length).toBeGreaterThan(0);
    let completedAt = -1;
    for (let turn = 0; turn < 120; turn += 1) {
      if (world.meta.preIteration?.active !== true) {
        completedAt = world.meta.turn;
        break;
      }
      const dateBefore = world.meta.date;
      advanceTurn(world);
      if (world.meta.preIteration?.active === true) {
        expect(world.meta.date).toBe(dateBefore);
      }
    }
    expect(completedAt).toBeGreaterThan(0);
    expect(world.meta.preIteration?.active).toBe(false);
    expect(world.meta.preIterationTurns).toBe(completedAt);
    expect(isFoundingActive(world.elections)).toBe(false);
    // The calendar resumes after completion instead of jumping.
    const dateAtCompletion = world.meta.date;
    advanceTurn(world);
    expect(world.meta.date > dateAtCompletion).toBe(true);
    expect(world.meta.date > startDate).toBe(true);
  }, 120000);

  it("freezes the calendar date while the phase is active", () => {
    const world = createWorld({
      seed: "founding-freeze",
      playerName: "Player",
      countryId: "US",
      era: "1953",
      foundingElections: true,
    });
    const startDate = world.meta.date;
    for (let turn = 0; turn < 5; turn += 1) advanceTurn(world);
    expect(world.meta.turn).toBe(5);
    expect(world.meta.date).toBe(startDate);
    expect(world.meta.preIteration?.active).toBe(true);
  }, 120000);

  it("survives a save/reload round trip mid-phase", () => {
    const world = createWorld({
      seed: "founding-savereload",
      playerName: "Player",
      countryId: "US",
      era: "1953",
      foundingElections: true,
    });
    advanceTurn(world);
    const restored = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    expect(restored.meta.preIteration?.active).toBe(true);
    expect(restored.meta.preIterationTurns).toBe(0);
    expect(isFoundingActive(restored.elections)).toBe(true);
    expect(restored.elections.filter((rec) => rec.cycle === 0).length).toBe(
      world.elections.filter((rec) => rec.cycle === 0).length
    );
    advanceTurn(restored);
    expect(restored.meta.turn).toBe(world.meta.turn + 1);
  }, 120000);
});
