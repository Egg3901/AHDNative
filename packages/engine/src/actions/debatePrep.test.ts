import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { ACTION_CATALOG } from "./catalog.js";
import { executeAction } from "./execute.js";
import { STAT_MAX } from "../stats/debatePrep.js";

const OPTS = { seed: "debate-prep-seed", playerName: "Tester", countryId: "US", era: "1953" } as const;

function debateOf(seed: string): { world: ReturnType<typeof createWorld>; result: ReturnType<typeof executeAction> } {
  const world = createWorld({ ...OPTS, seed });
  world.player.stats = { debate: 4 };
  const result = executeAction(world, "player", "debatePrep");
  return { world, result };
}

describe("debatePrep catalog", () => {
  it("is available at the authoritative cost with no fund cost or cooldown", () => {
    const entry = ACTION_CATALOG.debatePrep;
    expect(entry).toBeDefined();
    expect(entry.baseCost).toBe(1);
    expect(entry.cooldown).toBe(0);
    expect(entry.fundCost).toBe(0);
    expect(entry.status).toBe("available");
  });
});

describe("debatePrep execution", () => {
  it("costs 1 AP and raises debate by 1 on a successful roll (pinned seed)", () => {
    const world = createWorld({ ...OPTS, seed: "debate-seed-2" });
    world.player.stats = { debate: 4 };
    const before = world.player.actions;
    const result = executeAction(world, "player", "debatePrep");
    expect(result).toEqual({
      ok: true,
      message: "Breakthrough in the briefing room: your Debate skill improved (+1).",
    });
    expect(world.player.actions).toBe(before - 1);
    expect(world.player.stats?.debate).toBe(5);
  });

  it("costs 1 AP and leaves debate unchanged on a failed roll (pinned seed)", () => {
    const world = createWorld({ ...OPTS, seed: "debate-seed-0" });
    world.player.stats = { debate: 4 };
    const before = world.player.actions;
    const result = executeAction(world, "player", "debatePrep");
    expect(result).toEqual({
      ok: true,
      message: "You studied hard, but no breakthrough this time.",
    });
    expect(world.player.actions).toBe(before - 1);
    expect(world.player.stats?.debate).toBe(4);
  });

  it("rejects a missing Debate stat with no AP charge, no accounting change, and no RNG draw", () => {
    const world = createWorld({ ...OPTS, seed: "debate-seed-2" });
    const raw = JSON.parse(serializeSave(world, "2026-09-10T00:00:00.000Z")) as { world: { player: { stats?: unknown } } };
    delete raw.world.player.stats;
    const legacy = deserializeSave(JSON.stringify(raw));
    expect(legacy.player.stats?.debate).toBeUndefined();
    const variants: Array<{ energy?: number; debate?: number } | undefined> = [undefined, { energy: 5 }];
    for (const stats of variants) {
      if (stats === undefined) delete legacy.player.stats;
      else legacy.player.stats = stats;
      const actions = legacy.player.actions;
      const funds = legacy.player.funds;
      const counts = { ...(legacy.player.actionCounts ?? {}) };
      const cooldowns = { ...legacy.player.actionCooldowns };
      const rng = structuredClone(legacy.meta.rng);
      const result = executeAction(legacy, "player", "debatePrep");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/allocate your stats/i);
      expect(legacy.player.actions).toBe(actions);
      expect(legacy.player.funds).toBe(funds);
      expect(legacy.player.actionCounts ?? {}).toEqual(counts);
      expect(legacy.player.actionCooldowns).toEqual(cooldowns);
      expect(legacy.player.stats?.debate).toBeUndefined();
      expect(legacy.meta.rng).toEqual(rng);
    }
  });

  it("is deterministic for a fixed seed and action sequence (replay)", () => {
    const first = debateOf("debate-replay-seed");
    const second = debateOf("debate-replay-seed");
    expect(first.result).toEqual(second.result);
    expect(first.world.player.stats?.debate).toBe(second.world.player.stats?.debate);
    expect(first.world.meta.rng).toEqual(second.world.meta.rng);
  });

  it("respects AP on repeat execution: 1 AP allows one attempt, the next fails", () => {
    const world = createWorld(OPTS);
    world.player.stats = { debate: 4 };
    world.player.actions = 1;
    const first = executeAction(world, "player", "debatePrep");
    expect(first.ok).toBe(true);
    expect(world.player.actions).toBe(0);
    const second = executeAction(world, "player", "debatePrep");
    expect(second.ok).toBe(false);
    expect(second.ok ? "" : second.error).toMatch(/action points/i);
  });

  it("rejects execution with no action points", () => {
    const world = createWorld(OPTS);
    world.player.stats = { debate: 4 };
    world.player.actions = 0;
    const result = executeAction(world, "player", "debatePrep");
    expect(result.ok).toBe(false);
  });

  it("never raises debate above the cap across repeated attempts", () => {
    const world = createWorld(OPTS);
    world.player.stats = { debate: STAT_MAX };
    world.player.actions = 200;
    for (let i = 0; i < 20; i += 1) {
      executeAction(world, "player", "debatePrep");
      expect(world.player.stats?.debate).toBe(STAT_MAX);
    }
  });

  it("round-trips the debate stat through save and reload", () => {
    const world = createWorld({ ...OPTS, seed: "debate-seed-2" });
    world.player.stats = { debate: 1 };
    executeAction(world, "player", "debatePrep");
    expect(world.player.stats?.debate).toBe(2);
    const reloaded = deserializeSave(serializeSave(world, "2026-09-10T00:00:00.000Z"));
    expect(reloaded.player.stats?.debate).toBe(2);
  });

  it("loads saves that predate the debate stat without provisioning it", () => {
    const world = createWorld({ ...OPTS, seed: "debate-seed-2" });
    const raw = JSON.parse(serializeSave(world, "2026-09-10T00:00:00.000Z")) as { world: { player: { stats?: unknown } } };
    delete raw.world.player.stats;
    const legacy = deserializeSave(JSON.stringify(raw));
    expect(legacy.player.stats?.debate).toBeUndefined();
  });
});
