import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { computeMinisterialOrderExpiresTurn, isMinisterialOrderActive } from "./lifecycle.js";
import type { MinisterialOrder } from "./types.js";

const OPTIONS = { era: "1953", countryId: "US", seed: "issue-258", playerName: "Alex" } as const;

describe("#258 ministerial order lifecycle", () => {
  it("applies an active order, persists it, then expires at the exclusive boundary", () => {
    const world = createWorld(OPTIONS);
    world.ministerialOrders.push({
      id: "order-1", countryId: "US", positionId: "secretary_of_treasury",
      characterId: "player", orderId: "federal_reserve_coordination",
      orderName: "Federal Reserve Coordination", status: "active", active: true,
      effects: [
        { metric: "economic.gdpGrowth", modifier: 0.03, scope: "national" },
        { metric: "governance.publicTrust", modifier: 0.02, scope: "regional", regionId: "NY" },
      ],
      issuedAtTurn: world.meta.turn, duration: 2,
      expiresTurn: computeMinisterialOrderExpiresTurn(world.meta.turn, 2),
    });

    advanceTurn(world);
    expect(world.ministerialOrders[0]).toMatchObject({ status: "active", active: true, lastAppliedTurn: 1 });
    const restored = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    expect(restored.ministerialOrders).toEqual(world.ministerialOrders);

    advanceTurn(restored);
    expect(restored.ministerialOrders[0]).toMatchObject({ status: "expired", active: false, expiredAtTurn: 2 });
  });

  it("normalizes a legacy active order from issuedAtTurn and never invents an order", () => {
    const world = createWorld(OPTIONS);
    expect(world.ministerialOrders).toEqual([]);
    const legacy = {
      id: "legacy", countryId: "US", characterId: "player", active: true,
      effects: [{ metric: "governance.publicTrust", modifier: 0.02, scope: "national" as const }],
      issuedAtTurn: 0,
    };
    world.ministerialOrders.push(legacy);
    expect(isMinisterialOrderActive(legacy, 23)).toBe(true);
    expect(isMinisterialOrderActive(legacy, 24)).toBe(false);
    const restored = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    advanceTurn(restored);
    expect(restored.ministerialOrders[0]).toMatchObject({ status: "active", duration: 24, expiresTurn: 24 });
  });

  it("coerces a legacy numeric-string expiry before applying the exclusive boundary", () => {
    const legacy = {
      id: "string-expiry", countryId: "US", characterId: "player", active: true,
      effects: [], issuedAtTurn: 0, expiresTurn: "5",
    } as unknown as MinisterialOrder;

    expect(isMinisterialOrderActive(legacy, 4)).toBe(true);
    expect(isMinisterialOrderActive(legacy, 5)).toBe(false);
  });

  it("honors any finite persisted duration, including zero, ahead of expiresTurn", () => {
    const zeroDuration = {
      id: "zero-duration", countryId: "US", characterId: "player", active: true,
      effects: [], issuedAtTurn: 7, duration: 0, expiresTurn: 99,
    } satisfies MinisterialOrder;

    expect(isMinisterialOrderActive(zeroDuration, 7)).toBe(false);
  });
});
