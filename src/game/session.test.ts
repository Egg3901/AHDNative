import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const options = { era: "1953", countryId: "US", seed: "native-session-v1", playerName: "Alex" };

describe("singleplayer session", () => {
  it("creates a real playable country and exposes the player's starting world", () => {
    const session = new GameSession();
    const view = session.create(options);
    expect(view).toMatchObject({ turn: 0, era: "1953", countryId: "US", player: { name: "Alex" } });
    expect(view.parties.some((party) => party.id === "US_DEM")).toBe(true);
    expect(view.metrics.find((metric) => metric.id === "gdp")?.value).toBeGreaterThan(0);
  });
  it("continues the same seeded world after actions, a turn and save/reload", () => {
    const session = new GameSession();
    session.create(options);
    const before = session.view().player;
    expect(session.act("convertCash", { amount: 2000 }).ok).toBe(true);
    expect(session.view().player.cash).toBe(before.cash - 2000);
    session.advance();
    expect(session.view().turn).toBe(1);
    const loaded = new GameSession();
    loaded.load(session.serialize("2026-09-10T00:00:00.000Z"));
    loaded.advance();
    session.advance();
    expect(loaded.serialize("2026-09-10T00:00:00.000Z")).toBe(session.serialize("2026-09-10T00:00:00.000Z"));
  });
  it("rejects invalid new-game input without replacing the current world", () => {
    const session = new GameSession();
    session.create(options);
    expect(() => session.create({ ...options, playerName: "   " })).toThrow();
    expect(session.view().player.name).toBe("Alex");
  });
  it("keeps the current world when an imported save cannot produce a playable view", () => {
    const session = new GameSession(); session.create(options);
    const before = session.serialize("2026-09-10T00:00:00.000Z");
    const corrupt = JSON.parse(before); delete corrupt.world.countries.US;
    expect(() => session.load(JSON.stringify(corrupt))).toThrow();
    expect(session.serialize("2026-09-10T00:00:00.000Z")).toBe(before);
  });
});


describe("actions hub projection", () => {
  it("groups every hub action under Influence, Fundraising or Intelligence with engine-backed costs", () => {
    const session = new GameSession(); session.create(options);
    const actions = session.view().actions;
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(["influence", "fundraising", "intelligence"]).toContain(action.category);
      expect(action.cost).toBeGreaterThanOrEqual(0);
      expect(action.fundCost).toBeGreaterThanOrEqual(0);
      expect(action.cooldownTurns).toBeGreaterThanOrEqual(0);
      if (!action.available) expect(action.disabledReason).toBeTruthy();
    }
    expect(new Set(actions.map((a) => a.category))).toEqual(new Set(["influence", "fundraising", "intelligence"]));
    expect(actions.find((a) => a.id === "fundraise")).toMatchObject({ available: false, disabledReason: "No donor base. Use Build Donor Network first." });
  });
  it("marks unported intelligence actions unavailable with the blocking system named", () => {
    const session = new GameSession(); session.create(options);
    const poll = session.view().actions.find((a) => a.id === "poll");
    expect(poll).toMatchObject({ category: "intelligence", available: false });
    expect(poll?.disabledReason).toContain("polling/election polling");
  });
});

describe("player candidacy through the session contract", () => {
  it("exposes filing choices and preserves candidacy through reload and withdrawal", () => {
    const session = new GameSession();
    session.create(options);
    session.advance();
    expect(session.view().elections.length).toBeGreaterThan(40);
    expect(session.view().elections[0].candidacy).toMatchObject({ available: false, disabledReason: "Join a party before filing." });
    expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);
    const race = session.view().elections.find((e) => e.candidacy.available)!;
    expect(race).toBeDefined();
    expect(session.act("declareCandidacy", { electionId: race.id }).ok).toBe(true);
    expect(session.view().elections[0]).toMatchObject({ id: race.id, playerCandidate: true, candidacy: { id: "withdrawCandidacy", available: true } });
    const another = session.view().elections.find((e) => e.id !== race.id)!;
    expect(another.candidacy.available).toBe(false);
    const before = session.serialize("2026-09-10T00:00:00.000Z");
    expect(session.act("declareCandidacy", { electionId: another.id }).ok).toBe(false);
    expect(session.serialize("2026-09-10T00:00:00.000Z")).toBe(before);
    const loaded = new GameSession();
    loaded.load(before);
    expect(loaded.view().elections.find((e) => e.id === race.id)?.candidateNames).toContain("Alex");
    expect(loaded.act("withdrawCandidacy", { electionId: race.id }).ok).toBe(true);
    expect(loaded.view().elections.find((e) => e.id === race.id)).toMatchObject({ playerCandidate: false, candidacy: { id: "declareCandidacy", available: true } });
  });
  it("reflects engine withdrawal when the player leaves their party", () => {
    const session = new GameSession(); session.create(options); session.advance();
    session.act("joinParty", { partyId: "US_DEM" });
    const race = session.view().elections.find((e) => e.candidacy.available)!;
    session.act("declareCandidacy", { electionId: race.id });
    expect(session.act("leaveParty").ok).toBe(true);
    expect(session.view().elections.find((e) => e.id === race.id)).toMatchObject({ playerCandidate: false, candidacy: { available: false } });
  });
});

describe("debatePrep character action (#37)", () => {
  // Native has no stat-allocation step yet (#48/#91), so tests allocate the
  // Debate stat through the save boundary: create, inject stats, reload.
  function createAllocatedSession(seed: string): GameSession {
    const fresh = new GameSession();
    fresh.create({ ...options, seed });
    const stamp = "2026-09-10T00:00:00.000Z";
    const raw = JSON.parse(fresh.serialize(stamp)) as { world: { player: { stats?: { debate?: number } } } };
    raw.world.player.stats = { debate: 1 };
    const session = new GameSession();
    session.load(JSON.stringify(raw));
    return session;
  }
  it("exposes debate prep in the Intelligence hub with engine-backed cost", () => {
    const session = new GameSession(); session.create(options);
    const action = session.view().actions.find((a) => a.id === "debatePrep");
    expect(action).toMatchObject({ category: "intelligence", cost: 1, fundCost: 0, available: true });
    expect(action?.name).toContain("Debate");
  });
  it("refuses debate prep until stats are allocated", () => {
    const session = new GameSession(); session.create(options);
    const response = session.act("debatePrep");
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error).toMatch(/allocate your stats/i);
  });
  it("runs create -> debate prep -> save/reload through the session boundary", () => {
    const session = createAllocatedSession("debate-seed-2");
    const response = session.act("debatePrep");
    expect(response.ok).toBe(true);
    const stamp = "2026-09-10T00:00:00.000Z";
    const saved = (JSON.parse(session.serialize(stamp)) as { world: { player: { stats?: { debate?: number } } } })
      .world.player.stats?.debate;
    expect(saved).toBe(2);
    const loaded = new GameSession();
    loaded.load(session.serialize(stamp));
    expect((JSON.parse(loaded.serialize(stamp)) as { world: { player: { stats?: { debate?: number } } } })
      .world.player.stats?.debate).toBe(2);
    // The reloaded world continues the same deterministic RNG stream.
    expect(loaded.act("debatePrep").ok).toBe(true);
  });
  it("surfaces the engine AP refusal instead of executing", () => {
    const session = createAllocatedSession(options.seed);
    for (let i = 0; i < 30; i += 1) session.act("debatePrep");
    const exhausted = session.act("debatePrep");
    expect(exhausted.ok).toBe(false);
    if (!exhausted.ok) expect(exhausted.error).toMatch(/action points/i);
  });
});
