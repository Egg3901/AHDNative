/**
 * Canvass region targeting slice (#57, bounded).
 *
 * The `canvass` hub action dispatches only a recorded region from the live
 * world: valid targets charge the catalog cost and record a turnout modifier,
 * unknown or foreign regions are rejected atomically, and the result stays
 * attached to the region through save/reload and the next turn. Polls,
 * targeted ads and political-operation targeting remain open (see
 * docs/CHARACTER-ACTION-PARITY.md).
 */
import { describe, expect, it } from "vitest";
import { createWorld, executeAction } from "@ahdclient/engine";
import { GameSession } from "./session";

const OPTIONS = { era: "1953", countryId: "US", seed: "canvass-region-target", playerName: "Alex" } as const;
const SAVED_AT = "2026-09-18T00:00:00.000Z";

function modifierTotal(world: unknown, regionId: string): number {
  const turnouts = (world as { regionTurnouts: Record<string, { modifiers: Record<string, Record<string, number>> }> }).regionTurnouts;
  return Object.values(turnouts[regionId]?.modifiers ?? {}).flatMap((group) => Object.values(group)).reduce((sum, value) => sum + value, 0);
}

describe("canvass region targeting", () => {
  it("dispatches a recorded region with the target in params, outcome and history", () => {
    const session = new GameSession();
    const view = session.create({ ...OPTIONS });
    const region = view.regions[0]!;
    expect(region).toMatchObject({ id: expect.any(String), name: expect.any(String) });
    const canvass = view.actions.find((action) => action.id === "canvass")!;
    expect(canvass.available).toBe(true);

    const before = session.view().player;
    const result = session.act("canvass", { regionId: region.id });
    expect(result.ok).toBe(true);
    expect((result as { message: string }).message).toContain(region.name);
    expect((result as { outcome?: { target?: unknown } }).outcome).toMatchObject({
      target: { kind: "region", id: region.id, label: region.name },
    });

    const after = session.view().player;
    expect(after.actions).toBe(before.actions - canvass.cost);
    expect(after.funds).toBe(before.funds - (canvass.fundCost ?? 0));
    const world = JSON.parse(session.serialize(SAVED_AT)).world;
    expect(modifierTotal(world, region.id)).toBeGreaterThan(0);
    expect(session.view().actionHistory?.[0]).toMatchObject({
      actionId: "canvass",
      target: { kind: "region", id: region.id, label: region.name },
    });
  });

  it("rejects an unknown region without charging actions or funds", () => {
    const session = new GameSession();
    session.create({ ...OPTIONS });
    const before = session.view().player;
    const result = session.act("canvass", { regionId: "missing-region" });
    expect(result).toEqual({ ok: false, error: "Unknown region missing-region" });
    expect(session.view().player).toEqual(before);
  });

  it("requires a region and rejects regions outside the player country", () => {
    const world = createWorld({ seed: "canvass-region-scope", playerName: "Tester", countryId: "US", era: "1953" });
    world.player.actions = 25;
    world.player.funds = 100_000;
    const before = { actions: world.player.actions, funds: world.player.funds };

    expect(executeAction(world, "player", "canvass", {})).toEqual({
      ok: false,
      error: "Action canvass requires a regionId",
    });

    const foreign = Object.values(world.regions).find((region) => region.countryId !== "US");
    expect(foreign).toBeDefined();
    expect(executeAction(world, "player", "canvass", { regionId: foreign!.id })).toEqual({
      ok: false,
      error: `Canvass is only available in your country (${foreign!.name} is in ${foreign!.countryId}).`,
    });
    expect(world.player.actions).toBe(before.actions);
    expect(world.player.funds).toBe(before.funds);
  });

  it("keeps the canvass result on the recorded region through save/reload and the next turn", () => {
    const session = new GameSession();
    const view = session.create({ ...OPTIONS });
    const region = view.regions[0]!;
    expect(session.act("canvass", { regionId: region.id }).ok).toBe(true);

    const loaded = new GameSession();
    loaded.load(session.serialize(SAVED_AT));
    expect(modifierTotal(JSON.parse(loaded.serialize(SAVED_AT)).world, region.id)).toBeGreaterThan(0);
    expect(loaded.view().actionHistory?.[0]).toMatchObject({
      actionId: "canvass",
      target: { kind: "region", id: region.id, label: region.name },
    });

    loaded.advance();
    expect(modifierTotal(JSON.parse(loaded.serialize(SAVED_AT)).world, region.id)).toBeGreaterThan(0);
  });
});
