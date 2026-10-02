import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { executeAction } from "../actions/execute.js";

// Public executive command boundary. Source's country nationalize route
// authorizes discounted/seizure; a fair-value taking requires a passed bill.
describe("source nationalization authority", () => {
  it("refuses a fair-value executive taking without changing the world", () => {
    const world = createWorld({ seed: "fair-requires-legislation", era: "1953", countryId: "US", playerName: "President", mode: "hos" });
    const before = JSON.stringify(world);
    const result = executeAction(world, "player", "nationalizeCorporation", { corporationId: "US-media", tier: "fair" });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/passed.*bill|legislat/i) });
    expect(JSON.stringify(world)).toBe(before);
  });
});
