import { describe, expect, it } from "vitest";
import { advanceTurn, createWorld, deserializeSave, projectSaveToV42, serializeSave, sourceElectionClockForWorld } from "../index.js";

describe("source election clock", () => {
  it("keeps the selected pack year through public turn and save/reload checkpoints", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "source-year-clock", playerName: "Ada" });
    expect(world.meta.startingYear).toBe(1953);
    expect(sourceElectionClockForWorld(world)).toEqual({ startingYear: 1953, calendarTurn: 1, currentYear: 1953 });
    expect(projectSaveToV42(serializeSave(world, "2026-10-03T00:00:00.000Z"))).toMatchObject({
      ok: false,
      error: expect.stringContaining("source 48-turn election clock"),
    });

    for (let completed = 0; completed < 48; completed += 1) advanceTurn(world);
    expect(world.meta.turn).toBe(48);
    expect(sourceElectionClockForWorld(world)).toEqual({ startingYear: 1953, calendarTurn: 49, currentYear: 1954 });

    const loaded = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    expect(loaded.meta.startingYear).toBe(1953);
    expect(sourceElectionClockForWorld(loaded)).toEqual(sourceElectionClockForWorld(world));
    advanceTurn(loaded);
    expect(sourceElectionClockForWorld(loaded)).toEqual({ startingYear: 1953, calendarTurn: 50, currentYear: 1954 });
  }, 180_000);

  it("preserves legacy absence rather than inferring a source clock from era/date", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "source-year-legacy", playerName: "Ada" });
    const parsed = JSON.parse(serializeSave(world, "2026-10-03T00:00:00.000Z")) as {
      schemaVersion: number;
      world: { meta: { schemaVersion: number; startingYear?: number } };
    };
    delete parsed.world.meta.startingYear;
    parsed.schemaVersion = 68;
    parsed.world.meta.schemaVersion = 68;
    const loaded = deserializeSave(JSON.stringify(parsed));
    expect(loaded.meta.schemaVersion).toBe(69);
    expect(loaded.meta.startingYear).toBeUndefined();
    expect(sourceElectionClockForWorld(loaded)).toBeNull();
  });

  it("freezes founding time and resumes from the one-based source turn", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "source-year-founding", playerName: "Ada", foundingElections: true });
    world.meta.turn = 37;
    expect(sourceElectionClockForWorld(world)).toEqual({ startingYear: 1953, calendarTurn: 1, currentYear: 1953 });
    world.meta.preIteration = { active: false, startedTurn: 0, completedTurn: 37 };
    world.meta.preIterationTurns = 37;
    expect(sourceElectionClockForWorld(world)).toEqual({ startingYear: 1953, calendarTurn: 1, currentYear: 1953 });
  });
});
