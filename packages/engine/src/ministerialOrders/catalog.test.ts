import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  cabinetPositionsForCountry,
  classifyMinisterialOrders,
  createWorld,
  advanceTurn,
  getMinisterialOrders,
  listCountries,
  listEras,
  listPlayableCountries,
  ministerialOrderInventory,
  runMinisterialOrders,
} from "../index.js";

const EXPECTED_ORDER_COUNTS = { US: 26, UK: 26, DE: 22, IE: 38, JP: 22, CN: 32 } as const;

function worldFor(countryId: string) {
  const era = listEras().find((candidate) => listCountries(candidate.id).some((country) => country.id === countryId));
  if (!era) throw new Error(`No authored era for ${countryId}`);
  const playerCountry = listPlayableCountries(era.id)[0];
  if (!playerCountry) throw new Error(`No playable country can create a ${era.id} world`);
  const world = createWorld({ era: era.id, countryId: playerCountry.id, playerName: "Catalog Test", seed: `orders-${countryId}` });
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
            expect(order.blocker).toMatch(/regionalTargetRequired|defenseUnavailable|unsupportedMetric/);
            continue;
          }
          supported += 1;
          expect(order.resolvedEffects.length).toBeGreaterThan(0);
          for (const effect of order.resolvedEffects) {
            expect(effect.scope).toBe("national");
            expect(world.nationalMetrics[countryId]?.[effect.metric]
              || Object.values(world.regionalPoliticalMetrics ?? {}).find(board => board.countryId === countryId)).toBeDefined();
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
          const before = order.resolvedEffects.map((effect) => world.nationalMetrics[countryId]?.[effect.metric]?.value);
          const beforeSnapshot = JSON.stringify(world.politicalCabinetContributions?.[countryId]);
          world.ministerialOrders = [{
            id: `inventory:${countryId}:${position.id}:${order.id}`,
            countryId,
            characterId: "player",
            active: true,
            issuedAtTurn: world.meta.turn,
            effects: order.resolvedEffects,
          }];
          const applied = runMinisterialOrders(world);
          const changed = order.resolvedEffects.some((effect, index) => world.nationalMetrics[countryId]?.[effect.metric]?.value !== before[index]);
          expect(changed || JSON.stringify(world.politicalCabinetContributions?.[countryId]) !== beforeSnapshot).toBe(true);
          expect(applied.metricsUpdated > 0 || Object.keys(world.politicalCabinetContributions?.[countryId]?.contribution ?? {}).length > 0).toBe(true);
        }
      }
    }
  });

  it("does not authorize an injected metric that is not on the source-backed allowlist", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Catalog Test", seed: "orders-injected" });
    world.nationalMetrics["US"]!["infrastructure.publicTransit"] = { value: 40 };
    const transit = classifyMinisterialOrders(world, "US", "secretary_of_transportation")
      .find((order) => order.id === "public_transit_expansion");
    expect(transit?.availability).toBe("blocked");
    if (transit?.availability === "blocked") {
      expect(transit.blocker).toBe("unsupportedMetric:infrastructure.publicTransit");
    }
  });

  it("blocks a national-only TFP leaf whose regional writer has no recorded target", () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Catalog Test", seed: "orders-no-regional-target" });
    world.regionalMetrics = {};
    const skills = classifyMinisterialOrders(world, "US", "secretary_of_education")
      .find((order) => order.id === "workforce_skills_initiative");
    expect(skills?.availability).toBe("blocked");
    if (skills?.availability === "blocked") {
      expect(skills.blocker).toBe("unsupportedMetric:education.workforceSkill");
    }
  });
});
