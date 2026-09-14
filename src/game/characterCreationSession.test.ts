import { describe, expect, it } from "vitest";
import { GameSession } from "./session";
import { STAT_KEYS, type CharacterStats } from "@ahdclient/engine";
import type { CharacterCreation } from "./types";

const setup = { era: "1953", countryId: "US", seed: "native-session-creation", playerName: "Alex" } as const;
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
