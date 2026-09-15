import { describe, expect, it } from "vitest";
import {
  DEFAULT_NPP_AUTONOMY_LEVEL,
  NPP_AUTONOMY_LEVELS,
  effectiveNppAutonomyLevelForCountry,
  isNppAutonomyLevel,
  nppAutonomyLevelAtLeast,
  resolveNppAutonomyLevel,
} from "./nppAutonomyLevel.js";
import { createWorld } from "./world.js";
import { advanceTurn } from "./engine.js";
import { deserializeSave, serializeSave } from "./save.js";

/**
 * Issue #345 (autonomy tier axis). Canonical source: AHDGame at the 1902
 * contract — src/lib/db/types/gameState.ts (NppAutonomyLevel
 * off/v0/v1/v2/v3/v4/v5 with tier meanings, difficulty-never-unlocks note),
 * src/app/api/singleplayer/new-game/route.ts (omitted level defaults to v4),
 * src/lib/nppAutonomy/featureFlag.ts (NPP_AUTONOMY_LEVEL_RANK,
 * nppAutonomyLevelAtLeast, player-country rail below v2 resolves to off).
 */
describe("npp autonomy tier contract (#345)", () => {
  it("ships the canonical accepted values with v4 as default", () => {
    expect([...NPP_AUTONOMY_LEVELS]).toEqual(["off", "v0", "v1", "v2", "v3", "v4", "v5"]);
    expect(DEFAULT_NPP_AUTONOMY_LEVEL).toBe("v4");
    expect(resolveNppAutonomyLevel(undefined)).toBe("v4");
  });

  it("rejects unknown autonomy values", () => {
    expect(() => resolveNppAutonomyLevel("v6")).toThrow(/autonomy/i);
    expect(isNppAutonomyLevel("turbo")).toBe(false);
    expect(isNppAutonomyLevel("v5")).toBe(true);
  });

  it("orders ranks canonically, never with strict equality", () => {
    expect(nppAutonomyLevelAtLeast("v4", "v2")).toBe(true);
    expect(nppAutonomyLevelAtLeast("v2", "v2")).toBe(true);
    expect(nppAutonomyLevelAtLeast("v1", "v2")).toBe(false);
    expect(nppAutonomyLevelAtLeast("off", "v0")).toBe(false);
    expect(nppAutonomyLevelAtLeast("v5", "v4")).toBe(true);
    expect(nppAutonomyLevelAtLeast("v4", "v5")).toBe(false);
  });

  it("rails autonomy below v2 to off in the player country only", () => {
    expect(effectiveNppAutonomyLevelForCountry("v1", "US", "US")).toBe("off");
    expect(effectiveNppAutonomyLevelForCountry("v1", "UK", "US")).toBe("v1");
    expect(effectiveNppAutonomyLevelForCountry("v2", "US", "US")).toBe("v2");
    expect(effectiveNppAutonomyLevelForCountry("off", "UK", "US")).toBe("off");
    expect(effectiveNppAutonomyLevelForCountry("v4", "US", "US")).toBe("v4");
    // An absent axis resolves to the v4 default through the same path.
    expect(effectiveNppAutonomyLevelForCountry(undefined, "US", "US")).toBe("v4");
    expect(effectiveNppAutonomyLevelForCountry(undefined, "UK", "US")).toBe("v4");
  });

  it("persists only a non-default tier; absent means v4", () => {
    const def = createWorld({ era: "1953", countryId: "US", seed: "aut-default", playerName: "Ada" });
    expect(def.nppAutonomyLevel).toBeUndefined();
    expect(resolveNppAutonomyLevel(def.nppAutonomyLevel)).toBe("v4");
    expect(effectiveNppAutonomyLevelForCountry(def.nppAutonomyLevel, "US", "US")).toBe("v4");
    // An explicit v4 choice stores the same absent key, so default
    // worlds stay byte-stable (see npp/stanceDriftPerformance.test.ts).
    const explicit = createWorld({ era: "1953", countryId: "US", seed: "aut-default", playerName: "Ada", autonomyLevel: "v4" });
    expect(explicit.nppAutonomyLevel).toBeUndefined();
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(def));
    const off = createWorld({ era: "1953", countryId: "US", seed: "aut-off", playerName: "Ada", autonomyLevel: "off" });
    expect(off.nppAutonomyLevel).toBe("off");
  });

  it("rejects an unknown tier at world creation", () => {
    expect(() =>
      createWorld({ era: "1953", countryId: "US", seed: "aut-bad", playerName: "Ada", autonomyLevel: "v9" as never }),
    ).toThrow(/autonomy/i);
  });

  it("gates autonomous NPP activity by tier, never competence tuning", () => {
    const seed = "aut-gate121";
    const off = createWorld({ era: "1953", countryId: "US", seed, playerName: "Ada", autonomyLevel: "off" });
    const on = createWorld({ era: "1953", countryId: "US", seed, playerName: "Ada", autonomyLevel: "v4" });
    const npcFundsBefore = (w: typeof on) => w.politicians.reduce((t, p) => t + (p.funds ?? 0), 0);
    const beforeOff = npcFundsBefore(off);
    const beforeOn = npcFundsBefore(on);
    expect(beforeOff).toBe(beforeOn);
    for (let i = 0; i < 12; i += 1) {
      advanceTurn(off);
      advanceTurn(on);
    }
    // No autonomous activity at off: no NPP bills sponsored, no NPP ballots cast.
    expect(off.bills.filter((b) => b.nppSponsored).length).toBe(0);
    expect(off.bills.flatMap((b) => Object.keys(b.votes)).length).toBe(0);
    // The funded default world runs its ported v0 activities (sponsorship or
    // voting) over the same turns; the tier gates which activities run, while
    // the difficulty fund multiplier still scales NPC funds identically here
    // because both worlds share the default normal difficulty.
    const onActivity =
      on.bills.filter((b) => b.nppSponsored).length +
      on.bills.flatMap((b) => Object.keys(b.votes)).length;
    expect(onActivity).toBeGreaterThan(0);
    expect(npcFundsBefore(off)).toBeGreaterThanOrEqual(beforeOff);
  });

  it("applies the player-country rail: v1 stays quiet at home but acts abroad", () => {
    const seed = "aut-rail77";
    const v1 = createWorld({ era: "1953", countryId: "US", seed, playerName: "Ada", initialization: "historical", autonomyLevel: "v1" });
    const v2 = createWorld({ era: "1953", countryId: "US", seed, playerName: "Ada", initialization: "historical", autonomyLevel: "v2" });
    for (let i = 0; i < 48; i += 1) {
      advanceTurn(v1);
      advanceTurn(v2);
    }
    const homeSponsored = (w: typeof v1) =>
      w.bills.filter((b) => b.nppSponsored && b.countryId === "US").length;
    const abroadSponsored = (w: typeof v1) =>
      w.bills.filter((b) => b.nppSponsored && b.countryId !== "US").length;
    // v2 comingles with the player country; v1 resolves to off there while
    // still acting abroad.
    expect(homeSponsored(v2)).toBeGreaterThan(0);
    expect(homeSponsored(v1)).toBe(0);
    expect(abroadSponsored(v1)).toBeGreaterThan(0);
  });

  it("round-trips the tier through save and reload", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "aut-save", playerName: "Ada", autonomyLevel: "v2" });
    const loaded = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    expect(loaded.nppAutonomyLevel).toBe("v2");
    const def = createWorld({ era: "1953", countryId: "US", seed: "aut-save", playerName: "Ada" });
    const defRaw = JSON.parse(serializeSave(def, "2026-09-15T00:00:00.000Z")) as {
      world: Record<string, unknown>;
    };
    expect("nppAutonomyLevel" in defRaw.world).toBe(false);
    const defLoaded = deserializeSave(serializeSave(def, "2026-09-15T00:00:00.000Z"));
    expect(defLoaded.nppAutonomyLevel).toBeUndefined();
    expect(resolveNppAutonomyLevel(defLoaded.nppAutonomyLevel)).toBe("v4");
  });

  it("loads pre-contract saves with the absent tier as the v4 default", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "aut-legacy", playerName: "Ada" });
    const raw = JSON.parse(serializeSave(world, "2026-09-15T00:00:00.000Z")) as {
      world: Record<string, unknown>;
    };
    expect("nppAutonomyLevel" in raw.world).toBe(false);
    expect(deserializeSave(JSON.stringify(raw)).nppAutonomyLevel).toBeUndefined();
    expect(resolveNppAutonomyLevel(deserializeSave(JSON.stringify(raw)).nppAutonomyLevel)).toBe("v4");
  });

  it("rejects an unknown persisted tier on load", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "aut-legacy", playerName: "Ada" });
    const raw = JSON.parse(serializeSave(world, "2026-09-15T00:00:00.000Z")) as {
      world: Record<string, unknown>;
    };
    raw.world["nppAutonomyLevel"] = "v9";
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow(/autonomy/i);
  });
});
