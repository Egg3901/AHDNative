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
import { ACTION_CATALOG } from "@ahdclient/engine";
import {
  CAUCUS_CREATE_COST,
  CAUCUS_CREATE_FUNDS_REQUIRED,
  projectCaucusChairAction,
  projectCaucusCreate,
  projectCaucusManagement,
  projectCaucusRoster,
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
  it("mirrors the engine's first rejection reason for a fresh independent player (#61)", () => {
    const world = createWorld({ ...FRESH });
    world.player.funds = 0; // Drain the reference endowment: this gate needs a broke player.
    const create = projectCaucusCreate(world);
    expect(create.fundCost).toBe(25_000);
    expect(create.fundsRequired).toBe(25_000);
    expect(create.actionCost).toBe(4);
    expect(create.available).toBe(false);
    // The dispatcher's generic funds gate runs before the caucus preflight, so
    // the hint must name funds first, not party membership (the mismatch #61
    // fixes). The engine's own rejection must agree.
    expect(create.disabledReason).toMatch(/funds/i);
    const broke = executeAction(world, "player", "createCaucus", { caucusName: "Blue Dog Caucus" });
    expect(broke.ok).toBe(false);
    expect(broke.ok ? "" : broke.error).toMatch(/funds/i);
    // Once the entry gate is funded, the next blocker is party membership in
    // both the hint and the engine.
    world.player.funds = 25_000;
    world.player.actions = 9;
    const funded = projectCaucusCreate(world);
    expect(funded.available).toBe(false);
    expect(funded.disabledReason).toMatch(/party member/i);
    const notMember = executeAction(world, "player", "createCaucus", { caucusName: "Blue Dog Caucus" });
    expect(notMember.ok).toBe(false);
    expect(notMember.ok ? "" : notMember.error).toMatch(/party/i);
    expect(projectCaucusManagement(world).caucusCount).toBe(0);
  });

  it("rejects a createCaucus attempt with no party through the public action", () => {
    const world = createWorld({ ...FRESH });
    world.player.funds = 0; // Drain the reference endowment: this gate needs a broke player.
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

  it("states the caucus consequences from the engine projection before confirmation", () => {
    const world = readyWorld();
    const create = projectCaucusCreate(world);
    expect(create.effect).toMatchObject({
      partyFundsDelta: -25_000,
      partyMembership: "none",
      caucusMembership: "create",
      startsPartySwitchCooldown: false,
    });
    expect(create.consequences).toEqual([
      "Charges 25,000 campaign funds",
      "Creates the caucus and makes you its first member",
    ]);
    expect(create.action.consequences).toEqual(create.consequences);

    expect(executeAction(world, "player", "createCaucus", { caucusName: "Blue Dog Caucus", caucusTaxRate: 2 }).ok).toBe(true);
    expect(projectCaucusRoster(world)[0]!.leave.consequences).toEqual(["Removes you from this caucus"]);
    expect(executeAction(world, "player", "leaveCaucus", {}).ok).toBe(true);
    expect(projectCaucusRoster(world)[0]!.join.consequences).toEqual(["Joins you to this caucus"]);
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

describe("chair action projection (#61)", () => {
  it("quotes the exact catalog charge and consequence before confirmation", () => {
    const world = readyWorld();
    expect(
      executeAction(world, "player", "createCaucus", { caucusName: "Blue Dog Caucus", caucusTaxRate: 2 }).ok,
    ).toBe(true);
    const id = projectCaucusManagement(world).caucuses[0]!.id;
    for (const actionId of ["setCaucusTaxRate", "disbandCaucus"] as const) {
      const view = projectCaucusChairAction(world, id, actionId);
      // Same catalog entry the dispatcher debits: no AP, no funds.
      expect(view.cost).toBe(ACTION_CATALOG[actionId].baseCost);
      expect(view.cost).toBe(0);
      expect(view.fundCost).toBe(ACTION_CATALOG[actionId].fundCost);
      expect(view.fundCost).toBe(0);
      expect(view.available).toBe(true);
    }
    expect(projectCaucusChairAction(world, id, "setCaucusTaxRate").consequences)
      .toEqual(["Sets the caucus campaign-fund levy"]);
    expect(projectCaucusChairAction(world, id, "disbandCaucus").consequences)
      .toEqual(["Clears all members and vacates the chair seats"]);
    // Roster views share the same projection object shape.
    const entry = projectCaucusRoster(world)[0]!;
    expect(entry.setTax).toEqual(projectCaucusChairAction(world, id, "setCaucusTaxRate"));
    expect(entry.disband).toEqual(projectCaucusChairAction(world, id, "disbandCaucus"));
  });

  it("executes the chair pair with no debit and keeps the failed-disband state untouched", () => {
    const world = readyWorld();
    expect(
      executeAction(world, "player", "createCaucus", { caucusName: "Blue Dog Caucus", caucusTaxRate: 2 }).ok,
    ).toBe(true);
    const id = projectCaucusManagement(world).caucuses[0]!.id;
    const fundsBefore = world.player.funds;
    const actionsBefore = world.player.actions;
    expect(executeAction(world, "player", "setCaucusTaxRate", { caucusId: id, caucusTaxRate: 4 }).ok).toBe(true);
    expect(projectCaucusRoster(world)[0]!.taxRate).toBe(4);
    expect(world.player.funds).toBe(fundsBefore);
    expect(world.player.actions).toBe(actionsBefore);
    expect(executeAction(world, "player", "disbandCaucus", { caucusId: id }).ok).toBe(true);
    expect(world.player.funds).toBe(fundsBefore);
    expect(world.player.actions).toBe(actionsBefore);
    expect(world.player.caucusId).toBeNull();
    // Disbanded caucuses leave the roster and quote unavailable, never executable.
    expect(projectCaucusRoster(world)).toHaveLength(0);
    for (const actionId of ["setCaucusTaxRate", "disbandCaucus"] as const) {
      const view = projectCaucusChairAction(world, id, actionId);
      expect(view.available).toBe(false);
      expect(view.disabledReason).toMatch(/disbanded/i);
    }
    const retry = executeAction(world, "player", "disbandCaucus", { caucusId: id });
    expect(retry.ok).toBe(false);
    expect(world.player.funds).toBe(fundsBefore);
    expect(world.player.actions).toBe(actionsBefore);
  });

  it("rejects a non-chair with the engine reason and changes nothing", () => {
    const world = readyWorld();
    expect(
      executeAction(world, "player", "createCaucus", { caucusName: "Blue Dog Caucus", caucusTaxRate: 2 }).ok,
    ).toBe(true);
    executeAction(world, "player", "leaveCaucus", {});
    const id = projectCaucusManagement(world).caucuses[0]!.id;
    const fundsBefore = world.player.funds;
    const actionsBefore = world.player.actions;
    expect(projectCaucusChairAction(world, id, "setCaucusTaxRate").available).toBe(false);
    expect(projectCaucusChairAction(world, id, "setCaucusTaxRate").disabledReason).toMatch(/chair/i);
    expect(projectCaucusChairAction(world, id, "disbandCaucus").available).toBe(false);
    expect(projectCaucusChairAction(world, id, "disbandCaucus").disabledReason).toMatch(/chair/i);
    const taxResult = executeAction(world, "player", "setCaucusTaxRate", { caucusId: id, caucusTaxRate: 4 });
    expect(taxResult.ok).toBe(false);
    expect(taxResult.ok ? "" : taxResult.error).toMatch(/chair/i);
    const disbandResult = executeAction(world, "player", "disbandCaucus", { caucusId: id });
    expect(disbandResult.ok).toBe(false);
    expect(disbandResult.ok ? "" : disbandResult.error).toMatch(/chair/i);
    expect(world.player.funds).toBe(fundsBefore);
    expect(world.player.actions).toBe(actionsBefore);
    expect(projectCaucusManagement(world).caucuses[0]).toMatchObject({ taxRate: 2, memberCount: 0 });
  });

  it("projects the reloaded chair state after save/reload", () => {
    const world = readyWorld();
    expect(
      executeAction(world, "player", "createCaucus", { caucusName: "Blue Dog Caucus", caucusTaxRate: 2 }).ok,
    ).toBe(true);
    const id = projectCaucusManagement(world).caucuses[0]!.id;
    expect(executeAction(world, "player", "setCaucusTaxRate", { caucusId: id, caucusTaxRate: 3.5 }).ok).toBe(true);
    const revived = deserializeSave(serializeSave(world, SAVED_AT));
    const revivedId = projectCaucusManagement(revived).caucuses[0]!.id;
    expect(projectCaucusManagement(revived).caucuses[0]).toMatchObject({ taxRate: 3.5, isPlayerChair: true });
    expect(projectCaucusChairAction(revived, revivedId, "setCaucusTaxRate").available).toBe(true);
    expect(projectCaucusChairAction(revived, revivedId, "disbandCaucus").available).toBe(true);
    expect(executeAction(revived, "player", "disbandCaucus", { caucusId: revivedId }).ok).toBe(true);
    expect(projectCaucusManagement(revived).caucusCount).toBe(0);
  });
});

describe("chair-only caucus controls (#60)", () => {
  it("exposes tax edit and disband to the chair, with no AP or fund charge", () => {
    const world = readyWorld();
    expect(
      executeAction(world, "player", "createCaucus", { caucusName: "Blue Dog Caucus", caucusTaxRate: 2 }).ok,
    ).toBe(true);
    const entry = projectCaucusRoster(world)[0]!;
    expect(entry.isPlayerChair).toBe(true);
    expect(entry.chairName).toBe(world.player.name);
    expect(entry.setTax.available).toBe(true);
    expect(entry.setTax.cost).toBe(0);
    expect(entry.disband.available).toBe(true);
    expect(entry.disband.cost).toBe(0);

    const fundsBefore = world.player.funds;
    const actionsBefore = world.player.actions;
    expect(executeAction(world, "player", "setCaucusTaxRate", { caucusId: entry.id, caucusTaxRate: 4 }).ok).toBe(true);
    expect(projectCaucusRoster(world)[0]!.taxRate).toBe(4);
    expect(executeAction(world, "player", "disbandCaucus", { caucusId: entry.id }).ok).toBe(true);
    expect(world.player.funds).toBe(fundsBefore);
    expect(world.player.actions).toBe(actionsBefore);
    expect(projectCaucusRoster(world)).toHaveLength(0);
  });

  it("marks a non-member's caucus controls unavailable with a chair reason", () => {
    const world = readyWorld();
    expect(
      executeAction(world, "player", "createCaucus", { caucusName: "Blue Dog Caucus", caucusTaxRate: 2 }).ok,
    ).toBe(true);
    executeAction(world, "player", "leaveCaucus", {});
    const entry = projectCaucusRoster(world)[0]!;
    expect(entry.isPlayerChair).toBe(false);
    expect(entry.setTax.available).toBe(false);
    expect(entry.setTax.disabledReason).toMatch(/chair/i);
    expect(entry.disband.available).toBe(false);
    expect(entry.disband.disabledReason).toMatch(/chair/i);
  });

  it("keeps the chair rate and disband across save/reload through the session", () => {
    const session = new GameSession();
    session.load(gunzipSync(readFileSync(ELECTED_FIXTURE)).toString("utf8"));
    session.advance();
    expect(session.act("createCaucus", { caucusName: "Blue Dog Caucus", caucusTaxRate: 2 }).ok).toBe(true);
    const id = session.caucusManagement().caucuses[0]!.id;
    expect(session.act("setCaucusTaxRate", { caucusId: id, caucusTaxRate: 3.5 }).ok).toBe(true);
    const saved = session.serialize(SAVED_AT);
    const revived = new GameSession();
    revived.load(saved);
    const after = revived.caucusManagement();
    expect(after.caucuses[0]!.taxRate).toBe(3.5);
    expect(after.caucuses[0]!.isPlayerChair).toBe(true);
    expect(revived.act("disbandCaucus", { caucusId: id }).ok).toBe(true);
    expect(revived.caucusManagement().caucusCount).toBe(0);
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
  expect(created.create.consequences).toContain("Creates the caucus and makes you its first member");
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
