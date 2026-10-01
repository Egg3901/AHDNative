import { describe, expect, it } from "vitest";
import { advancePlantCapitalTurn } from "./plantCapacity.js";
import { corporatePlantProductionPhase, demandThrottleFactor, throttleSoldUnits } from "./plantProduction.js";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { rebuildCorporatePlantInputDemand } from "./plantDemand.js";

describe("plants-tier corporate production", () => {
  it("matches the source 3fbff460 demand probe and price-weighted mixed sales", () => {
    expect(demandThrottleFactor(60_000, 10_000, 60_000)).toBeCloseTo(11_500 / 60_000, 12);
    expect(demandThrottleFactor(60_000, 0, 60_000)).toBe(0.1);
    expect(demandThrottleFactor(60_000, 10_000, null)).toBe(1);
    const hardware = {
      id: "test-sector", corporationId: "test-corp", countryId: "US", stateId: null,
      sectorType: "technology" as const, capitalStock: 1_000, workers: 1,
      representingUnionId: null, forSale: null, owner: "corporation" as const,
      producedUnits: 1_000, soldUnits: 1_000 * ((0.55 * 1 + 0.15 * 0.1) / 0.7),
      soldByCommodity: { electronics: 1, software: 0.1 },
    };
    const valueWeighted = throttleSoldUnits(hardware, { electronics: 0.55, software: 0.15 },
      (commodity) => commodity === "electronics" ? 8 : 2);
    expect(valueWeighted).toBeCloseTo(1_000 * ((0.55 * 8 + 0.15 * 2 * 0.1) / (0.55 * 8 + 0.15 * 2)), 12);
    expect(valueWeighted! * 1.15).toBeGreaterThan(1_000);
  });

  it("advances stock and paid basis with landed purchases before source depreciation", () => {
    const next = advancePlantCapitalTurn({
      capitalStock: 22_982_142.85714286,
      capacityBookAnchor: 988_232_142.8571429,
      landedCreditAnchor: 43_000,
      capacityPricePerUnitAnchor: 43,
    });
    expect(next.landedUnits).toBe(1_000);
    expect(next.capitalStock).toBeCloseTo(22_971_651.285714287, 6);
    expect(next.capacityBookAnchor).toBeCloseTo(987_781_005.2857144, 6);
    expect(next.depreciationFactor).toBe(0.9995);
  });

  it("produces and sells the pinned source 1953 manufacturing vector", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "plants-source-vector", playerName: "Alex" });
    const id = "corporate-sector:US:manufacturing:US-manufacturing";
    const expectedStock = 22_982_142.85714286;
    const expectedMixWeight = 0.5;
    world.corporations = { ["US-manufacturing"]: world.corporations["US-manufacturing"]! };
    world.corporateSectors = { [id]: {
      id,
      corporationId: "US-manufacturing",
      countryId: "US",
      stateId: null,
      sectorType: "manufacturing",
      capitalStock: expectedStock,
      capacityBookAnchor: 988_232_142.8571429,
      workers: 1_048_125,
      representingUnionId: null,
      forSale: null,
      owner: "corporation",
    } };
    world.commodityPrices.steel!.globalDemand = expectedStock / 1.1 * expectedMixWeight - 41_000;
    world.commodityPrices.building_materials!.globalDemand = expectedStock / 1.1 * expectedMixWeight - 38_000;
    world.commodityPrices.steel!.globalSupply = expectedStock * expectedMixWeight;
    world.commodityPrices.building_materials!.globalSupply = expectedStock * expectedMixWeight;
    corporatePlantProductionPhase.run(world);

    const asset = world.corporateSectors[id]!;
    // Source translation: Game `plantsRevenue.ts` records hourly receipts as
    // producedUnits × plantsMixPrice / TURNS_PER_DAY (24) × its realized
    // clearing leg. Native's seven-day turn stores local/week, so this row is
    // the source daily anchor receipts × DAYS_PER_TURN (7) × live local/anchor
    // FX. Its independent 1953 input-demand vector is pinned immediately below.
    expect(asset.capitalStock).toBeCloseTo(22_970_651.785714287, 6);
    expect(asset.producedUnits).toBeCloseTo(22_970_651.785714287, 6);
    expect(asset.soldFraction).toBeCloseTo(0.909090909090909, 12);
    expect(asset.realizedRevenue).toBeCloseTo(2_095_201_875, 6);
    expect(world.corporations["US-manufacturing"]!.revenue).toBeCloseTo(2_095_201_875, 6);
    expect(world.commodityPrices.steel!.globalSupply).toBeCloseTo(
      expectedStock * expectedMixWeight + asset.producedUnits! * expectedMixWeight,
      6,
    );
  });

  it("rebuilds the 1953 manufacturing buyer leg from source intermediate-demand rates", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "plants-source-input-demand", playerName: "Alex" });
    const id = "corporate-sector:US:manufacturing:US-manufacturing";
    const stock = 22_982_142.85714286;
    world.corporateSectors = { [id]: {
      id,
      corporationId: "US-manufacturing",
      countryId: "US",
      stateId: null,
      sectorType: "manufacturing",
      capitalStock: stock,
      producedUnits: stock,
      capacityBookAnchor: 988_232_142.8571429,
      workers: 1_048_125,
      representingUnionId: null,
      forSale: null,
      owner: "corporation",
    } };
    world.corporations = { ["US-manufacturing"]: world.corporations["US-manufacturing"]! };
    rebuildCorporatePlantInputDemand(world);

    // Exact Game `computeRawSupplyDemand` result executed from immutable
    // source 01797b2708. It seeds 50k stabilizers, uses daily nameplate value
    // 329,410,714.2857143 and rates energy=.15 / iron=.10, era scale=69.767;
    // the source 1.5× cap keeps these rows at the unscaled-pressure floor.
    expect(world.commodityPrices.energy!.globalDemand).toBeCloseTo(873_526.7857142858, 5);
    expect(world.commodityPrices.iron!.globalDemand).toBeCloseTo(324_508.9285714286, 5);
    expect(world.commodityPrices.steel!.globalDemand).toBe(41_000);
  });

  it("replays production, realized receipts and depreciated book through public turn/save/reload", () => {
    const options = { era: "1953", countryId: "US", seed: "plants-public-replay", playerName: "Alex" } as const;
    const firstTurn = createWorld(options);
    const initial = JSON.stringify(firstTurn.corporations);
    advanceTurn(firstTurn);

    expect(JSON.stringify(firstTurn.corporations)).not.toBe(initial);
    const assets = Object.values(firstTurn.corporateSectors ?? {});
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.some((asset) => (asset.soldUnits ?? 0) > 0)).toBe(true);
    for (const asset of assets) {
      expect(asset.producedUnits).toBeGreaterThanOrEqual(0);
      expect(asset.soldFraction).toBeLessThanOrEqual(1);
      expect(asset.soldUnits).toBeLessThanOrEqual(asset.producedUnits!);
      expect(asset.realizedRevenue).toBe(firstTurn.corporations[asset.corporationId]!.revenue);
    }

    const restored = deserializeSave(serializeSave(firstTurn, "2026-10-01T00:00:00.000Z"));
    const direct = structuredClone(restored);
    advanceTurn(restored);
    advanceTurn(direct);
    expect(restored.corporateSectors).toEqual(direct.corporateSectors);
    expect(restored.corporations).toEqual(direct.corporations);
    expect(restored.commodityPrices).toEqual(direct.commodityPrices);
  });
});
