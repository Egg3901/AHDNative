import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  cabinetPositionsForCountry,
  classifyMinisterialOrders,
  createWorld,
  advanceTurn,
  getMinisterialOrders,
  listEras,
  listPlayableCountries,
  ministerialOrderInventory,
  runMinisterialOrders,
} from "../index.js";

const EXPECTED_ORDER_COUNTS = { US: 26, UK: 26, DE: 22, IE: 38, JP: 22, CN: 32 } as const;

function worldFor(countryId: string) {
  const era = listEras().find((candidate) => listPlayableCountries(candidate.id).some((country) => country.id === countryId));
  if (!era) throw new Error(`No playable era for ${countryId}`);
  const world = createWorld({ era: era.id, countryId, playerName: "Catalog Test", seed: `orders-${countryId}` });
  advanceTurn(world);
  return world;
}

describe("ministerial order catalog public boundary", () => {
  it("ports the pinned source vectors for every Native cabinet country", () => {
    const catalog = Object.fromEntries(Object.keys(EXPECTED_ORDER_COUNTS).map((countryId) => [
      countryId,
      Object.fromEntries(cabinetPositionsForCountry(countryId).map((position) => [position.id, getMinisterialOrders(countryId, position.id)])),
    ]));
    expect(Object.fromEntries(Object.entries(catalog).map(([countryId, positions]) => [
      countryId,
      Object.values(positions).flat().length,
    ]))).toEqual(EXPECTED_ORDER_COUNTS);
    expect(createHash("sha256").update(JSON.stringify(catalog)).digest("hex"))
      .toBe("6f896c6c06feab1d841593066dd995f713a5608eada884407d5781953d43391a");
    expect(getMinisterialOrders("US", "secretary_of_treasury")[0]).toEqual({
      id: "emergency_fiscal_stimulus",
      name: "Emergency Fiscal Stimulus",
      description: "Deploy emergency fiscal measures for job creation and consumer spending, for a temporary drop in unemployment.",
      duration: 24,
      effects: [{ metric: "economic.unemploymentRate", modifier: -0.03, scope: "national" }],
    });
  });

  it("advertises only orders whose exact metric targets the Native world can execute", () => {
    for (const countryId of Object.keys(EXPECTED_ORDER_COUNTS)) {
      const world = worldFor(countryId);
      expect(ministerialOrderInventory(world, countryId)).toHaveLength(EXPECTED_ORDER_COUNTS[countryId as keyof typeof EXPECTED_ORDER_COUNTS]);
      let supported = 0;
      for (const position of cabinetPositionsForCountry(countryId)) {
        for (const order of classifyMinisterialOrders(world, countryId, position.id)) {
          if (order.availability === "blocked") {
            expect(order.blocker).toMatch(/regionalMetrics|defensePipeline|unsupportedMetric/);
            continue;
          }
          supported += 1;
          expect(order.resolvedEffects.length).toBeGreaterThan(0);
          for (const effect of order.resolvedEffects) {
            expect(effect.scope).toBe("national");
            expect(world.nationalMetrics[countryId]?.[effect.metric]).toBeDefined();
          }
        }
      }
      expect(supported).toBeGreaterThan(0);
    }
  });

  it("executes every supported inventory entry through the public order phase", () => {
    for (const countryId of Object.keys(EXPECTED_ORDER_COUNTS)) {
      const world = worldFor(countryId);
      for (const position of cabinetPositionsForCountry(countryId)) {
        for (const order of classifyMinisterialOrders(world, countryId, position.id)) {
          if (order.availability !== "supported") continue;
          const before = order.resolvedEffects.map((effect) => world.nationalMetrics[countryId]![effect.metric]!.value);
          world.ministerialOrders = [{
            id: `inventory:${countryId}:${position.id}:${order.id}`,
            countryId,
            characterId: "player",
            active: true,
            issuedAtTurn: world.meta.turn,
            effects: order.resolvedEffects,
          }];
          expect(runMinisterialOrders(world).metricsUpdated).toBe(order.resolvedEffects.length);
          expect(order.resolvedEffects.some((effect, index) => world.nationalMetrics[countryId]![effect.metric]!.value !== before[index])).toBe(true);
        }
      }
    }
  });
});
