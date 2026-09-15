import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { ministerialOrderInventory } from "./catalog.js";
import { runMinisterialOrders } from "./phases.js";

const OPTIONS = { era: "1953", countryId: "UK", seed: "issue-276", playerName: "Alex" } as const;

describe("#276 defense ministerial order consequences", () => {
  it("classifies every authored defense order against a named real or missing consumer", () => {
    const world = createWorld(OPTIONS);
    const defenseOrders = ["US", "UK", "DE", "IE", "JP", "CN"].flatMap((countryId) =>
      ministerialOrderInventory(world, countryId).filter((order) =>
        /defen[cs]e/.test(order.positionId),
      ),
    );

    expect(defenseOrders).toHaveLength(12);
    expect(defenseOrders.filter((order) => order.availability === "blocked" && order.blocker.startsWith("regionalTargetRequired:")))
      .toHaveLength(2);
    const unavailable = defenseOrders.filter((order) =>
      order.availability === "blocked" && order.blocker.startsWith("defenseUnavailable:"),
    );
    expect(unavailable).toHaveLength(10);
    for (const order of unavailable) {
      expect(order.blocker).toBe(`defenseUnavailable:${order.id}`);
      expect(order.unavailableEffects).toEqual(
        order.effects.map((effect) => ({
          metric: effect.metric,
          missingConsumer: effect.metric === "governmentApproval"
            ? "governmentApprovals"
            : `nationalMetrics.${effect.metric}`,
        })),
      );
    }
  });

  it("applies the authored UK veterans order to its real regional consumer through turn and save reload", () => {
    const world = createWorld(OPTIONS);
    world.regionalMetrics.LON = { "economic.unemploymentRate": { value: 10 } };
    world.ministerialOrders = [{
      id: "uk-veterans-live",
      countryId: "UK",
      characterId: "player",
      positionId: "defence_secretary",
      orderId: "veterans_support_programme",
      orderName: "Veterans Support Programme",
      active: true,
      duration: 2,
      expiresTurn: 2,
      effects: [{ metric: "economic.unemploymentRate", modifier: -0.04, scope: "regional", regionId: "LON" }],
      issuedAtTurn: 0,
    }];

    advanceTurn(world);
    expect(world.regionalMetrics.LON["economic.unemploymentRate"]?.value).toBe(9.95);
    const restored = deserializeSave(serializeSave(world, "2026-09-15T00:00:00.000Z"));
    advanceTurn(restored);
    expect(restored.regionalMetrics.LON["economic.unemploymentRate"]?.value).toBe(9.95);
    expect(restored.ministerialOrders[0]).toMatchObject({ active: false, status: "expired" });
  });

  it("rejects an unavailable authored defense order without creating metric state", () => {
    const world = createWorld(OPTIONS);
    world.ministerialOrders = [{
      id: "uk-review-unavailable",
      countryId: "UK",
      characterId: "player",
      positionId: "defence_secretary",
      orderId: "national_defence_review",
      active: true,
      effects: [{ metric: "governmentApproval", modifier: 0.03, scope: "national" }],
      issuedAtTurn: 0,
    }];

    const before = structuredClone(world.nationalMetrics);
    const result = runMinisterialOrders(world);

    expect(world.nationalMetrics).toEqual(before);
    expect(world.ministerialOrders[0]?.lastAppliedTurn).toBeUndefined();
    expect(result.rejectedDefenseOrders).toEqual([{
      orderId: "uk-review-unavailable",
      catalogOrderId: "national_defence_review",
      missingConsumers: ["governmentApprovals"],
      reason: "unavailableConsumer",
    }]);
  });
});
