import { describe, expect, it } from "vitest";
import { advancePlantCapitalTurn, DEFAULT_SECTOR_OUTPUT_MIX, EXTRACTION_STRATEGIES } from "./plantCapacity.js";
import { corporatePlantProductionPhase, demandThrottleFactor, throttleSoldUnits } from "./plantProduction.js";
import { runCorporationTurn } from "./corporationTurn.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
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

  it("advances a source-authored extraction method through save/reload and deterministic turns", () => {
    const one = createWorld({ era: "1953", countryId: "US", seed: "rare-earth-strategy-turn", playerName: "Alex" });
    const id = "corporate-sector:US:extraction:US-extraction";
    one.corporateSectors = { [id]: {
      id,
      corporationId: "US-extraction",
      countryId: "US",
      stateId: null,
      sectorType: "extraction",
      strategyId: "rare_earth_mining",
      capitalStock: 10_000,
      capacityBookAnchor: 12_541_666.666666665,
      workers: 1,
      representingUnionId: null,
      forSale: null,
      owner: "corporation",
    } };
    one.corporations = { ["US-extraction"]: one.corporations["US-extraction"]! };
    one.commodityPrices.rare_earth!.globalSupply = 1_000_000_000;
    one.commodityPrices.rare_earth!.globalDemand = 1_000_000_000;

    // Immutable Game cb66acdf helpers independently executed with the
    // rare_earth_mining source recipe, era-unit scale 69.76744186046511, 10k
    // daily nameplate units, 0.05% depreciation, and full demand clearing:
    // capacityPricePerUnit=1254.1666666666665 and produced/sold=9995/day.
    // The recipe and list price follow persisted strategyId, not standard.
    expect(EXTRACTION_STRATEGIES.rare_earth_mining.supply).toEqual({ rare_earth: 0.72 });
    const two = deserializeSave(serializeSave(one, "2026-10-01T00:00:00.000Z"));
    advanceTurn(one);
    advanceTurn(two);
    const firstAsset = one.corporateSectors![id]!;
    const replayAsset = two.corporateSectors![id]!;
    expect(firstAsset.strategyId).toBe("rare_earth_mining");
    expect(firstAsset.producedUnits).toBeCloseTo(9_995, 8);
    expect(firstAsset.soldUnits).toBeCloseTo(9_995, 8);
    expect(firstAsset.realizedRevenue).toBeGreaterThan(0);
    expect(one.plantMarketDemand?.corporateInputs.ordnance).toBeGreaterThan(0);
    expect(one.plantMarketDemand?.corporateInputs.chemicals).toBeGreaterThan(0);
    expect(replayAsset).toEqual(firstAsset);
    const resumed = deserializeSave(serializeSave(one, "2026-10-08T00:00:00.000Z"));
    const twin = deserializeSave(serializeSave(one, "2026-10-08T00:00:00.000Z"));
    advanceTurn(resumed);
    advanceTurn(twin);
    expect(resumed.corporateSectors![id]).toEqual(twin.corporateSectors![id]);
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

    // Game `computeRawSupplyDemand` at immutable source 01797b2708, executed
    // directly: the floor/cap pass runs in pre-calibration units and the
    // caller calibrates after, so a floor-bound row reads floor x calibration
    // (energy 873,526.7857142858 x 0.55). The prior expectation pinned the
    // uncalibrated floor, overstating calibrated rows by 1 / calibration.
    expect(world.commodityPrices.energy!.globalDemand).toBeCloseTo(480_439.7321428572, 5);
    expect(world.commodityPrices.iron!.globalDemand).toBeCloseTo(146_029.01785714287, 5); // cap-bound row reads 1.5x supply post calibration
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

  it("accumulates every asset's receipts into the owning corporation instead of last-asset-wins", () => {
    // Source sectorCalculations.ts at 01797b2708 sums each sector's anchor
    // hourly revenue into corpRevenue (corpRevenue += r.hourlyRevenue), then
    // re-denominates into corp-home currency on write. Source-executed FX
    // vectors from the pinned commit (corporationCapital.ts):
    // readCorpEconomicAnchor(1.2M at 2.5) = 480k anchor,
    // readCorpEconomicAnchor(0.8M at 0.5) = 1.6M anchor,
    // writeCorpEconomicLocal(2.08M at 2.5) = 5.2M corp-local.
    const world = createWorld({ era: "1953", countryId: "US", seed: "plants-multi-asset", playerName: "Alex" });
    const corpId = "US-manufacturing";
    world.corporations = { [corpId]: world.corporations[corpId]! };
    const regionId = Object.keys(world.regions).find((key) => world.regions[key]!.countryId === "US")!;
    const baseId = `corporate-sector:US:manufacturing:${corpId}`;
    const secondId = `${baseId}:regional`;
    world.exchangeRates["US"] = { ...world.exchangeRates["US"]!, rate: 2.5 };
    world.corporateSectors = {
      [baseId]: {
        id: baseId, corporationId: corpId, countryId: "US", stateId: null,
        sectorType: "manufacturing", workers: 1, representingUnionId: null,
        forSale: null, owner: "corporation",
      },
      [secondId]: {
        id: secondId, corporationId: corpId, countryId: "US", stateId: regionId,
        sectorType: "manufacturing", workers: 1, representingUnionId: null,
        forSale: null, owner: "corporation",
      },
    };
    const assets = corporateSectorAssets(world);
    assets[secondId]!.capitalStock = (assets[secondId]!.capitalStock ?? 0) / 2;
    corporatePlantProductionPhase.run(world);

    const first = world.corporateSectors[baseId]!;
    const second = world.corporateSectors[secondId]!;
    expect(first.realizedRevenue).toBeGreaterThan(0);
    expect(second.realizedRevenue).toBeGreaterThan(0);
    expect(second.realizedRevenue).toBeLessThan(first.realizedRevenue!);
    // The bug under test wrote corporation.revenue inside the per-asset loop,
    // so the second (smaller) receipt overwrote the first. The source contract
    // is the sum, reported in corp-home currency through the anchor total.
    expect(world.corporations[corpId]!.revenue).toBeCloseTo(
      first.realizedRevenue! + second.realizedRevenue!, 6,
    );
    // Recorded per-asset local revenue and labour outputs are preserved.
    expect(first.soldUnits).toBeGreaterThan(second.soldUnits!);
    expect(first.workers).toBeGreaterThan(second.workers!);
  });

  it("consumes plant receipts once in runCorporationTurn without synthetic regrowth", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "plants-once", playerName: "Alex" });
    const corpId = "US-manufacturing";
    world.corporations = { [corpId]: world.corporations[corpId]! };
    const baseId = `corporate-sector:US:manufacturing:${corpId}`;
    world.corporateSectors = {
      [baseId]: {
        id: baseId, corporationId: corpId, countryId: "US", stateId: null,
        sectorType: "manufacturing", workers: 1, representingUnionId: null,
        forSale: null, owner: "corporation",
      },
    };
    corporatePlantProductionPhase.run(world);
    const corp = world.corporations[corpId]!;
    const receipts = corp.revenue;
    expect(receipts).toBe(world.corporateSectors[baseId]!.realizedRevenue);
    const earningsBefore = corp.earningsHistory.length;
    runCorporationTurn(corp, 30, { outputFactor: 1, marginModifierPP: 0, strikeActive: false }, undefined, true);
    expect(corp.revenue).toBe(receipts);
    expect(corp.earningsHistory.length).toBe(earningsBefore + 1);
  });

  it("bounds calibrated demand at 1.5x supply in post-calibration units", () => {
    // Source-executed vector from computeRawSupplyDemand at 01797b2708
    // (ledgerUnitScale 69.767, energy calibration 0.55): a 1.6M-unit energy
    // input leg against 50k supply reads ledger demand 136,363.64 pre
    // calibration (supply x 1.5 / 0.55), truncated 832,500 in calibrated
    // units, so the caller-calibrated demand is exactly 75,000 = 1.5x supply.
    // The native bug compared already-calibrated demand against the
    // pre-calibration cap and read 136,364 (1.82x supply).
    const world = createWorld({ era: "1953", countryId: "US", seed: "plants-cap-bound", playerName: "Alex" });
    const corpId = "US-manufacturing";
    world.corporations = { [corpId]: world.corporations[corpId]! };
    const id = `corporate-sector:US:manufacturing:${corpId}`;
    const base = world.commodityPrices;
    const mix = DEFAULT_SECTOR_OUTPUT_MIX["manufacturing"] ?? {};
    let unitYield = 0;
    for (const [commodity, rate] of Object.entries(mix)) {
      unitYield += (rate ?? 0) / base[commodity]!.basePrice;
    }
    const mixPrice = 1 / unitYield;
    const targetLeg = 1_600_000;
    const produced = targetLeg * base["energy"]!.basePrice / (0.15 * mixPrice);
    world.corporateSectors = {
      [id]: {
        id, corporationId: corpId, countryId: "US", stateId: null,
        sectorType: "manufacturing", capitalStock: produced, producedUnits: produced,
        capacityBookAnchor: 0, workers: 1, representingUnionId: null,
        forSale: null, owner: "corporation",
      },
    };
    base["energy"]!.globalDemand = 0;
    base["energy"]!.globalSupply = 50_000;
    rebuildCorporatePlantInputDemand(world);
    expect(world.commodityPrices["energy"]!.globalDemand).toBeCloseTo(75_000, 3);
  });
});
