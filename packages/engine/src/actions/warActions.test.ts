import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { serializeSave } from "../save.js";
import { ACTION_CATALOG } from "./catalog.js";
import { executeAction } from "./execute.js";

const OPTIONS = {
  seed: "war-action-blockers",
  playerName: "Tester",
  countryId: "US",
  era: "1953",
} as const;

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
});
