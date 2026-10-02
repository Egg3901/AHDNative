import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { organizeUnionUndergroundAction } from "./organizingActions.js";

describe("underground organize action", () => {
  it("spends 10 AP, credits shadow strength, and records heat while the national ban is active", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "underground-drive-action", playerName: "Alex" });
    const union = world.unions["US-manufacturing"]!;
    world.budgets.US!.unionsBanned = true;
    union.suspended = true;
    world.player.actions = 20;

    const result = organizeUnionUndergroundAction(world, union.id, "mass");

    expect(result).toMatchObject({ undergroundStrength: 9, strengthGain: 9, actionsSpent: 10, status: "dark", heatText: "warm" });
    expect(world.player.actions).toBe(10);
    expect(union.strength).toBeUndefined();
    expect(union.undergroundStrength).toBe(9);
    expect(world.unionOrganizers?.[`${union.id}:player`]?.undergroundStrength).toBe(9);
    const saved = serializeSave(world, "2026-10-02T00:00:00Z");
    const reloaded = deserializeSave(saved);
    expect(reloaded.unions[union.id]?.undergroundStrength).toBe(9);
    expect(reloaded.unionOrganizers?.[`${union.id}:player`]?.undergroundStrength).toBe(9);
    const corrupt = JSON.parse(saved) as { world: { unions: Record<string, Record<string, unknown>> } };
    corrupt.world.unions[union.id]!.heat = 101;
    expect(() => deserializeSave(JSON.stringify(corrupt))).toThrow(/invalid underground union heat/i);
    advanceTurn(reloaded);
    expect(reloaded.meta.turn).toBe(world.meta.turn + 1);
    expect(reloaded.unions[union.id]?.heat).toBe(13);
    expect(reloaded.unions[union.id]?.undergroundProcessedTurn).toBe(reloaded.meta.turn);
    expect(() => organizeUnionUndergroundAction(world, union.id, "quiet")).toThrow(/already ran an underground drive/);
  });

  it("requires the authoritative budget ban and leaves action points untouched when refused", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "underground-drive-gate", playerName: "Alex" });
    world.player.actions = 20;
    expect(() => organizeUnionUndergroundAction(world, "US-manufacturing", "quiet")).toThrow(/only possible while unions are banned/);
    expect(world.player.actions).toBe(20);
  });
});
