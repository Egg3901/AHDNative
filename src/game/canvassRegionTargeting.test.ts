import { describe, expect, it } from "vitest";
import { createWorld, executeAction } from "@ahdclient/engine";
import { GameSession } from "./session";

const OPTIONS = { era: "1953", countryId: "US", seed: "canvass-region-target", playerName: "Alex" } as const;
const SAVED_AT = "2026-09-18T00:00:00.000Z";

function target(session: GameSession) {
  const view = session.view().canvassing!;
  const category = view.categories[0]!;
  const group = category.groups[0]!;
  return { regionId: view.regionId!, demographicCategory: category.id, demographicGroup: group.id, count: 2 };
}
function modifierTotal(session: GameSession, regionId: string): number {
  const world = JSON.parse(session.serialize(SAVED_AT)).world;
  return Object.values(world.regionTurnouts[regionId]?.campaignModifiers ?? {}).flatMap(groups => Object.values(groups as Record<string, number>)).reduce((sum, value) => sum + value, 0);
}

describe("source demographic canvass targeting", () => {
  it("dispatches the recorded home demographic with its cost, outcome and history", () => {
    const session = new GameSession();
    const view = session.create({ ...OPTIONS });
    const params = target(session);
    const before = view.player;
    const result = session.act("canvass", params);
    expect(result.ok).toBe(true);
    const targetView = view.canvassing!;
    const group = targetView.categories[0]!.groups[0]!;
    expect(result).toMatchObject({ message: expect.stringContaining(group.name), outcome: { target: { kind: "demographic", id: `${params.regionId}:${params.demographicCategory}:${params.demographicGroup}`, label: `${group.name} in ${targetView.regionName}` } } });
    expect(session.view().player.actions).toBe(before.actions - 2);
    expect(session.view().player.funds).toBe(before.funds - 200);
    expect(modifierTotal(session, params.regionId)).toBeGreaterThan(0);
    expect(session.view().actionHistory?.[0]?.target).toEqual((result as { outcome?: { target?: unknown } }).outcome?.target);
  });

  it("rejects unknown, foreign, non-home and missing demographic targets atomically", () => {
    const world = createWorld({ ...OPTIONS });
    world.player.actions = 25;
    world.player.funds = 100_000;
    const foreign = Object.values(world.regions).find(region => region.countryId !== "US")!;
    const nonHome = Object.values(world.regions).find(region => region.countryId === "US" && region.id !== world.player.homeRegionId)!;
    for (const regionId of ["missing-region", foreign.id, nonHome.id, world.player.homeRegionId!]) {
      const before = structuredClone(world);
      expect(executeAction(world, "player", "canvass", { regionId }).ok).toBe(false);
      expect(world).toEqual(before);
    }
  });

  it("persists the exact selected audience and continues after reload", () => {
    const session = new GameSession();
    session.create({ ...OPTIONS });
    const params = target(session);
    expect(session.act("canvass", params).ok).toBe(true);
    const loaded = new GameSession();
    loaded.load(session.serialize(SAVED_AT));
    expect(modifierTotal(loaded, params.regionId)).toBeCloseTo(modifierTotal(session, params.regionId));
    expect(loaded.view().actionHistory?.[0]?.target).toEqual(session.view().actionHistory?.[0]?.target);
    loaded.advance();
    expect(modifierTotal(loaded, params.regionId)).toBeGreaterThan(0);
    expect(loaded.act("canvass", params).ok).toBe(true);
  });
});
