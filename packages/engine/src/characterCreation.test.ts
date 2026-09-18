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

  it("rejects a corrupt avatarUrl in the save loader, not just the header", () => {
    // Creation now rejects remote URLs fail-fast (see below), so the loader
    // case tampers a valid save after serialization instead.
    const world = createWorld({ ...base });
    const save = JSON.parse(serializeSave(world, "2026-09-14T00:00:00.000Z")) as { world: { player: Record<string, unknown> } };
    save.world.player["avatarUrl"] = "https://example.com/face.png";
    expect(() => deserializeSave(JSON.stringify(save))).toThrow(/avatar/i);
  });

  it("rejects a non-raster avatarUrl at creation instead of writing an unloadable save", () => {
    // A stale or tampered draft carries a remote URL, not a local raster.
    // createWorld must fail fast here: previously it stored the URL and the
    // resulting save could never reload ("Not a valid save file").
    expect(() => createWorld({ ...base, avatarUrl: "https://example.com/face.png" })).toThrow(/avatar/i);
  });

  it("rejects a corrupt profileHeaderUrl at creation", () => {
    expect(() => createWorld({ ...base, profileHeaderUrl: "data:text/plain;base64,aGVsbG8=" })).toThrow(/profile header/i);
  });

  it("rejects an oversized portrait at creation (reference 2 MB cap)", () => {
    const oversized = `data:image/png;base64,${"A".repeat(2_800_000)}`;
    expect(() => createWorld({ ...base, avatarUrl: oversized })).toThrow(/avatar/i);
  });

  it("accepts reference-capped images at creation and round-trips them through save/load", () => {
    const avatar = "data:image/png;base64,iVBORw0KGgo=";
    const header = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const world = createWorld({ ...base, avatarUrl: avatar, profileHeaderUrl: header });
    const restored = deserializeSave(serializeSave(world, "2026-09-14T00:00:00.000Z"));
    expect(restored.player.avatarUrl).toBe(avatar);
    expect(restored.player.profileHeaderUrl).toBe(header);
  });

  it("accepts a valid raster avatarUrl through the save loader", () => {
    const avatar = "data:image/png;base64,iVBORw0KGgo=";
    const world = createWorld({ ...base, avatarUrl: avatar });
    const restored = deserializeSave(serializeSave(world, "2026-09-14T00:00:00.000Z"));
    expect(restored.player.avatarUrl).toBe(avatar);
  });

  it("does not mutate the caller's demographics object when a wealth tier is folded in", () => {
    const demographics = { race: "white", gender: "male", education: "college", wealth: "low" } as const;
    const caller = { ...demographics } as Record<string, unknown>;
    const world = createWorld({ ...base, demographics: caller as never, wealth: "high" });
    // The caller's object is untouched; the world records the supplied tier.
    expect(caller["wealth"]).toBe("low");
    expect(world.player.demographics).toEqual({ race: "white", gender: "male", education: "college", wealth: "high" });
  });
});
