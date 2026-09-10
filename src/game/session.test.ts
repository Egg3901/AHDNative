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
