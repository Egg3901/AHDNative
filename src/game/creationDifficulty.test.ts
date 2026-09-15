import { describe, expect, it } from "vitest";
import { DEFAULT_SINGLEPLAYER_DIFFICULTY } from "@ahdclient/engine";
import { GameSession } from "./session";

/**
 * Issue #334 (partial: difficulty axis). The selected difficulty travels
 * from world setup through the session into the engine world, persists
 * through save/reload, and Career/HoS flow is unaffected.
 */
describe("creation difficulty (#334)", () => {
  it("defaults to normal and round-trips the selected axis through save/reload", () => {
    const session = new GameSession();
    const view = session.create({
      era: "1953",
      countryId: "US",
      seed: "creation-difficulty",
      playerName: "Ada",
    });
    expect(view.difficulty).toBe(DEFAULT_SINGLEPLAYER_DIFFICULTY);
    expect(JSON.parse(session.serialize("2026-09-15T00:00:00.000Z")).world.difficulty).toBeUndefined();

    const hard = new GameSession();
    expect(
      hard.create({ era: "1953", countryId: "US", seed: "creation-difficulty", playerName: "Ada", difficulty: "hard" }).difficulty,
    ).toBe("hard");
    const raw = JSON.parse(hard.serialize("2026-09-15T00:00:00.000Z"));
    expect(raw.world.difficulty).toBe("hard");

    const loaded = new GameSession();
    loaded.load(JSON.stringify(raw));
    expect(loaded.view().difficulty).toBe("hard");
    expect(JSON.parse(loaded.serialize("2026-09-15T00:00:00.000Z")).world.difficulty).toBe("hard");
  });

  it("rejects an unknown difficulty without replacing the current world", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "creation-difficulty", playerName: "Ada" });
    expect(() =>
      session.create({
        era: "1953",
        countryId: "US",
        seed: "creation-difficulty",
        playerName: "Ada",
        difficulty: "nightmare" as never,
      }),
    ).toThrow(/difficulty/i);
    expect(session.view().player.name).toBe("Ada");
    expect(session.view().difficulty).toBe("normal");
  });

  it("preserves the Career and Head of State bindings alongside difficulty", () => {
    const career = new GameSession();
    expect(
      career.create({ era: "1953", countryId: "US", seed: "creation-difficulty", playerName: "Ada", difficulty: "easy" }).player,
    ).toMatchObject({ mode: "career", hosPartyId: null });

    const hos = new GameSession();
    const view = hos.create({
      era: "1953",
      countryId: "US",
      seed: "creation-difficulty",
      playerName: "Ada",
      mode: "hos",
      homeRegionId: "NY",
      difficulty: "hard",
    });
    expect(view.player).toMatchObject({ mode: "hos", hosPartyId: "US_REP" });
    expect(view.difficulty).toBe("hard");
  });
});
