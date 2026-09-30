import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

// AHDGame 6ed11a3: allocate-stats/reallocate-stats routes and their validator.
// Public saved-session seam. Fixture XP represents growth recorded by a save;
// this test does not claim that Native ports every source XP producer (#91).
const BALANCED = { charisma: 4, debate: 4, energy: 4, fundraising: 4, businessAcumen: 4, statecraft: 4, intellect: 4 };
const REALLOCATED = { charisma: 7, debate: 3, energy: 5, fundraising: 4, businessAcumen: 2, statecraft: 3, intellect: 4 };
const OPTIONS = { era: "1953", countryId: "US", seed: "stat-allocation-48", playerName: "Alex", creation: {
  partyId: null, policies: { economic: 0, social: 0 },
  demographics: { race: "white", gender: "female", education: "college", wealth: "middle" } as const,
  stats: BALANCED,
} };
const STAMP = "2026-09-30T00:00:00.000Z";
const savedWorld = (session: GameSession) => JSON.parse(session.serialize(STAMP)).world;

describe("stat allocation lifecycle through the public saved session", () => {
  it("hides saved stats and refuses both allocation commands while the RPG ruleset is disabled", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    session.updateWorldFeatureFlags({ rpgStats: false });
    expect(session.profile().stats).toBeNull();
    const before = session.serialize(STAMP);
    expect(() => session.reallocateStats(REALLOCATED)).toThrow("stat system is not currently enabled");
    expect(() => session.allocateStats(BALANCED)).toThrow("stat system is not currently enabled");
    expect(session.serialize(STAMP)).toBe(before);
    const reloaded = new GameSession();
    reloaded.load(before);
    expect(reloaded.profile().stats).toBeNull();
    reloaded.updateWorldFeatureFlags({ rpgStats: true });
    expect(reloaded.profile().stats).toEqual(BALANCED);
    reloaded.reallocateStats(REALLOCATED);
    expect(reloaded.profile().stats).toEqual(REALLOCATED);
  });

  it("allocates a legacy character once and refuses reset before allocation or invalid point spreads without spending", () => {
    const session = new GameSession();
    session.create({ ...OPTIONS, creation: undefined });
    const before = session.serialize(STAMP);
    expect(() => session.reallocateStats(BALANCED)).toThrow("Allocate your stats before reallocating");
    expect(session.serialize(STAMP)).toBe(before);
    expect(() => session.allocateStats({ ...BALANCED, charisma: 3 })).toThrow("total exactly 28");
    expect(session.serialize(STAMP)).toBe(before);
    session.allocateStats(BALANCED);
    const allocated = session.serialize(STAMP);
    expect(savedWorld(session).player).toMatchObject({ stats: BALANCED, statsAllocated: true, statXp: {} });
    expect(() => session.allocateStats(REALLOCATED)).toThrow("Stats already allocated");
    expect(session.serialize(STAMP)).toBe(allocated);
    const reloaded = new GameSession();
    reloaded.load(allocated);
    expect(() => reloaded.allocateStats(BALANCED)).toThrow("Stats already allocated");
    reloaded.reallocateStats(REALLOCATED);
    expect(savedWorld(reloaded).player.statsReallocationUsed).toBe(true);
  });

  it("spends one free reallocation, resets recorded growth, and keeps money and AP intact across reload and a turn", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    const saved = JSON.parse(session.serialize(STAMP));
    saved.world.player.statXp = { charisma: 0.3, energy: 0.2 };
    saved.world.player.debateDecayAnchor = "1952-12-01";
    session.load(JSON.stringify(saved));
    const before = savedWorld(session);

    session.reallocateStats(REALLOCATED);
    const after = savedWorld(session);
    expect(after.player).toMatchObject({
      stats: REALLOCATED, statsAllocated: true, statsReallocationUsed: true,
      statXp: {}, debateDecayAnchor: before.meta.date,
      actions: before.player.actions, cash: before.player.cash, funds: before.player.funds,
    });
    const reloaded = new GameSession();
    reloaded.load(session.serialize(STAMP));
    expect(reloaded.serialize(STAMP)).toBe(session.serialize(STAMP));
    reloaded.advance();
    const advanced = reloaded.serialize(STAMP);
    expect(() => reloaded.reallocateStats(BALANCED)).toThrow("already used your free stat reallocation");
    expect(reloaded.serialize(STAMP)).toBe(advanced);
    expect(savedWorld(reloaded).player.stats).toEqual(REALLOCATED);
  });
});
