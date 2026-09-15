import { describe, expect, it } from "vitest";
import { createWorld } from "./world.js";
import { advanceTurn } from "./engine.js";
import { deserializeSave, serializeSave } from "./save.js";
import {
  DEFAULT_SINGLEPLAYER_MODE,
  SINGLEPLAYER_MODES,
  isWorldsimMode,
  resolveSingleplayerMode,
} from "./singleplayerMode.js";

/**
 * Issue #346 (world-simulation mode, stacked on the #334 difficulty axis).
 * Canonical source: AHDGame `src/lib/db/types/gameState.ts`
 * (SingleplayerMode normal/head-of-state/worldsim),
 * `src/app/api/singleplayer/new-game/route.ts` (mode default normal,
 * permanentHeadOfState only for head-of-state) and
 * `src/lib/singleplayerServer.ts` (playerless spectator world,
 * spectatorPath /singleplayer/worldsim). Native projects the axis onto the
 * existing player.mode binding (career = normal default, hos =
 * head-of-state); worldsim marks a spectator world whose turns run the
 * identical engine while the action layer offers no character actions.
 */
describe("singleplayer worldsim contract (#346)", () => {
  it("ships the career/hos/worldsim values with career as the default", () => {
    expect([...SINGLEPLAYER_MODES]).toEqual(["career", "hos", "worldsim"]);
    expect(DEFAULT_SINGLEPLAYER_MODE).toBe("career");
    expect(resolveSingleplayerMode(undefined)).toBe("career");
    expect(isWorldsimMode("worldsim")).toBe(true);
    expect(isWorldsimMode("career")).toBe(false);
    expect(isWorldsimMode("hos")).toBe(false);
  });

  it("rejects unknown play modes", () => {
    expect(() => resolveSingleplayerMode("observer")).toThrow(/mode/i);
  });

  it("binds a worldsim world as a spectator: no ruling party, office, or executive seat", () => {
    const world = createWorld({
      era: "1953",
      countryId: "US",
      seed: "worldsim-spectator",
      playerName: "Ada",
      mode: "worldsim",
    });
    expect(world.player.mode).toBe("worldsim");
    expect(world.player.hosPartyId).toBeNull();
    expect(world.player.permanentHeadOfState).toBeUndefined();
    expect(world.player.currentOffice).toBeUndefined();
    expect(world.executives["US"]).toBeUndefined();
  });

  it("rejects an unknown mode at world creation", () => {
    expect(() =>
      createWorld({ era: "1953", countryId: "US", seed: "worldsim-bad", playerName: "Ada", mode: "observer" as never }),
    ).toThrow(/mode/i);
  });

  it("advances a worldsim world through the identical turn engine, deterministically", () => {
    const opts = { era: "1953", countryId: "US", seed: "worldsim-turns", playerName: "Ada", mode: "worldsim" as const };
    const first = createWorld(opts);
    const second = createWorld(opts);
    advanceTurn(first);
    advanceTurn(second);
    expect(first.meta.turn).toBe(1);
    expect(serializeSave(first, "2026-09-15T00:00:00.000Z")).toBe(
      serializeSave(second, "2026-09-15T00:00:00.000Z"),
    );
  });

  it("round-trips the worldsim mode through save and reload", () => {
    const world = createWorld({
      era: "1953",
      countryId: "US",
      seed: "worldsim-save",
      playerName: "Ada",
      mode: "worldsim",
    });
    const loaded = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    expect(loaded.player.mode).toBe("worldsim");
    expect(loaded.player.hosPartyId).toBeNull();
  });

  it("rejects a save whose player mode is corrupt", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "worldsim-corrupt", playerName: "Ada" });
    const raw = JSON.parse(serializeSave(world, "2026-09-15T00:00:00.000Z")) as {
      world: { player: { mode: unknown } };
    };
    raw.world.player.mode = "observer";
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow(/play mode/);
  });
});
