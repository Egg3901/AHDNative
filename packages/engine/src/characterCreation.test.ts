import { describe, expect, it } from "vitest";
import { createWorld } from "./world.js";
import { serializeSave, deserializeSave } from "./save.js";
import { STAT_FREE_POINTS, STAT_KEYS } from "./stats/characterStats.js";
import type { CharacterStats } from "./stats/characterStats.js";

const base = { era: "1953", countryId: "US", playerName: "Alex", seed: "native-character-creation" } as const;

function allocation(): CharacterStats {
  // 28 total: six at 4 + one at 4 = 28 (7*4). A legal, perfectly even build.
  return Object.fromEntries(STAT_KEYS.map((key) => [key, 4])) as CharacterStats;
}

describe("character creation fields persist through createWorld and save/load (#242)", () => {
  it("stores demographics, compass axes, wealth and the full stat allocation on the player", () => {
    const world = createWorld({
      ...base,
      homeRegionId: "NY",
      policies: { economic: -2, social: 3 },
      demographics: { race: "black", gender: "female", education: "college", wealth: "middle" },
      stats: allocation(),
    });
    expect(world.player.demographics).toEqual({ race: "black", gender: "female", education: "college", wealth: "middle" });
    expect(world.player.policies).toEqual({ economic: -2, social: 3 });
    expect(world.player.stats).toEqual(allocation());
  });

  it("rejects an illegal stat allocation atomically", () => {
    expect(() => createWorld({ ...base, stats: { ...allocation(), charisma: 1 } } as never)).toThrow(/total exactly|Stat/);
  });

  it("rejects an out-of-range compass axis", () => {
    expect(() => createWorld({ ...base, policies: { economic: -6, social: 0 } } as never)).toThrow(/polic/i);
  });

  it("round-trips every creation field through serialize/deserialize", () => {
    const world = createWorld({
      ...base,
      homeRegionId: "NY",
      policies: { economic: 3, social: -2 },
      demographics: { race: "asian", gender: "nonbinary", education: "graduate", wealth: "high" },
      profileHeaderUrl: "data:image/png;base64,iVBORw0KGgo=",
      stats: allocation(),
    });
    const restored = deserializeSave(serializeSave(world, "2026-09-14T00:00:00.000Z"));
    expect(restored.player.demographics).toEqual(world.player.demographics);
    expect(restored.player.policies).toEqual({ economic: 3, social: -2 });
    expect(restored.player.stats).toEqual(allocation());
    expect(restored.player.avatarUrl).toBe(world.player.avatarUrl);
    expect(restored.player.profileHeaderUrl).toBe(world.player.profileHeaderUrl);
  });

  it("omits creation fields that were not supplied, keeping legacy saves valid", () => {
    const world = createWorld(base);
    expect(world.player.demographics).toBeUndefined();
    expect(world.player.policies).toBeUndefined();
    expect(STAT_FREE_POINTS).toBe(21);
  });

  it("grants the wealth-tier starting cash in the player's home currency", () => {
    const low = createWorld({ ...base, wealth: "low" });
    const high = createWorld({ ...base, wealth: "high" });
    // US anchor rate is 1.0; 1953 deflates 1M/5M by ~0.01433.
    expect(low.player.cash).toBe(Math.round(1_000_000 * (387 / 27_000)));
    expect(high.player.cash).toBe(Math.round(5_000_000 * (387 / 27_000)));
    expect(high.player.cash).toBeGreaterThan(low.player.cash);
  });

  it("binds the creation party directly without a joinParty charge", () => {
    const world = createWorld({ ...base, partyId: "US_DEM" });
    expect(world.player.partyId).toBe("US_DEM");
    expect(world.player.partyJoinedTurn).toBe(0);
  });

  it("rejects a creation party from another country", () => {
    expect(() => createWorld({ ...base, partyId: "UK_LAB" })).toThrow(/Unknown creation party/);
  });

  it("treats a null creation party as Independent", () => {
    const world = createWorld({ ...base, partyId: null });
    expect(world.player.partyId).toBe(null);
    expect(world.player.partyJoinedTurn).toBe(null);
  });
});
