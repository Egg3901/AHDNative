import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import type { WorldState } from "../types.js";
import type { CabinetMember } from "../cabinet/types.js";
import { MINISTERIAL_ACTION_CAP } from "../cabinet/ministerialActionPool.js";
import { isMinisterialOrderActive } from "./lifecycle.js";
import { issueMinisterialOrder } from "./issue.js";

const OPTIONS = { era: "1953", countryId: "US", seed: "issue-261", playerName: "Alex" } as const;

function holder(overrides: Partial<CabinetMember> = {}): CabinetMember {
  return {
    countryId: "US",
    positionId: "secretary_of_treasury",
    characterId: "player",
    characterName: "Alex",
    partyId: "US_DEM",
    appointedBy: null,
    appointedAtTurn: 0,
    confirmedAtTurn: 0,
    ministerialActions: MINISTERIAL_ACTION_CAP,
    lastMinisterialActionRefillTurn: 0,
    ...overrides,
  };
}

function worldWithHolder(member: CabinetMember): WorldState {
  const world = createWorld(OPTIONS);
  world.cabinetMembers = [member];
  return world;
}

describe("#261 validated ministerial order issue command", () => {
  it("issues a supported national order, debiting one action and appending a duration-bound order", () => {
    const world = worldWithHolder(holder());
    const before = world.meta.turn;

    const result = issueMinisterialOrder(world, {
      countryId: "US",
      positionId: "secretary_of_treasury",
      orderId: "emergency_fiscal_stimulus",
    });

    expect(result.order).toMatchObject({
      countryId: "US",
      positionId: "secretary_of_treasury",
      orderId: "emergency_fiscal_stimulus",
      orderName: "Emergency Fiscal Stimulus",
      characterId: "player",
      active: true,
      status: "active",
      duration: 24,
      issuedAtTurn: before,
      expiresTurn: before + 24,
      effects: [{ metric: "economic.unemploymentRate", modifier: -0.03, scope: "national" }],
    });
    expect(result.actionsRemaining).toBe(MINISTERIAL_ACTION_CAP - 1);
    expect(world.cabinetMembers[0]!.ministerialActions).toBe(MINISTERIAL_ACTION_CAP - 1);
    expect(world.ministerialOrders).toHaveLength(1);
    expect(isMinisterialOrderActive(world.ministerialOrders[0]!, before)).toBe(true);
  });

  it("lets the sitting executive administer an order for an NPC-held portfolio", () => {
    const world = worldWithHolder(holder({ characterId: "npc-treasurer", characterName: "Npc Treasurer" }));
    world.executives.US = { ...world.executives.US!, presidentId: "player" };

    const result = issueMinisterialOrder(world, {
      countryId: "US",
      positionId: "secretary_of_treasury",
      orderId: "federal_reserve_coordination",
    });

    expect(result.order.characterId).toBe("npc-treasurer");
    expect(result.actionsRemaining).toBe(MINISTERIAL_ACTION_CAP - 1);
  });

  it("rejects unknown country, position, and order ids without mutation", () => {
    const world = worldWithHolder(holder());
    const beforeOrders = structuredClone(world.ministerialOrders);
    const beforeActions = world.cabinetMembers[0]!.ministerialActions;

    expect(() => issueMinisterialOrder(world, { countryId: "XX", positionId: "secretary_of_treasury", orderId: "emergency_fiscal_stimulus" }))
      .toThrow("Invalid country");
    expect(() => issueMinisterialOrder(world, { countryId: "US", positionId: "lord_chancellor", orderId: "emergency_fiscal_stimulus" }))
      .toThrow("Unknown cabinet position");
    expect(() => issueMinisterialOrder(world, { countryId: "US", positionId: "secretary_of_treasury", orderId: "no_such_order" }))
      .toThrow("Invalid order ID");
    expect(() => issueMinisterialOrder(world, { countryId: "US", positionId: "secretary_of_treasury", orderId: "" }))
      .toThrow("Invalid order ID");

    expect(world.ministerialOrders).toEqual(beforeOrders);
    expect(world.cabinetMembers[0]!.ministerialActions).toBe(beforeActions);
  });

  it("rejects callers who are neither the holder nor the sitting executive", () => {
    const world = worldWithHolder(holder({ characterId: "npc-treasurer", characterName: "Npc Treasurer" }));
    const beforeOrders = structuredClone(world.ministerialOrders);

    expect(() => issueMinisterialOrder(world, {
      countryId: "US",
      positionId: "secretary_of_treasury",
      orderId: "emergency_fiscal_stimulus",
    })).toThrow("Only the cabinet holder or admin can issue orders");
    expect(world.ministerialOrders).toEqual(beforeOrders);
    expect(world.cabinetMembers[0]!.ministerialActions).toBe(MINISTERIAL_ACTION_CAP);
  });

  it("rejects a vacant portfolio without mutation", () => {
    const world = createWorld(OPTIONS);
    world.cabinetMembers = [];

    expect(() => issueMinisterialOrder(world, {
      countryId: "US",
      positionId: "secretary_of_treasury",
      orderId: "emergency_fiscal_stimulus",
    })).toThrow("No cabinet holder for this position");
    expect(world.ministerialOrders).toEqual([]);
  });

  it("rejects duplicate-active orders without spending and re-issues after expiry", () => {
    const world = worldWithHolder(holder());
    issueMinisterialOrder(world, {
      countryId: "US",
      positionId: "secretary_of_treasury",
      orderId: "emergency_fiscal_stimulus",
    });
    const afterFirst = world.cabinetMembers[0]!.ministerialActions;

    expect(() => issueMinisterialOrder(world, {
      countryId: "US",
      positionId: "secretary_of_treasury",
      orderId: "emergency_fiscal_stimulus",
    })).toThrow("This order is already active for this position");
    expect(world.ministerialOrders).toHaveLength(1);
    expect(world.cabinetMembers[0]!.ministerialActions).toBe(afterFirst);

    world.meta.turn = world.ministerialOrders[0]!.expiresTurn!;
    const retry = issueMinisterialOrder(world, {
      countryId: "US",
      positionId: "secretary_of_treasury",
      orderId: "emergency_fiscal_stimulus",
    });
    expect(world.ministerialOrders).toHaveLength(2);
    expect(world.ministerialOrders[0]!.status).toBe("expired");
    expect(retry.order.issuedAtTurn).toBe(world.meta.turn);
  });

  it("rejects exhausted action pools without mutation", () => {
    const world = worldWithHolder(holder({ ministerialActions: 0 }));
    const beforeOrders = structuredClone(world.ministerialOrders);

    expect(() => issueMinisterialOrder(world, {
      countryId: "US",
      positionId: "secretary_of_treasury",
      orderId: "emergency_fiscal_stimulus",
    })).toThrow("No ministerial actions remaining");
    expect(world.ministerialOrders).toEqual(beforeOrders);
    expect(world.cabinetMembers[0]!.ministerialActions).toBe(0);
  });

  it("keeps defense orders unavailable with a named blocker", () => {
    const world = worldWithHolder(holder({ positionId: "secretary_of_defense" }));

    expect(() => issueMinisterialOrder(world, {
      countryId: "US",
      positionId: "secretary_of_defense",
      orderId: "national_guard_deployment",
    })).toThrow(/defenseUnavailable:national_guard_deployment/);
    expect(world.ministerialOrders).toEqual([]);
    expect(world.cabinetMembers[0]!.ministerialActions).toBe(MINISTERIAL_ACTION_CAP);
  });

  it("keeps unsupported-metric orders unavailable with a named blocker", () => {
    const world = worldWithHolder(holder({ positionId: "secretary_of_state" }));

    expect(() => issueMinisterialOrder(world, {
      countryId: "US",
      positionId: "secretary_of_state",
      orderId: "international_aid_initiative",
    })).toThrow(/unsupportedMetric:governance\.publicTrust/);
    expect(world.ministerialOrders).toEqual([]);
  });

  it("requires a valid same-country target for regional orders", () => {
    const world = createWorld({ era: "1953", countryId: "UK", seed: "issue-261-uk", playerName: "Alex" });
    world.cabinetMembers = [{ ...holder(), countryId: "UK", positionId: "levelling_secretary" }];
    const ukRegion = Object.values(world.regions).find((region) => region.countryId === "UK")!;
    const foreignRegion = Object.values(world.regions).find((region) => region.countryId !== "UK")!;

    expect(() => issueMinisterialOrder(world, {
      countryId: "UK",
      positionId: "levelling_secretary",
      orderId: "regional_investment_programme",
    })).toThrow("Select a target region");
    expect(() => issueMinisterialOrder(world, {
      countryId: "UK",
      positionId: "levelling_secretary",
      orderId: "regional_investment_programme",
      targetRegionId: "no-such-region",
    })).toThrow("Invalid target region");
    expect(() => issueMinisterialOrder(world, {
      countryId: "UK",
      positionId: "levelling_secretary",
      orderId: "regional_investment_programme",
      targetRegionId: foreignRegion.id,
    })).toThrow("Invalid target region");
    expect(world.ministerialOrders).toEqual([]);

    world.regionalMetrics[ukRegion.id] = { gdpGrowth: { value: 50 } };
    const result = issueMinisterialOrder(world, {
      countryId: "UK",
      positionId: "levelling_secretary",
      orderId: "regional_investment_programme",
      targetRegionId: ukRegion.id,
    });
    expect(result.order.effects).toEqual([{ metric: "gdpGrowth", modifier: 0.05, scope: "regional", regionId: ukRegion.id }]);
  });

  it("rejects a regional target whose metric store cannot consume the effect", () => {
    const world = createWorld({ era: "1953", countryId: "UK", seed: "issue-261-uk2", playerName: "Alex" });
    world.cabinetMembers = [{ ...holder(), countryId: "UK", positionId: "levelling_secretary" }];
    const ukRegion = Object.values(world.regions).find((region) => region.countryId === "UK")!;

    expect(() => issueMinisterialOrder(world, {
      countryId: "UK",
      positionId: "levelling_secretary",
      orderId: "regional_investment_programme",
      targetRegionId: ukRegion.id,
    })).toThrow(/unsupportedMetric:gdpGrowth/);
    expect(world.ministerialOrders).toEqual([]);
  });

  it("persists an issued order through save and reload", () => {
    const world = worldWithHolder(holder());
    issueMinisterialOrder(world, {
      countryId: "US",
      positionId: "secretary_of_treasury",
      orderId: "emergency_fiscal_stimulus",
    });

    const restored = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    expect(restored.ministerialOrders).toHaveLength(1);
    expect(restored.ministerialOrders[0]).toMatchObject({
      positionId: "secretary_of_treasury",
      orderId: "emergency_fiscal_stimulus",
      status: "active",
    });
    expect(restored.cabinetMembers[0]!.ministerialActions).toBe(MINISTERIAL_ACTION_CAP - 1);
  });

  it("applies an issued order on the next turn through the public phase", () => {
    const world = worldWithHolder(holder());
    const before = world.nationalMetrics.US?.["economic.unemploymentRate"]?.value;
    issueMinisterialOrder(world, {
      countryId: "US",
      positionId: "secretary_of_treasury",
      orderId: "emergency_fiscal_stimulus",
    });

    advanceTurn(world);

    expect(world.ministerialOrders[0]!.lastAppliedTurn).toBe(world.meta.turn);
    expect(world.nationalMetrics.US?.["economic.unemploymentRate"]?.value).not.toBe(before);
  });
});
