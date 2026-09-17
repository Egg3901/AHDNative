import { describe, expect, it } from "vitest";
import { advanceTurn } from "./engine.js";
import { deserializeSave, serializeSave } from "./save.js";
import { createWorld } from "./world.js";

const OPTIONS = {
  seed: "ci-smoke",
  playerName: "CI",
  countryId: "US",
  era: "1953",
} as const;

describe("fast turn pipeline smoke", () => {
  it("gives a new character the reference endowment needed to bootstrap campaign funds", () => {
    const world = createWorld(OPTIONS);

    // Reference gameConfig seed: startingFunds 250_000 flat, donor floor 1.
    expect(world.player.funds).toBe(250_000);
    expect(world.player.donorBaseLevel).toBe(1);
  });

  it("advances, remains deterministic, and survives a save round trip", () => {
    const first = createWorld(OPTIONS);
    const second = createWorld(OPTIONS);

    advanceTurn(first);
    advanceTurn(second);

    expect(first.meta.turn).toBe(1);
    expect(first.meta.date).toBe("1953-01-13");
    expect(second).toEqual(first);

    const restored = deserializeSave(serializeSave(first, "2026-09-02T00:00:00Z"));
    expect(restored).toEqual(first);
  });
});
