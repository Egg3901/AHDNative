import { describe, expect, it } from "vitest";
import { DEFAULT_WORLD_FEATURE_FLAGS } from "@ahdclient/engine";
import { GameSession } from "./session";

describe("creation feature flags", () => {
  it("creates and reloads the complete selected simulation map", () => {
    const session = new GameSession();
    session.create({
      era: "1953",
      countryId: "US",
      seed: "creation-flags",
      playerName: "Ada",
      featureFlags: { ...DEFAULT_WORLD_FEATURE_FLAGS, events: false, conflicts: false },
    });
    const raw = JSON.parse(session.serialize("2026-09-15T00:00:00.000Z"));
    expect(raw.world.featureFlags).toEqual({ ...DEFAULT_WORLD_FEATURE_FLAGS, events: false, conflicts: false });

    const loaded = new GameSession();
    loaded.load(JSON.stringify(raw));
    expect(JSON.parse(loaded.serialize("2026-09-15T00:00:00.000Z")).world.featureFlags).toEqual(raw.world.featureFlags);
  });
});
