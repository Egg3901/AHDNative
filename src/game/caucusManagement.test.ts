import { GameSession } from "./session";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  advanceTurn,
  createWorld,
  deserializeSave,
  executeAction,
  serializeSave,
  type WorldState,
} from "@ahdclient/engine";
import {
  CAUCUS_CREATE_COST,
  CAUCUS_CREATE_FUNDS_REQUIRED,
  projectCaucusCreate,
  projectCaucusManagement,
  validateCaucusFounding,
} from "./caucusManagement";

const FRESH = { era: "1953", countryId: "US", seed: "native-caucus-mgmt-v1", playerName: "Alex" } as const;
const ELECTED_FIXTURE = new URL("../../fixtures/career-elected-1953-US.save.json.gz", import.meta.url);
const SAVED_AT = "2026-09-10T00:00:00.000Z";

function electedWorld(): WorldState {
  return deserializeSave(gunzipSync(readFileSync(ELECTED_FIXTURE)).toString("utf8"));
}

/** One real turn on the genuine elected fixture. Fixture funds stay above the 25k price and AP refreshes to 9. */
function readyWorld(): WorldState {
  const world = electedWorld();
  advanceTurn(world);
  return world;
}

describe("projectCaucusCreate", () => {
  it("blocks a fresh independent player on party membership", () => {
    const world = createWorld({ ...FRESH });
    const create = projectCaucusCreate(world);
    expect(create.fundCost).toBe(25_000);
    expect(create.fundsRequired).toBe(25_000);
    expect(create.actionCost).toBe(4);
    expect(create.available).toBe(false);
    expect(create.disabledReason).toMatch(/party member/i);
    expect(projectCaucusManagement(world).caucusCount).toBe(0);
  });

  it("rejects a createCaucus attempt with no party through the public action", () => {
    const world = createWorld({ ...FRESH });
    const broke = executeAction(world, "player", "createCaucus", {
      caucusName: "Blue Dog Caucus",
      caucusTaxRate: 2,
    });
    expect(broke.ok).toBe(false);
    expect(broke.ok ? "" : broke.error).toMatch(/funds/i);
    world.player.funds = 25_000;
    world.player.actions = 9;
    const result = executeAction(world, "player", "createCaucus", {
      caucusName: "Blue Dog Caucus",
      caucusTaxRate: 2,
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/party/i);
    expect(projectCaucusManagement(world).caucusCount).toBe(0);
  });

  it("rejects short names, out-of-range tax and taken slugs", () => {
    const world = readyWorld();
    expect(validateCaucusFounding(world, "AB", 0).ok).toBe(false);
    expect(validateCaucusFounding(world, "Blue Dog Caucus", 6).ok).toBe(false);
    expect(validateCaucusFounding(world, "Blue Dog Caucus", -1).ok).toBe(false);
    expect(
      executeAction(world, "player", "createCaucus", {
        caucusName: "Blue Dog Caucus",
        caucusTaxRate: 2,
      }).ok,
    ).toBe(true);
    expect(validateCaucusFounding(world, "Blue  Dog   Caucus", 1).ok).toBe(false);
    expect((validateCaucusFounding(world, "Blue  Dog   Caucus", 1) as { error: string }).error).toMatch(/slug taken/i);
  });
});

describe("createCaucus through the public action", () => {
  it("creates, auto-joins and stamps tax on a genuine elected save", () => {
    const world = readyWorld();
    const before = projectCaucusManagement(world);
    expect(before.create.available).toBe(true);
    expect(before.playerPartyName).toBe("Democratic Party");
    expect(before.playerCaucusName).toBeNull();
    expect(before.create.funds).toBeGreaterThanOrEqual(CAUCUS_CREATE_FUNDS_REQUIRED);
    const fundsBefore = before.create.funds;
    const actionsBefore = before.create.actions;
    const costBefore = before.create.actionCost;

    const result = executeAction(world, "player", "createCaucus", {
      caucusName: "Blue Dog Caucus",
      caucusTaxRate: 2.5,
    });
    expect(result.ok).toBe(true);

    const after = projectCaucusManagement(world);
    expect(after.caucusCount).toBe(before.caucusCount + 1);
    expect(after.playerCaucusName).toBe("Blue Dog Caucus");
    expect(after.caucuses[0]).toMatchObject({
      name: "Blue Dog Caucus",
      taxRate: 2.5,
      treasury: 0,
      isPlayerCaucus: true,
      memberCount: 1,
    });
    expect(after.caucuses[0]!.memberNames).toEqual([world.player.name]);
    expect(after.create.funds).toBe(fundsBefore - CAUCUS_CREATE_COST);
    expect(after.create.actions).toBe(actionsBefore - costBefore);
    expect(world.player.actionCounts["createCaucus"]).toBe(1);
    expect(after.create.available).toBe(false);
    expect(after.create.disabledReason).toMatch(/Already in a caucus/i);
  });

  it("survives save and reload with membership and tax intact", () => {
    const world = readyWorld();
    expect(
      executeAction(world, "player", "createCaucus", {
        caucusName: "Blue Dog Caucus",
        caucusTaxRate: 3,
      }).ok,
    ).toBe(true);
    const raw = serializeSave(world, SAVED_AT);
    const revived = deserializeSave(raw);
    const after = projectCaucusManagement(revived);
    expect(after.playerCaucusName).toBe("Blue Dog Caucus");
    expect(after.caucuses[0]).toMatchObject({ taxRate: 3, isPlayerCaucus: true, memberCount: 1 });
  });
});

describe("joinCaucus and leaveCaucus through the public action", () => {
  it("leaves and rejoins the same party caucus with catalog AP costs", () => {
    const world = readyWorld();
    expect(
      executeAction(world, "player", "createCaucus", {
        caucusName: "Blue Dog Caucus",
        caucusTaxRate: 2,
      }).ok,
    ).toBe(true);
    const id = projectCaucusManagement(world).caucuses[0]!.id;
    const afterCreate = projectCaucusManagement(world);
    expect(afterCreate.caucuses[0]!.leave.available).toBe(true);
    expect(afterCreate.caucuses[0]!.join.available).toBe(false);

    const actionsBeforeLeave = world.player.actions;
    const fundsBeforeLeave = world.player.funds;
    expect(executeAction(world, "player", "leaveCaucus", {}).ok).toBe(true);
    const afterLeave = projectCaucusManagement(world);
    expect(afterLeave.playerCaucusName).toBeNull();
    expect(afterLeave.caucuses[0]).toMatchObject({ memberCount: 0, isPlayerCaucus: false });
    expect(world.player.actions).toBe(actionsBeforeLeave - 1);
    expect(world.player.funds).toBe(fundsBeforeLeave);
    expect(afterLeave.caucuses[0]!.join.available).toBe(true);
    expect(afterLeave.create.available).toBe(true);

    const actionsBeforeJoin = world.player.actions;
    expect(executeAction(world, "player", "joinCaucus", { caucusId: id }).ok).toBe(true);
    const afterJoin = projectCaucusManagement(world);
    expect(afterJoin.playerCaucusName).toBe("Blue Dog Caucus");
    expect(afterJoin.caucuses[0]).toMatchObject({ memberCount: 1, isPlayerCaucus: true });
    expect(world.player.actions).toBe(actionsBeforeJoin - 2);
    expect(world.player.actionCounts.joinCaucus).toBe(1);
    expect(world.player.actionCounts.leaveCaucus).toBe(1);
  });

  it("hides other-party caucuses and rejects a party-mismatch join", () => {
    const world = readyWorld();
    expect(
      executeAction(world, "player", "createCaucus", {
        caucusName: "Blue Dog Caucus",
        caucusTaxRate: 1,
      }).ok,
    ).toBe(true);
    executeAction(world, "player", "leaveCaucus", {});
    world.caucuses.push({
      id: "caucus-red-state",
      countryId: "US",
      partyId: "US_REP",
      name: "Red State Caucus",
      treasury: 0,
      taxRate: 1,
      disbandedAt: null,
      memberIds: [],
    });
    const view = projectCaucusManagement(world);
    expect(view.caucuses.some((caucus) => caucus.name === "Red State Caucus")).toBe(false);
    expect(view.caucuses.some((caucus) => caucus.name === "Blue Dog Caucus")).toBe(true);
    const mismatch = executeAction(world, "player", "joinCaucus", { caucusId: "caucus-red-state" });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.ok ? "" : mismatch.error).toMatch(/party mismatch/i);
  });
});

it("creates, leaves, joins and resumes through the session act/save boundary without leaking state", () => {
  const session = new GameSession();
  session.load(gunzipSync(readFileSync(ELECTED_FIXTURE)).toString("utf8"));
  session.advance();
  expect(() => new GameSession().caucusManagement()).toThrow("Start or load");
  const before = session.caucusManagement();
  expect(before.create.available).toBe(true);
  expect(session.act("createCaucus", { caucusName: "Blue Dog Caucus", caucusTaxRate: 2 }).ok).toBe(true);
  const created = session.caucusManagement();
  expect(created.playerCaucusName).toBe("Blue Dog Caucus");
  expect(created.create.funds).toBe(before.create.funds - 25_000);
  const id = created.caucuses[0]!.id;
  expect(session.act("leaveCaucus", {}).ok).toBe(true);
  expect(session.act("joinCaucus", { caucusId: id }).ok).toBe(true);
  const saved = session.serialize(SAVED_AT);
  expect(session.act("createCaucus", { caucusName: "New Democrats", caucusTaxRate: 1 }).ok).toBe(false);
  expect(session.serialize(SAVED_AT)).toBe(saved);
  const resumed = new GameSession();
  resumed.load(saved);
  const after = resumed.caucusManagement();
  expect(after.playerCaucusName).toBe("Blue Dog Caucus");
  expect(after.caucuses[0]!.taxRate).toBe(2);
  after.caucuses[0]!.name = "Detached query";
  expect(session.caucusManagement().caucuses[0]!.name).toBe("Blue Dog Caucus");
});
