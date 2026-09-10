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
