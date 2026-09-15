import { describe, expect, it } from "vitest";
import { DEFAULT_WORLD_FEATURE_FLAGS } from "@ahdclient/engine";
import { GameSession } from "./session";

const OPTS = {
  era: "1953",
  countryId: "US",
  seed: "world-admin-flags",
  playerName: "Ada",
  mode: "career",
  initialization: "historical",
} as const;

describe("running-world feature flags (#352)", () => {
  it("updates one flag and preserves every untouched flag", () => {
    const session = new GameSession();
    const before = session.create({ ...OPTS });
    expect(before.featureFlags).toEqual(DEFAULT_WORLD_FEATURE_FLAGS);
    const after = session.updateWorldFeatureFlags({ events: false });
    expect(after.featureFlags).toEqual({ ...DEFAULT_WORLD_FEATURE_FLAGS, events: false });
  });

  it("preserves every other saved field when flags change", () => {
    const session = new GameSession();
    session.create({ ...OPTS });
    const before = JSON.parse(session.serialize("2026-09-15T00:00:00.000Z"));
    session.updateWorldFeatureFlags({ conflicts: false, events: false });
    const after = JSON.parse(session.serialize("2026-09-15T00:00:00.000Z"));
    expect(after.world.featureFlags).toEqual({
      ...DEFAULT_WORLD_FEATURE_FLAGS,
      conflicts: false,
      events: false,
    });
    const { featureFlags: _beforeFlags, ...beforeRest } = before.world;
    const { featureFlags: _afterFlags, ...afterRest } = after.world;
    expect(afterRest).toEqual(beforeRest);
    expect(after.notifications).toEqual(before.notifications);
  });

  it("keeps the updated map authoritative across save and reload", () => {
    const session = new GameSession();
    session.create({ ...OPTS });
    session.updateWorldFeatureFlags({ elections: false, markets: false });
    const raw = JSON.parse(session.serialize("2026-09-15T00:00:00.000Z"));
    expect(raw.world.featureFlags).toEqual({
      ...DEFAULT_WORLD_FEATURE_FLAGS,
      elections: false,
      markets: false,
    });

    const loaded = new GameSession();
    const view = loaded.load(JSON.stringify(raw));
    expect(view.featureFlags).toEqual(raw.world.featureFlags);
    expect(JSON.parse(loaded.serialize("2026-09-15T00:00:00.000Z")).world.featureFlags)
      .toEqual(raw.world.featureFlags);
  });

  it("rejects unknown keys and non-booleans before committing anything", () => {
    const session = new GameSession();
    session.create({ ...OPTS });
    expect(() => session.updateWorldFeatureFlags({ invented: false } as never))
      .toThrow(/Unknown feature flag/);
    expect(() => session.updateWorldFeatureFlags({ events: "no" } as never))
      .toThrow(/must be boolean/);
    expect(session.view().featureFlags).toEqual(DEFAULT_WORLD_FEATURE_FLAGS);
  });
});
