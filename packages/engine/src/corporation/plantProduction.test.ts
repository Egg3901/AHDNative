import { describe, expect, it } from "vitest";
import { advancePlantCapitalTurn, DEFAULT_SECTOR_OUTPUT_MIX, EXTRACTION_STRATEGIES } from "./plantCapacity.js";
import { corporatePlantProductionPhase, demandThrottleFactor, sourcePlantDominanceShares, throttleSoldUnits } from "./plantProduction.js";
import { runCorporationTurn } from "./corporationTurn.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import { createWorld } from "../world.js";
import { rngFromState } from "../rng.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { rebuildCorporatePlantInputDemand } from "./plantDemand.js";
import { sourceCrisisMarginPenalty, sourcePlantFinancialLeg, sourceSectorLaborCost } from "./physicalPlantCosts.js";

describe("plants-tier corporate production", () => {
  it("takes a persisted mothballed plant off both output and corporate-input demand", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "plants-mothball-cold", playerName: "Alex" });
    world.corporations = { "US-manufacturing": world.corporations["US-manufacturing"]! };
    const id = "corporate-sector:US:manufacturing:US-manufacturing";
    world.corporateSectors = { [id]: {
      id, corporationId: "US-manufacturing", countryId: "US", stateId: null,
      sectorType: "manufacturing", capitalStock: 10_000, producedUnits: 10_000,
      mothballed: true, workers: 1, representingUnionId: null, forSale: null, owner: "corporation",
    } };
    world.plantMarketDemand = { external: {}, corporateInputs: { steel: 42 } };
    const supplyBefore = world.commodityPrices.steel!.globalSupply;
    rebuildCorporatePlantInputDemand(world);
    expect(world.plantMarketDemand.corporateInputs).toEqual({});
    corporatePlantProductionPhase.run(world, rngFromState(world.meta.rng));
    const asset = world.corporateSectors[id]!;
    expect(asset).toMatchObject({ producedUnits: 0, soldUnits: 0, soldFraction: 0, realizedRevenue: 0 });
    expect(world.commodityPrices.steel!.globalSupply).toBe(supplyBefore);
  });

  it("builds source local and national dominance shares from actual host-currency receipts", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "source-market-shares", playerName: "Alex" });
    const [va, md, ca] = ["VA", "MD", "CA"];
    const assets = {
      "a-va": { id: "a-va", corporationId: "US-manufacturing", countryId: "US", stateId: va, sectorType: "manufacturing", revenue: 1_000 },
      "a-md": { id: "a-md", corporationId: "US-manufacturing", countryId: "US", stateId: md, sectorType: "manufacturing", revenue: 1_000 },
      "b-ca": { id: "b-ca", corporationId: "US-energy", countryId: "US", stateId: ca, sectorType: "manufacturing", revenue: 2_000 },
    } as unknown as NonNullable<typeof world.corporateSectors>;
    const shares = sourcePlantDominanceShares(world, assets);
    expect(shares.get("a-va")).toEqual({ localSharePct: 100, nationalSharePct: 50 });
    expect(shares.get("a-md")).toEqual({ localSharePct: 100, nationalSharePct: 50 });
    expect(shares.get("b-ca")).toEqual({ localSharePct: 100, nationalSharePct: 50 });
  });

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
    world.corporations["US-manufacturing"]!.unlockedTechNodeIds = [];
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
    corporatePlantProductionPhase.run(world, rngFromState(world.meta.rng));

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

  it("uses the source sector base margin independently of the issuer margin", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "asset-base-margin", playerName: "Alex" });
    const id = "corporate-sector:US:manufacturing:US-manufacturing";
    world.corporations = { ["US-manufacturing"]: world.corporations["US-manufacturing"]! };
    world.corporations["US-manufacturing"]!.profitMargin = 35;
    world.corporateSectors = { [id]: {
      id, corporationId: "US-manufacturing", countryId: "US", stateId: null,
      sectorType: "manufacturing", profitMargin: 20, capitalStock: 22_982_142.85714286,
      capacityBookAnchor: 988_232_142.8571429, workers: 1_048_125,
      representingUnionId: null, forSale: null, owner: "corporation",
    } };
    corporatePlantProductionPhase.run(world, rngFromState(world.meta.rng));
    const asset = world.corporateSectors[id]!;
    expect(asset.plantsPnl!.revenue).toBeGreaterThan(0);
    expect(asset.plantsPnl!.operatingCost / asset.plantsPnl!.revenue).toBeCloseTo(0.8, 8);
    expect(asset.profitMargin).toBe(20);
    expect(asset.effectiveProfitMargin).toBeCloseTo(20, 8);
  });

  it("consumes the decaying source crisis financial cost through public turn and saved continuation", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "plant-crisis-public-turn", playerName: "Alex" });
    world.crises = [{
      id: "source-recession", kind: "crisis.recession", name: "Recession", description: "source vector",
      scope: "country", countryIds: ["US"], startTurn: 0, durationTurns: 8,
      effects: [{ type: "profitMargin", value: -7, effectType: "decay" }],
      status: "active", wireMessageOnStart: "", wireMessageOnEnd: "",
    }];
    advanceTurn(world);
    const asset = Object.values(world.corporateSectors ?? {}).find(row => row.countryId === "US" && (row.realizedRevenue ?? 0) > 0)!;
    const pnl = asset.plantsPnl!;
    const penalty = sourceCrisisMarginPenalty(world, "US", world.meta.turn);
    expect(penalty).toBeCloseTo(-6.125, 12);
    expect(pnl.financialLegs).toBeCloseTo(sourcePlantFinancialLeg(pnl.revenue, penalty), 6);
    expect(asset.effectiveProfitMargin).toBeDefined();
    const replay = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    const direct = structuredClone(replay);
    advanceTurn(replay);
    advanceTurn(direct);
    expect(replay.corporateSectors).toEqual(direct.corporateSectors);
    const resumedAsset = replay.corporateSectors![asset.id]!;
    expect(resumedAsset.plantsPnl?.financialLegs).toBeCloseTo(
      sourcePlantFinancialLeg(resumedAsset.plantsPnl!.revenue, sourceCrisisMarginPenalty(replay, resumedAsset.countryId, replay.meta.turn)), 6,
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

  it("retains physical corporate output and input legs at the real asset region before country rollup", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "plants-regional-trade-ledger", playerName: "Alex" });
    const region = Object.values(world.regions).find(row => row.countryId === "US" && !row.corporationHeadquartersOnly)!;
    const id = `corporate-sector:US:manufacturing:${region.id}`;
    world.corporations = { ["US-manufacturing"]: world.corporations["US-manufacturing"]! };
    world.corporateSectors = { [id]: {
      id, corporationId: "US-manufacturing", countryId: "US", stateId: region.id,
      sectorType: "manufacturing", capitalStock: 100_000, workers: 1,
      representingUnionId: null, forSale: null, owner: "corporation",
    } };

    corporatePlantProductionPhase.run(world, rngFromState(world.meta.rng));

    const regionalSupply = world.plantMarketDemand!.corporateOutputSupplyByState![region.id]!;
    const nationalSupply = world.plantMarketDemand!.corporateOutputSupplyByCountry!.US!;
    for (const [commodity, units] of Object.entries(regionalSupply)) {
      expect(units).toBeGreaterThan(0);
      expect(nationalSupply[commodity]).toBeCloseTo(units!, 9);
    }
    const regionalInput = world.plantMarketDemand!.corporateInputsByState![region.id]!;
    const nationalInput = world.plantMarketDemand!.corporateInputsByCountry!.US!;
    for (const [commodity, units] of Object.entries(regionalInput)) {
      expect(nationalInput[commodity]).toBeCloseTo(units!, 9);
    }
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
    corporatePlantProductionPhase.run(world, rngFromState(world.meta.rng));

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
    corporatePlantProductionPhase.run(world, rngFromState(world.meta.rng));
    const corp = world.corporations[corpId]!;
    const receipts = corp.revenue;
    expect(receipts).toBe(world.corporateSectors[baseId]!.realizedRevenue);
    const earningsBefore = corp.earningsHistory.length;
    runCorporationTurn(corp, 30, { outputFactor: 1, marginModifierPP: 0, strikeActive: false }, undefined, true);
    expect(corp.revenue).toBe(receipts);
    expect(corp.earningsHistory.length).toBe(earningsBefore + 1);
  });

  it("settles physical input cost and per-asset profitability on the public turn and retains it after reload", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "asset-pnl-public", playerName: "Alex" });
    const corpId = "US-manufacturing";
    world.corporations[corpId]!.profitMargin = 20;
    world.corporations[corpId]!.effectiveProfitMargin = 20;
    world.corporations[corpId]!.unlockedTechNodeIds = [];
    world.corporations = { [corpId]: world.corporations[corpId]! };
    const id = `corporate-sector:US:manufacturing:${corpId}`;
    world.corporateSectors = {
      [id]: {
        id, corporationId: corpId, countryId: "US", stateId: null,
        sectorType: "manufacturing", capitalStock: 1_000, capacityBookAnchor: 50_000,
        workers: 1, representingUnionId: null, forSale: null, owner: "corporation",
      },
    };

    advanceTurn(world);

    const settled = world.corporateSectors[id]!;
    const sourceLabor = sourceSectorLaborCost({
      revenue: settled.realizedRevenue!, marginPct: 20, type: "manufacturing",
      year: Number(world.meta.date.slice(0, 4)), wageLevel: settled.wageLevel ?? 1,
      unionization: settled.unionization ?? 0, techLaborCostMultiplier: 1,
    });
    expect(settled.plantsPnl?.turn).toBe(world.meta.turn);
    expect(settled.plantsPnl?.revenue).toBe(settled.realizedRevenue);
    expect(settled.plantsPnl?.inputs).toBeGreaterThan(0);
    expect(settled.plantsPnl?.labour).toBeCloseTo(sourceLabor, 8);
    expect(settled.plantsPnl?.upkeep).toBe(0); // source 240-turn ramp starts at zero
    expect(settled.otherOpexAnchorMarginBasis).toBe(0.8);
    expect(settled.plantsPnl?.profit).toBeCloseTo(
      settled.plantsPnl!.revenue - settled.plantsPnl!.totalCost,
      8,
    );
    expect(settled.effectiveProfitMargin).toBeCloseTo(
      Math.min(100, 100 * (1 - settled.plantsPnl!.operatingCost / settled.plantsPnl!.revenue)),
      8,
    );
    expect(settled.effectiveProfitMargin).toBeCloseTo(20, 8);

    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(resumed.corporateSectors?.[id]).toEqual(settled);

    advanceTurn(world);
    advanceTurn(resumed);
    expect(resumed.corporateSectors?.[id]?.plantsPnl).toEqual(world.corporateSectors?.[id]?.plantsPnl);
    expect(resumed.corporateSectors?.[id]?.effectiveProfitMargin).toBe(world.corporateSectors?.[id]?.effectiveProfitMargin);
    expect(resumed.corporateSectors?.[id]?.plantsPnl?.turn).toBe(resumed.meta.turn);
  });

  it("charges back a legacy calibration-time policy stack through public turn and saved continuation", () => {
    const world = createWorld({
      era: "1953", countryId: "US", seed: "legacy-opex-anchor-policy", playerName: "Alex",
    });
    const corpId = "US-manufacturing";
    world.corporations[corpId]!.profitMargin = 35;
    world.corporations[corpId]!.effectiveProfitMargin = 35;
    world.corporations[corpId]!.unlockedTechNodeIds = [];
    world.corporations = { [corpId]: world.corporations[corpId]! };
    const id = `corporate-sector:US:manufacturing:${corpId}`;
    const asset = {
      id, corporationId: corpId, countryId: "US", stateId: null,
      sectorType: "manufacturing" as const, capitalStock: 1_000, capacityBookAnchor: 50_000,
      // Source legacy anchor calibrated at 60.35% cost basis, under +25.35pp
      // of policy; the policy-neutral basis for the 35% base margin is 65%.
      otherOpexPerUnitAnchor: 0,
      otherOpexAnchorMarginBasis: 0.3965,
      workers: 1, representingUnionId: null, forSale: null, owner: "corporation" as const,
    };
    world.corporateSectors = { [id]: asset };

    const resumed = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    advanceTurn(world);
    advanceTurn(resumed);

    const settled = world.corporateSectors![id]!;
    const replayed = resumed.corporateSectors![id]!;
    expect(settled.plantsPnl!.revenue).toBeGreaterThan(0);
    expect(settled.plantsPnl!.otherOpexUncapped).toBeCloseTo(
      settled.plantsPnl!.revenue * (0.65 - 0.3965),
      6,
    );
    expect(settled.otherOpexAnchorMarginBasis).toBe(0.3965);
    expect(replayed).toEqual(settled);

    const continued = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    const direct = structuredClone(continued);
    advanceTurn(continued);
    advanceTurn(direct);
    expect(continued.corporateSectors![id]).toEqual(direct.corporateSectors![id]);

    // Legacy Native anchors with no recorded basis are not guessed from live
    // policy. Save/reload preserves the absence and the turn charges no stack.
    const missingBasis = deserializeSave(serializeSave(world, "2026-10-03T00:00:00.000Z"));
    delete missingBasis.corporateSectors![id]!.otherOpexAnchorMarginBasis;
    const missingBasisReload = deserializeSave(serializeSave(missingBasis, "2026-10-03T00:00:00.000Z"));
    advanceTurn(missingBasisReload);
    expect(missingBasisReload.corporateSectors![id]!.otherOpexAnchorMarginBasis).toBeUndefined();
    expect(missingBasisReload.corporateSectors![id]!.plantsPnl!.otherOpexUncapped).toBe(0);

    const malformedBasis = structuredClone(world);
    malformedBasis.corporateSectors![id]!.otherOpexAnchorMarginBasis = Number.NaN;
    expect(() => deserializeSave(serializeSave(malformedBasis, "2026-10-03T00:00:00.000Z"))).toThrow(
      /invalid otherOpexAnchorMarginBasis/,
    );
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
