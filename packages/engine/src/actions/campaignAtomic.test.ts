import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { executeAction } from "./execute.js";

const OPTIONS = { era: "1953", countryId: "US", seed: "issue-88-atomic", playerName: "Alex" } as const;

describe("#88 campaign accounting", () => {
  it("charges player action points and funds together and returns a structured result", () => {
    const world = createWorld(OPTIONS);
    world.player.actions = 20;
    world.player.funds = 100_000;
    const before = { actions: world.player.actions, funds: world.player.funds };
    const result = executeAction(world, "player", "campaign");
    expect(result).toMatchObject({ ok: true, message: expect.any(String) });
    expect(world.player.actions).toBeLessThan(before.actions);
    expect(world.player.funds).toBeLessThan(before.funds);
  });

  it("rejects player and NPC campaign attempts atomically when funds are short", () => {
    const world = createWorld(OPTIONS);
    world.player.actions = 20;
    world.player.funds = 0;
    const politician = world.politicians[0]!;
    politician.actions = 20;
    politician.funds = 0;
    const playerBefore = structuredClone(world.player);
    const politicianBefore = structuredClone(politician);

    expect(executeAction(world, "player", "campaign")).toMatchObject({ ok: false, error: expect.stringMatching(/funds/i) });
    expect(executeAction(world, politician.id, "campaign")).toMatchObject({ ok: false, error: expect.stringMatching(/funds/i) });
    expect(world.player).toEqual(playerBefore);
    expect(politician).toEqual(politicianBefore);
  });
});
