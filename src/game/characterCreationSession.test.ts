import { describe, expect, it } from "vitest";
import { GameSession } from "./session";
import { STAT_KEYS, type CharacterStats } from "@ahdclient/engine";
import type { CharacterCreation } from "./types";

const setup = { era: "1953", countryId: "US", seed: "native-session-creation", playerName: "Alex", homeRegionId: "NY" } as const;
const stamp = "2026-09-14T00:00:00.000Z";

function evenStats(): CharacterStats {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, 4])) as CharacterStats;
}

const creation: CharacterCreation = {
  partyId: null,
  policies: { economic: -2, social: 3 },
  demographics: { race: "white", gender: "male", education: "college", wealth: "middle" },
  stats: evenStats(),
};

describe("character-creation session contract (#242)", () => {
  it("accepts the creation file and exposes the captured fields on the game view", () => {
    const session = new GameSession();
    const view = session.create({ ...setup, homeRegionId: "NY", creation });
    expect(view.player).toMatchObject({ homeRegionId: "NY", mode: "career" });
    // The profile projection is the display boundary for creation identity.
    const profile = session.profile();
    expect(profile.policies).toEqual({ economic: -2, social: 3 });
    expect(profile.demographics).toEqual(creation.demographics);
    expect(profile.stats && STAT_KEYS.every((key) => profile.stats![key] != null)).toBe(true);
  });

  it("uses the creation-screen name and home region when they differ from world setup", () => {
    const session = new GameSession();
    const view = session.create({
      ...setup,
      homeRegionId: "NY",
      creation: { ...creation, name: "Eleanor Vance", homeRegionId: "CA" },
    });
    expect(view.player.name).toBe("Eleanor Vance");
    expect(view.player.homeRegionId).toBe("CA");
    expect(session.profile().name).toBe("Eleanor Vance");
    expect(session.profile().homeRegion?.id).toBe("CA");
  });

  it("persists the changed name and home region through save, close and relaunch", () => {
    const session = new GameSession();
    session.create({
      ...setup,
      homeRegionId: "NY",
      creation: { ...creation, name: "Eleanor Vance", homeRegionId: "CA" },
    });
    const loaded = new GameSession();
    loaded.load(session.serialize(stamp));
    const profile = loaded.profile();
    expect(profile.name).toBe("Eleanor Vance");
    expect(profile.homeRegion?.id).toBe("CA");
    // The profile is the same display boundary after reload.
    expect(profile.demographics).toEqual(creation.demographics);
  });

  it("falls back to the world-setup name and home region when creation omits them", () => {
    const session = new GameSession();
    const view = session.create({ ...setup, homeRegionId: "NY", creation });
    expect(view.player.name).toBe("Alex");
    expect(view.player.homeRegionId).toBe("NY");
  });

  it("rejects a blank creation-screen name atomically", () => {
    const session = new GameSession();
    expect(() => session.create({ ...setup, creation: { ...creation, name: "   " } })).toThrow(/name/i);
  });

  it("persists every creation field through save, close and relaunch", () => {
    const session = new GameSession();
    session.create({ ...setup, homeRegionId: "NY", creation });
    const loaded = new GameSession();
    loaded.load(session.serialize(stamp));
    const profile = loaded.profile();
    expect(profile.policies).toEqual({ economic: -2, social: 3 });
    expect(profile.demographics).toEqual(creation.demographics);
    expect(profile.homeRegion?.id).toBe("NY");
    expect(profile.stats && STAT_KEYS.every((key) => profile.stats![key] === 4)).toBe(true);
  });

  it("keeps legacy saves (no creation fields) valid and reports them as not recorded", () => {
    const session = new GameSession();
    session.create(setup);
    const loaded = new GameSession();
    loaded.load(session.serialize(stamp));
    const profile = loaded.profile();
    expect(profile.policies).toBeNull();
    expect(profile.demographics).toBeNull();
    expect(profile.stats).toBeNull();
  });

  it("keeps the electorate-row inputs (home region + compass) through save/relaunch", () => {
    const session = new GameSession();
    session.create({
      ...setup,
      homeRegionId: "NY",
      creation: { ...creation, homeRegionId: "CA", policies: { economic: 1, social: -1 } },
    });
    const loaded = new GameSession();
    loaded.load(session.serialize(stamp));
    // The compass electorate row derives from these persisted fields, so the
    // row re-renders identically after relaunch without persisting the lean.
    expect(loaded.profile().homeRegion?.id).toBe("CA");
    expect(loaded.profile().policies).toEqual({ economic: 1, social: -1 });
  });

  it("carries the optional portrait and header through save/relaunch", () => {
    const session = new GameSession();
    session.create({
      ...setup,
      homeRegionId: "NY",
      creation: {
        ...creation,
        // Minimal PNG data URLs: the loader only requires a valid raster envelope.
        avatarUrl: "data:image/png;base64,iVBORw0KGgo=",
        profileHeaderUrl: "data:image/png;base64,iVBORw0KGgo=",
      },
    });
    const loaded = new GameSession();
    loaded.load(session.serialize(stamp));
    const profile = loaded.profile();
    expect(profile.avatarUrl).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(profile.profileHeaderUrl).toBe("data:image/png;base64,iVBORw0KGgo=");
  });
});
