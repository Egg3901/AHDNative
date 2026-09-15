import { describe, expect, it } from "vitest";
import {
  DEFAULT_SINGLEPLAYER_DIFFICULTY,
  SINGLEPLAYER_DIFFICULTIES,
  resolveSingleplayerDifficulty,
  singleplayerNppTuning,
} from "./singleplayerDifficulty.js";
import { createWorld } from "./world.js";
import { advanceTurn } from "./engine.js";
import { deserializeSave, serializeSave } from "./save.js";

/**
 * Issue #334 (partial: difficulty axis). Canonical source: AHDGame at the
 * 1902 contract — src/app/api/singleplayer/new-game/route.ts (accepted
 * values easy/normal/hard, default normal), src/lib/db/types/gameState.ts
 * (SingleplayerDifficulty), src/lib/singleplayerDifficulty/rules/index.ts
 * (tuning table), src/lib/turn/nppFundGeneration.ts (named consumer).
 */
describe("singleplayer difficulty contract (#334)", () => {
  it("ships the canonical accepted values with normal as default", () => {
    expect([...SINGLEPLAYER_DIFFICULTIES]).toEqual(["easy", "normal", "hard"]);
    expect(DEFAULT_SINGLEPLAYER_DIFFICULTY).toBe("normal");
    expect(resolveSingleplayerDifficulty(undefined)).toBe("normal");
  });

  it("rejects unknown difficulty values", () => {
    expect(() => resolveSingleplayerDifficulty("nightmare")).toThrow(/difficulty/i);
  });

  it("ports the canonical NPP resource tuning table exactly", () => {
    // Source: AHDGame src/lib/singleplayerDifficulty/rules/index.ts.
    expect(singleplayerNppTuning("normal")).toEqual({
      actionPointsPerTurn: 2,
      actionPointCap: 100,
      fundMultiplier: 1,
    });
    expect(singleplayerNppTuning("easy")).toEqual({
      actionPointsPerTurn: 1,
      actionPointCap: 50,
      fundMultiplier: 0.75,
    });
    expect(singleplayerNppTuning("hard")).toEqual({
      actionPointsPerTurn: 3,
      actionPointCap: 150,
      fundMultiplier: 1.25,
    });
    expect(singleplayerNppTuning(undefined)).toEqual(singleplayerNppTuning("normal"));
  });

  it("persists the selected difficulty on the world, defaulting to normal", () => {
    const def = createWorld({ era: "1953", countryId: "US", seed: "diff-default", playerName: "Ada" });
    expect(def.difficulty).toBe("normal");
    const hard = createWorld({ era: "1953", countryId: "US", seed: "diff-hard", playerName: "Ada", difficulty: "hard" });
    expect(hard.difficulty).toBe("hard");
  });

  it("rejects an unknown difficulty at world creation", () => {
    expect(() =>
      createWorld({ era: "1953", countryId: "US", seed: "diff-bad", playerName: "Ada", difficulty: "nightmare" as never }),
    ).toThrow(/difficulty/i);
  });

  it("scales NPC fund generation by difficulty while the player path stays untouched", () => {
    const seed = "diff-funds";
    const normal = createWorld({ era: "1953", countryId: "US", seed, playerName: "Ada", difficulty: "normal" });
    const easy = createWorld({ era: "1953", countryId: "US", seed, playerName: "Ada", difficulty: "easy" });
    const hard = createWorld({ era: "1953", countryId: "US", seed, playerName: "Ada", difficulty: "hard" });
    for (const world of [normal, easy, hard]) advanceTurn(world);
    const sumNpc = (world: typeof normal) =>
      world.politicians.reduce((total, pol) => total + (pol.funds ?? 0), 0);
    expect(sumNpc(easy)).toBeLessThan(sumNpc(normal));
    expect(sumNpc(hard)).toBeGreaterThan(sumNpc(normal));
    expect(hard.player.funds).toBe(normal.player.funds);
  });

  it("round-trips difficulty through save and reload", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "diff-save", playerName: "Ada", difficulty: "hard" });
    const loaded = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    expect(loaded.difficulty).toBe("hard");
  });

  it("backfills normal difficulty on pre-contract saves", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "diff-legacy", playerName: "Ada" });
    const raw = JSON.parse(serializeSave(world, "2026-09-15T00:00:00.000Z")) as {
      schemaVersion: number;
      world: Record<string, unknown>;
    };
    delete raw.world.difficulty;
    raw.schemaVersion = 46;
    (raw.world as { meta: { schemaVersion: number } }).meta.schemaVersion = 46;
    expect(deserializeSave(JSON.stringify(raw)).difficulty).toBe("normal");
  });
});
