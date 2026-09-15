import { describe, expect, it } from "vitest";
import { DEFAULT_SINGLEPLAYER_MODE } from "@ahdclient/engine";
import { GameSession } from "./session";

/**
 * Issue #346 (world-simulation mode). The selected play mode travels from
 * world setup through the session into the engine world, drives the
 * spectator consumers (no character actions, character acts refused, turns
 * still advance the shared engine), persists through save/reload, and
 * Career/HoS flow is unaffected.
 */
describe("creation worldsim spectator (#346)", () => {
  it("defaults to career and persists a worldsim spectator world through save/reload", () => {
    const session = new GameSession();
    const career = session.create({
      era: "1953",
      countryId: "US",
      seed: "creation-worldsim",
      playerName: "Ada",
    });
    expect(career.player.mode).toBe(DEFAULT_SINGLEPLAYER_MODE);
    expect(career.actions.length).toBeGreaterThan(0);

    const spectator = new GameSession();
    const view = spectator.create({
      era: "1953",
      countryId: "US",
      seed: "creation-worldsim",
      playerName: "Ada",
      mode: "worldsim",
    });
    expect(view.player.mode).toBe("worldsim");
    expect(view.player.hosPartyId).toBeNull();
    expect(view.actions).toEqual([]);

    const raw = JSON.parse(spectator.serialize("2026-09-15T00:00:00.000Z"));
    expect(raw.world.player.mode).toBe("worldsim");

    const loaded = new GameSession();
    loaded.load(JSON.stringify(raw));
    expect(loaded.view().player.mode).toBe("worldsim");
    expect(loaded.view().actions).toEqual([]);
  });

  it("rejects an unknown play mode without replacing the current world", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "creation-worldsim", playerName: "Ada" });
    expect(() =>
      session.create({
        era: "1953",
        countryId: "US",
        seed: "creation-worldsim",
        playerName: "Ada",
        mode: "observer" as never,
      }),
    ).toThrow(/mode/i);
    expect(session.view().player.name).toBe("Ada");
    expect(session.view().player.mode).toBe("career");
  });

  it("preserves the Career and Head of State bindings alongside worldsim", () => {
    const career = new GameSession();
    expect(
      career.create({ era: "1953", countryId: "US", seed: "creation-worldsim", playerName: "Ada", mode: "worldsim" }).player,
    ).toMatchObject({ mode: "worldsim", hosPartyId: null });

    const hos = new GameSession();
    const view = hos.create({
      era: "1953",
      countryId: "US",
      seed: "creation-worldsim",
      playerName: "Ada",
      mode: "hos",
      homeRegionId: "NY",
    });
    expect(view.player).toMatchObject({ mode: "hos", hosPartyId: "US_REP" });
    expect(view.actions.length).toBeGreaterThan(0);
  });

  it("refuses character acts in a spectator world without touching the simulation", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "creation-worldsim", playerName: "Ada", mode: "worldsim" });
    const result = session.act("campaign", { regionId: "NY" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected spectator refusal");
    expect(result.error).toMatch(/spectator|no player character/i);
    expect(session.view().turn).toBe(0);
  });

  it("advances a spectator world through the shared turn engine", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "creation-worldsim", playerName: "Ada", mode: "worldsim" });
    const view = session.advance();
    expect(view.turn).toBe(1);
    expect(view.player.mode).toBe("worldsim");
    expect(view.actions).toEqual([]);
  });
});
