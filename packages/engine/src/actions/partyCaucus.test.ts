import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import type { WorldState } from "../types.js";
import { executeAction } from "./execute.js";
import { ACTION_CATALOG } from "./catalog.js";
import {
  PARTY_CAUCUS_ACTION_IDS,
  isPartyCaucusActionId,
  partyCaucusCharge,
  partyCaucusEffect,
  quotePartyCaucusAction,
  partySwitchCooldownRemaining,
} from "./partyCaucus.js";
import {
  FOUND_PARTY_ACTION_COST,
  FOUND_PARTY_FUND_COST,
  PARTY_SWITCH_COOLDOWN_TURNS,
  getSwitchCooldownRemaining,
} from "../membership.js";
import {
  CAUCUS_CREATE_ACTION_COST,
  CAUCUS_CREATE_FUND_COST,
  CAUCUS_JOIN_ACTION_COST,
  CAUCUS_LEAVE_ACTION_COST,
} from "../caucus.js";

const OPTIONS = { era: "1953", countryId: "US", seed: "party-caucus-ssot", playerName: "Ada" } as const;

/** A funded party member able to run every party/caucus action. */
function ready(): WorldState {
  const world = createWorld({ ...OPTIONS });
  world.player.partyId = "US_DEM";
  world.player.funds = 300_000;
  world.player.actions = 30;
  return world;
}

describe("partyCaucus projection (#61)", () => {
  it("publishes one price contract from the shared constants", () => {
    expect(ACTION_CATALOG.foundParty.baseCost).toBe(FOUND_PARTY_ACTION_COST);
    expect(ACTION_CATALOG.foundParty.fundCost).toBe(FOUND_PARTY_FUND_COST);
    expect(ACTION_CATALOG.createCaucus.baseCost).toBe(CAUCUS_CREATE_ACTION_COST);
    expect(ACTION_CATALOG.createCaucus.fundCost).toBe(CAUCUS_CREATE_FUND_COST);
    expect(ACTION_CATALOG.joinCaucus.baseCost).toBe(CAUCUS_JOIN_ACTION_COST);
    expect(ACTION_CATALOG.leaveCaucus.baseCost).toBe(CAUCUS_LEAVE_ACTION_COST);
    // The published numbers the docs and UI quote.
    expect(FOUND_PARTY_FUND_COST).toBe(100_000);
    expect(FOUND_PARTY_ACTION_COST).toBe(8);
    expect(CAUCUS_CREATE_FUND_COST).toBe(25_000);
    expect(CAUCUS_CREATE_ACTION_COST).toBe(4);
  });

  it("classifies exactly the six party/caucus ids", () => {
    expect([...PARTY_CAUCUS_ACTION_IDS]).toEqual([
      "foundParty", "joinParty", "leaveParty", "createCaucus", "joinCaucus", "leaveCaucus",
    ]);
    for (const id of PARTY_CAUCUS_ACTION_IDS) expect(isPartyCaucusActionId(id)).toBe(true);
    expect(isPartyCaucusActionId("fundraise")).toBe(false);
    expect(isPartyCaucusActionId("endorse")).toBe(false);
  });

  it("quotes the exact catalog charge for every action", () => {
    const world = ready();
    for (const id of PARTY_CAUCUS_ACTION_IDS) {
      const entry = ACTION_CATALOG[id];
      expect(partyCaucusCharge(world.player, id)).toEqual({
        actionId: id,
        actionCost: entry.baseCost,
        fundCost: entry.fundCost,
        cooldownTurns: entry.cooldown,
      });
    }
  });

  it("names the treasury/membership/cooldown consequence of each action", () => {
    expect(partyCaucusEffect("foundParty")).toMatchObject({
      partyFundsDelta: -100_000, partyMembership: "found", startsPartySwitchCooldown: true, clearsCaucusMembership: true,
    });
    expect(partyCaucusEffect("joinParty")).toMatchObject({
      partyFundsDelta: 0, partyMembership: "join", startsPartySwitchCooldown: true, clearsCaucusMembership: true,
    });
    expect(partyCaucusEffect("leaveParty")).toMatchObject({
      partyFundsDelta: 0, partyMembership: "leave", startsPartySwitchCooldown: false,
    });
    expect(partyCaucusEffect("createCaucus")).toMatchObject({
      partyFundsDelta: -25_000, caucusMembership: "create", startsPartySwitchCooldown: false,
    });
    expect(partyCaucusEffect("joinCaucus")).toMatchObject({ caucusMembership: "join" });
    expect(partyCaucusEffect("leaveCaucus")).toMatchObject({ caucusMembership: "leave" });
  });

  it("combines charge and effect in quotePartyCaucusAction", () => {
    const world = ready();
    expect(quotePartyCaucusAction(world.player, "createCaucus")).toEqual({
      ...partyCaucusCharge(world.player, "createCaucus"),
      effect: partyCaucusEffect("createCaucus"),
    });
  });

  it("reads the party-switch cooldown the join/found gates enforce", () => {
    const world = ready();
    expect(partySwitchCooldownRemaining(world)).toBe(0);
    world.player.lastPartySwitchTurn = world.meta.turn;
    expect(partySwitchCooldownRemaining(world)).toBe(PARTY_SWITCH_COOLDOWN_TURNS);
    expect(partySwitchCooldownRemaining(world)).toBe(getSwitchCooldownRemaining(world.player, world.meta.turn));
  });

  it("charges exactly the quoted AP through the public dispatcher for join/leave party", () => {
    const world = createWorld({ ...OPTIONS });
    world.player.actions = 30;
    const joinQuote = partyCaucusCharge(world.player, "joinParty");
    const beforeJoin = world.player.actions;
    expect(executeAction(world, "player", "joinParty", { partyId: "US_DEM" }).ok).toBe(true);
    expect(world.player.actions).toBe(beforeJoin - joinQuote.actionCost);
    const leaveQuote = partyCaucusCharge(world.player, "leaveParty");
    const beforeLeave = world.player.actions;
    expect(executeAction(world, "player", "leaveParty").ok).toBe(true);
    expect(world.player.actions).toBe(beforeLeave - leaveQuote.actionCost);
  });

  it("charges exactly the quoted AP and funds through the public dispatcher for the caucus actions", () => {
    const world = ready();
    const createQuote = partyCaucusCharge(world.player, "createCaucus");
    const fundsBefore = world.player.funds;
    const actionsBefore = world.player.actions;
    expect(executeAction(world, "player", "createCaucus", { caucusName: "Reform Caucus", caucusTaxRate: 1 }).ok).toBe(true);
    expect(world.player.actions).toBe(actionsBefore - createQuote.actionCost);
    expect(world.player.funds).toBe(fundsBefore - createQuote.fundCost);
    const id = world.caucuses[0]!.id;

    const leaveQuote = partyCaucusCharge(world.player, "leaveCaucus");
    const beforeLeave = world.player.actions;
    expect(executeAction(world, "player", "leaveCaucus").ok).toBe(true);
    expect(world.player.actions).toBe(beforeLeave - leaveQuote.actionCost);

    const joinQuote = partyCaucusCharge(world.player, "joinCaucus");
    const beforeJoin = world.player.actions;
    expect(executeAction(world, "player", "joinCaucus", { caucusId: id }).ok).toBe(true);
    expect(world.player.actions).toBe(beforeJoin - joinQuote.actionCost);
  });
});
