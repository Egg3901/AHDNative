import { describe, expect, it } from "vitest";
import {
  AHDGAME_FEATURE_FLAG_AUDIT,
  DEFAULT_WORLD_FEATURE_FLAGS,
  WORLD_FEATURE_FLAG_DEFINITIONS,
  resolveWorldFeatureFlags,
} from "./featureFlags.js";
import { createWorld } from "./world.js";
import { deserializeSave, serializeSave } from "./save.js";

const OPTS = { seed: "feature-flag-parity", playerName: "Tester", countryId: "US", era: "1953" } as const;

describe("AHDGame feature flag audit (#36)", () => {
  it("classifies every Native key and limits counterparts to equivalent system gates", () => {
    expect(Object.keys(AHDGAME_FEATURE_FLAG_AUDIT).sort()).toEqual(
      WORLD_FEATURE_FLAG_DEFINITIONS.map(({ key }) => key).sort(),
    );
    expect(Object.fromEntries(Object.entries(AHDGAME_FEATURE_FLAG_AUDIT)
      .filter(([, entry]) => entry.counterpart !== null)
      .map(([key, entry]) => [key, entry.counterpart]))).toEqual({
      foreignExchange: "forexEnabled",
      commandEconomy: "commandEconomyEnabled",
      coldWar: "coldWarEnabled",
      conflicts: "conflictsEnabled",
    });
    for (const entry of Object.values(AHDGAME_FEATURE_FLAG_AUDIT)) {
      expect(entry.nativeDefault).toBe("on");
      expect(entry.source).toContain("e364c04954ed628beef73a993a8e9e156650a31e");
    }
  });

  it("keeps omitted defaults, unknown-key rejection, and the complete saved object", () => {
    const world = createWorld(OPTS);
    expect(world.featureFlags).toEqual(DEFAULT_WORLD_FEATURE_FLAGS);
    expect(resolveWorldFeatureFlags({ elections: false })).toEqual({
      ...DEFAULT_WORLD_FEATURE_FLAGS,
      elections: false,
    });
    expect(() => resolveWorldFeatureFlags({ invented: false } as never)).toThrow(/Unknown feature flag/);

    const expected = Object.fromEntries(
      WORLD_FEATURE_FLAG_DEFINITIONS.map(({ key }, index) => [key, index % 2 === 0]),
    );
    world.featureFlags = resolveWorldFeatureFlags(expected);
    const loaded = deserializeSave(serializeSave(world, "2026-09-11T00:00:00.000Z"));
    expect(loaded.featureFlags).toEqual(expected);
  });
});
