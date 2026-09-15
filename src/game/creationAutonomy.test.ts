import { describe, expect, it } from "vitest";
import { DEFAULT_NPP_AUTONOMY_LEVEL } from "@ahdclient/engine";
import { GameSession } from "./session";

/**
 * Issue #345 (autonomy tier axis). The selected tier travels from world
 * setup through the session into the engine world, persists through
 * save/reload, and Career/HoS flow is unaffected.
 */
describe("creation autonomy tier (#345)", () => {
  it("defaults to v4 and round-trips the selected axis through save/reload", () => {
    const session = new GameSession();
    const view = session.create({
      era: "1953",
      countryId: "US",
      seed: "creation-autonomy",
      playerName: "Ada",
    });
    expect(view.autonomyLevel).toBe(DEFAULT_NPP_AUTONOMY_LEVEL);
    expect(view.autonomyLevel).toBe("v4");
    expect(JSON.parse(session.serialize("2026-09-15T00:00:00.000Z")).world.nppAutonomyLevel).toBeUndefined();

    const off = new GameSession();
    expect(
      off.create({ era: "1953", countryId: "US", seed: "creation-autonomy", playerName: "Ada", autonomyLevel: "off" }).autonomyLevel,
    ).toBe("off");
    const raw = JSON.parse(off.serialize("2026-09-15T00:00:00.000Z"));
    expect(raw.world.nppAutonomyLevel).toBe("off");

    const loaded = new GameSession();
    loaded.load(JSON.stringify(raw));
    expect(loaded.view().autonomyLevel).toBe("off");
    expect(JSON.parse(loaded.serialize("2026-09-15T00:00:00.000Z")).world.nppAutonomyLevel).toBe("off");
  });

  it("rejects an unknown tier without replacing the current world", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "creation-autonomy", playerName: "Ada" });
    expect(() =>
      session.create({
        era: "1953",
        countryId: "US",
        seed: "creation-autonomy",
        playerName: "Ada",
        autonomyLevel: "v9" as never,
      }),
    ).toThrow(/autonomy/i);
    expect(session.view().player.name).toBe("Ada");
    expect(session.view().autonomyLevel).toBe("v4");
  });

  it("preserves the Career and Head of State bindings alongside the tier", () => {
    const career = new GameSession();
    expect(
      career.create({ era: "1953", countryId: "US", seed: "creation-autonomy", playerName: "Ada", autonomyLevel: "v1" }).player,
    ).toMatchObject({ mode: "career", hosPartyId: null });

    const hos = new GameSession();
    const view = hos.create({
      era: "1953",
      countryId: "US",
      seed: "creation-autonomy",
      playerName: "Ada",
      mode: "hos",
      homeRegionId: "NY",
      autonomyLevel: "v2",
    });
    expect(view.player).toMatchObject({ mode: "hos", hosPartyId: "US_REP" });
    expect(view.autonomyLevel).toBe("v2");
  });

  it("carries difficulty and autonomy as independent axes", () => {
    const session = new GameSession();
    const view = session.create({
      era: "1953",
      countryId: "US",
      seed: "creation-autonomy",
      playerName: "Ada",
      difficulty: "hard",
      autonomyLevel: "off",
    });
    expect(view.difficulty).toBe("hard");
    expect(view.autonomyLevel).toBe("off");
  });
});
