import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { Conflict } from "../wars/types.js";
import { ACTION_CATALOG } from "./catalog.js";
import { executeAction } from "./execute.js";

const OPTIONS = {
  seed: "war-action-blockers",
  playerName: "Tester",
  countryId: "US",
  era: "1953",
} as const;

const SAVED_AT = "2026-09-18T00:00:00.000Z";

/** Seeded interstate conflict; Native margin source is coalition GDP. */
function seededConflict(richer: "A" | "B") {
  const world = createWorld(OPTIONS);
  world.countries.US!.economy.gdp = richer === "A" ? 10_000 : 100;
  world.countries.RU!.economy.gdp = richer === "B" ? 10_000 : 100;
  const conflict: Conflict = {
    id: "blocker-contract",
    type: "interstate",
    status: "active",
    intensity: 50,
    sideA: { countries: ["US"] },
    sideB: { countries: ["RU"] },
    control: 50,
    // Age past the 50-turn mobilization span: full-factor step.
    startedAtTurn: world.meta.turn - 60,
  };
  world.conflicts.push(conflict);
  return world;
}

describe("war action boundaries", () => {
  it("exposes the source-backed war verbs as named unavailable blockers", () => {
    expect(ACTION_CATALOG.declareWar).toMatchObject({
      status: "unavailable",
      blockingSystem: "war declaration legislation and unit-level combat",
    });
    expect(ACTION_CATALOG.offerPeace).toMatchObject({
      status: "unavailable",
      blockingSystem: "peace offer and term negotiation",
    });
    expect(ACTION_CATALOG.acceptPeace).toMatchObject({
      status: "unavailable",
      blockingSystem:
        "peace acceptance, term application, and truce enforcement",
    });
  });

  it("refuses unavailable war verbs without spending AP or changing the save", () => {
    const world = createWorld(OPTIONS);
    const before = serializeSave(world, "2026-09-11T00:00:00.000Z");
    const actionsBefore = world.player.actions;

    for (const actionId of [
      "declareWar",
      "offerPeace",
      "acceptPeace",
    ] as const) {
      const result = executeAction(world, "player", actionId);
      expect(result).toEqual({
        ok: false,
        error: expect.stringContaining(
          ACTION_CATALOG[actionId].blockingSystem!,
        ),
      });
    }

    expect(world.player.actions).toBe(actionsBefore);
    expect(serializeSave(world, "2026-09-11T00:00:00.000Z")).toBe(before);
  });

  it("keeps the GDP-margin track through advanceTurn (no combat claim)", () => {
    const richerB = seededConflict("B");
    advanceTurn(richerB);
    expect(richerB.conflicts[0]!.control).toBeGreaterThan(50);

    const richerA = seededConflict("A");
    advanceTurn(richerA);
    expect(richerA.conflicts[0]!.control).toBeLessThan(50);
  });

  it("round-trips conflict state through save/reload with blockers intact", () => {
    const world = seededConflict("B");
    advanceTurn(world);
    const controlAfterTurn = world.conflicts[0]!.control;
    expect(controlAfterTurn).toBeGreaterThan(50);

    const resumed = deserializeSave(serializeSave(world, SAVED_AT));
    expect(resumed.conflicts).toEqual(world.conflicts);
    expect(resumed.settlements).toEqual(world.settlements);

    const actionsBefore = resumed.player.actions;
    for (const actionId of [
      "declareWar",
      "offerPeace",
      "acceptPeace",
    ] as const) {
      expect(executeAction(resumed, "player", actionId)).toEqual({
        ok: false,
        error: expect.stringContaining(
          ACTION_CATALOG[actionId].blockingSystem!,
        ),
      });
    }
    expect(resumed.player.actions).toBe(actionsBefore);
    expect(serializeSave(resumed, SAVED_AT)).toBe(
      serializeSave(world, SAVED_AT),
    );
  });
});
