import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  advanceTurn,
  deserializeSave,
  executeAction,
  serializeSave,
  type Caucus,
  type WorldState,
} from "@ahdclient/engine";
import { projectCaucusManagement, projectCaucusRoster } from "./caucusManagement";

const ELECTED_FIXTURE = new URL("../../fixtures/career-elected-1953-US.save.json.gz", import.meta.url);
const SAVED_AT = "2026-09-10T00:00:00.000Z";

function readyWorld(): WorldState {
  const world = deserializeSave(gunzipSync(readFileSync(ELECTED_FIXTURE)).toString("utf8"));
  advanceTurn(world);
  return world;
}

function foundBlueDog(world: WorldState): string {
  const result = executeAction(world, "player", "createCaucus", {
    caucusName: "Blue Dog Caucus",
    caucusTaxRate: 2,
  });
  expect(result.ok).toBe(true);
  return projectCaucusManagement(world).caucuses[0]!.id;
}

/** A recorded vice-chair who survives turn cleanup: same party as the player. */
function samePartyNpc(world: WorldState) {
  const npc = world.politicians.find((entry) => entry.partyId === world.player.partyId)!;
  expect(npc).toBeDefined();
  return npc;
}

describe("caucus roster/role projection (#60 read-only slice)", () => {
  it("surfaces the recorded chair, vice-chair, roster and player role", () => {
    const world = readyWorld();
    const id = foundBlueDog(world);
    // Vice-chair has no public action yet; the recorded field is set the way a
    // save carrying it would, so the projection must read it without inventing
    // elections, health or recruitment around it.
    const caucus = world.caucuses.find((entry) => entry.id === id)!;
    const npc = samePartyNpc(world);
    caucus.viceChairId = npc.id;
    if (!caucus.memberIds.includes(npc.id)) caucus.memberIds.push(npc.id);

    const entry = projectCaucusRoster(world)[0]!;
    expect(entry.chairName).toBe(world.player.name);
    expect(entry.chairState).toBe("known");
    expect(entry.viceChairName).toBe(npc.name);
    expect(entry.viceChairState).toBe("known");
    expect(entry.playerRole).toBe("chair");
    expect(entry.memberCount).toBe(2);
    expect(entry.memberNames).toEqual([world.player.name, npc.name]);
    // No health fields exist on the persisted Caucus, so none are projected.
    expect(entry).not.toHaveProperty("health");
    expect(entry).not.toHaveProperty("whip");
  });

  it("marks a non-member caucus role and keeps its recorded seats", () => {
    const world = readyWorld();
    foundBlueDog(world);
    expect(executeAction(world, "player", "leaveCaucus", {}).ok).toBe(true);
    const entry = projectCaucusRoster(world)[0]!;
    expect(entry.playerRole).toBe("non-member");
    expect(entry.isPlayerChair).toBe(false);
    // Leaving vacates the player's chair seat, so the chair reads vacant, not unknown.
    expect(entry.chairState).toBe("vacant");
    expect(entry.chairName).toBeNull();
    expect(entry.setTax.available).toBe(false);
  });

  it("reports unknown instead of fabricating seats missing from a legacy save", () => {
    const world = readyWorld();
    const legacy: Caucus = {
      id: "caucus-legacy",
      countryId: world.player.countryId,
      partyId: world.player.partyId!,
      name: "Legacy Caucus",
      treasury: 100,
      taxRate: 1,
      disbandedAt: null,
      memberIds: ["ghost-id"],
    };
    delete legacy.chairId;
    delete legacy.viceChairId;
    world.caucuses.push(legacy);

    const entry = projectCaucusRoster(world).find((row) => row.id === "caucus-legacy")!;
    expect(entry.chairName).toBeNull();
    expect(entry.chairState).toBe("unknown");
    expect(entry.viceChairName).toBeNull();
    expect(entry.viceChairState).toBe("unknown");
    expect(entry.playerRole).toBe("non-member");
    expect(entry.memberCount).toBe(1);
    // Unresolvable member ids are not rendered as names.
    expect(entry.memberNames).toEqual([]);
  });

  it("reports unknown for a recorded seat id that resolves to no one", () => {
    const world = readyWorld();
    const id = foundBlueDog(world);
    world.caucuses.find((entry) => entry.id === id)!.chairId = "ghost-id";
    const entry = projectCaucusRoster(world)[0]!;
    expect(entry.chairName).toBeNull();
    expect(entry.chairState).toBe("unknown");
    expect(entry.isPlayerChair).toBe(false);
  });

  it("keeps roster, seats and roles stable across save/reload and the next turn", () => {
    const world = readyWorld();
    const id = foundBlueDog(world);
    const npc = samePartyNpc(world);
    const caucus = world.caucuses.find((entry) => entry.id === id)!;
    caucus.viceChairId = npc.id;
    if (!caucus.memberIds.includes(npc.id)) caucus.memberIds.push(npc.id);
    // The turn's NPP retention phase dissolves members with no recorded
    // chair relationship (score 0 < 20), so record one the way real
    // recruitment would; the projection must then hold it across the turn.
    world.nppRelationships[`${id}:${npc.id}`] = { score: 50, updatedAtTurn: world.meta.turn };

    const before = projectCaucusRoster(world)[0]!;
    const revived = deserializeSave(serializeSave(world, SAVED_AT));
    const afterReload = projectCaucusRoster(revived)[0]!;
    expect(afterReload).toMatchObject({
      chairName: before.chairName,
      chairState: before.chairState,
      viceChairName: before.viceChairName,
      viceChairState: before.viceChairState,
      playerRole: before.playerRole,
      memberCount: before.memberCount,
      taxRate: before.taxRate,
      treasury: before.treasury,
    });
    expect(afterReload.memberNames).toEqual(before.memberNames);

    advanceTurn(revived);
    const afterTurn = projectCaucusRoster(revived)[0]!;
    expect(afterTurn).toMatchObject({
      chairName: before.chairName,
      chairState: before.chairState,
      viceChairName: before.viceChairName,
      viceChairState: before.viceChairState,
      playerRole: before.playerRole,
      memberCount: before.memberCount,
    });
    expect(afterTurn.memberNames).toEqual(before.memberNames);
  });

  it("holds the disbanded state across save/reload and the next turn", () => {
    const world = readyWorld();
    const id = foundBlueDog(world);
    expect(executeAction(world, "player", "disbandCaucus", { caucusId: id }).ok).toBe(true);
    expect(projectCaucusRoster(world)).toHaveLength(0);
    expect(projectCaucusManagement(world).playerCaucusId).toBeNull();

    const revived = deserializeSave(serializeSave(world, SAVED_AT));
    expect(projectCaucusRoster(revived)).toHaveLength(0);
    expect(projectCaucusManagement(revived).playerCaucusId).toBeNull();
    const stored = revived.caucuses.find((entry) => entry.id === id)!;
    expect(stored.disbandedAt).not.toBeNull();
    expect(stored.memberIds).toEqual([]);

    advanceTurn(revived);
    expect(projectCaucusRoster(revived)).toHaveLength(0);
    expect(projectCaucusManagement(revived).playerCaucusId).toBeNull();
  });
});
