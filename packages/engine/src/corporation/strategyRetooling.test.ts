import { describe, expect, it } from "vitest";
import { effectiveExtractionStrategyRates, effectiveSectorStrategyRates, strategyTransitionMarginModifier } from "./strategyRetooling.js";
import { executeAction } from "../actions/execute.js";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";

describe("corporation strategy transition source vectors", () => {
  it("matches Game's 12-turn standard-to-iron-mine rate interpolation", () => {
    // AHDGame cb66acdf0129616b8a09902727e9b58715c8bacb:
    // getEffectiveStrategyRates("extraction", "iron_mining", "standard", 0, 6).
    // The source blend rounds each rate to four decimal places.
    const result = effectiveExtractionStrategyRates({
      sectorType: "extraction",
      strategyId: "iron_mining",
      transitionFromStrategyId: "standard",
      transitionStartTurn: 0,
    }, 6);

    expect(result).toEqual({
      supply: {
        iron: 0.515,
        coal: 0.11,
        oil: 0.07,
        rare_earth: 0.07,
        natural_gas: 0.07,
        timber: 0.06,
      },
      demand: {
        energy: 0.225,
        vehicles: 0.15,
        freight: 0.11,
        chemicals: 0.04,
        construction_services: 0.015,
        steel: 0.025,
        ordnance: 0.04,
      },
      isTransitioning: true,
      progress: 0.5,
    });
  });

  it("uses the destination rates after the twelve-turn source transition", () => {
    expect(effectiveExtractionStrategyRates({
      sectorType: "extraction",
      strategyId: "iron_mining",
      transitionFromStrategyId: "standard",
      transitionStartTurn: 0,
    }, 12)).toEqual({
      supply: { iron: 0.78 },
      demand: { energy: 0.25, vehicles: 0.15, freight: 0.12, steel: 0.05, ordnance: 0.08 },
      isTransitioning: false,
      progress: 1,
    });
  });

  it("retools an authored manufacturing issuer with the source non-extraction ratio and midpoint recipe", () => {
    // Immutable Game `capacityRescaleRatio('manufacturing','standard','heavy_metals')`
    // and `getEffectiveStrategyRates(..., transitionStart=0, currentTurn=6)`.
    const world = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", seed: "corp-source-manufacturing-retool", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    const asset = Object.values(corporateSectorAssets(world)).find(row => row.corporationId === corp.id)!;
    asset.capitalStock = 10_000;
    asset.capacityBookAnchor = 1_000_000;
    asset.otherOpexPerUnitAnchor = 154;
    world.player.cash = Math.max(world.player.cash, corp.sharePrice * 10 + 1);
    expect(executeAction(world, "player", "buyShares", { corpId: corp.id, shares: 10 }).ok).toBe(true);
    expect(executeAction(world, "player", "voteCeo", { corpId: corp.id, candidateId: "player" }).ok).toBe(true);
    expect(executeAction(world, "player", "acceptCeoAppointment", { corpId: corp.id }).ok).toBe(true);

    const result = executeAction(world, "player", "setCorporateSectorStrategy", {
      corpId: corp.id,
      sectorId: asset.id,
      strategyId: "heavy_metals",
    });
    expect(result.ok).toBe(true);
    expect(asset.capitalStock).toBeCloseTo(6_875, 8);
    expect(asset.otherOpexPerUnitAnchor).toBeCloseTo(154 / 0.6875, 8);
    expect(asset.capacityBookAnchor).toBe(1_000_000);
    expect(effectiveSectorStrategyRates(asset, world.meta.turn + 6)).toMatchObject({
      supply: { steel: 0.475, building_materials: 0.1 },
      demand: {
        energy: 0.205,
        iron: 0.16,
        coal: 0.125,
        electronics: 0.04,
        freight: 0.09,
        real_estate_services: 0.015,
        plastics: 0.05,
      },
      isTransitioning: true,
      progress: 0.5,
    });
    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(resumed.corporateSectors![asset.id]).toEqual(asset);
  });

  it("applies the source transition margin penalty in proportion to progress", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "source-transition-margin", playerName: "Alex" });
    const corp = world.corporations["US-extraction"]!;
    const asset = Object.values(corporateSectorAssets(world)).find(row => row.corporationId === corp.id)!;
    asset.strategyId = "iron_mining";
    asset.transitionFromStrategyId = "standard";
    asset.transitionStartTurn = world.meta.turn - 6;
    asset.revenue = 10_000;
    // Game sectorDetailSections: source STRATEGY_TRANSITION_MARGIN_PENALTY
    // (-5 pp) multiplied by the current 6/12 transition progress.
    expect(strategyTransitionMarginModifier(world, corp.id)).toBe(-2.5);
  });

  it("retools through the public CEO/shareholder route and preserves transition through replay", () => {
    const world = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", seed: "corp-source-retool-flow", playerName: "Alex" });
    const corp = world.corporations["US-extraction"]!;
    const asset = Object.values(corporateSectorAssets(world)).find(row => row.corporationId === corp.id)!;
    const sourceStock = 10_000;
    const sourceBook = 50_000_000;
    asset.capitalStock = sourceStock;
    asset.capacityBookAnchor = sourceBook;
    asset.buildQueue = [{ unitsOrdered: 250, costPaidAnchor: 1_250_000, startTurn: world.meta.turn, onlineTurn: world.meta.turn + 5 }];
    world.commodityPrices.iron!.globalSupply = 1_000_000;
    world.commodityPrices.iron!.globalDemand = 1;

    // Earn the CEO seat through the public purchase, weighted shareholder
    // vote and acceptance actions. The test does not inject a controlling
    // shareholder block or a pending appointment.
    world.player.cash = Math.max(world.player.cash, corp.sharePrice * 10 + 1);
    expect(executeAction(world, "player", "buyShares", { corpId: corp.id, shares: 10 }).ok).toBe(true);
    expect(executeAction(world, "player", "voteCeo", { corpId: corp.id, candidateId: "player" }).ok).toBe(true);
    expect(executeAction(world, "player", "acceptCeoAppointment", { corpId: corp.id }).ok).toBe(true);

    const liquidBefore = corp.liquidCapital;
    corp.liquidCapital = Math.max(corp.liquidCapital, corp.revenue);
    const fee = asset.revenue ?? corp.revenue;
    const expectedFee = fee / 7 * 0.25;
    const started = executeAction(world, "player", "setCorporateSectorStrategy", {
      corpId: corp.id,
      sectorId: asset.id,
      strategyId: "iron_mining",
    });
    expect(started.ok).toBe(true);
    expect(asset).toMatchObject({
      strategyId: "iron_mining",
      transitionFromStrategyId: "standard",
      transitionStartTurn: world.meta.turn,
      transitionCooldownUntilTurn: world.meta.turn + 24,
      retoolRescaleApplied: true,
    });
    // Immutable Game cb66 capacityRescaleRatio("extraction", "standard", "iron_mining").
    expect(asset.capitalStock).toBeCloseTo(sourceStock * 0.5800118976799523, 8);
    expect(asset.capacityBookAnchor).toBe(sourceBook);
    expect(asset.buildQueue?.[0]?.unitsOrdered).toBeCloseTo(250 * 0.5800118976799523, 10);
    expect(asset.buildQueue?.[0]?.costPaidAnchor).toBe(1_250_000);
    expect(corp.liquidCapital).toBeCloseTo(Math.max(liquidBefore, corp.revenue) - expectedFee, 6);

    const saved = serializeSave(world, "2026-10-02T00:00:00.000Z");
    const resumed = deserializeSave(saved);
    const resumedAsset = resumed.corporateSectors![asset.id]!;
    expect(resumedAsset).toEqual(asset);
    advanceTurn(world);
    advanceTurn(resumed);
    expect(resumed.corporateSectors![asset.id]).toEqual(world.corporateSectors![asset.id]);
    expect(resumed.plantMarketDemand).toEqual(world.plantMarketDemand);
  });

  it("finishes the 12-turn transition and clears the source cooldown across save and replay", () => {
    const world = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", seed: "corp-source-retool-full-cycle", playerName: "Alex" });
    const corp = world.corporations["US-extraction"]!;
    const asset = Object.values(corporateSectorAssets(world)).find(row => row.corporationId === corp.id)!;
    asset.capitalStock = 10_000;
    asset.capacityBookAnchor = 50_000_000;
    world.commodityPrices.iron!.globalSupply = 1_000_000;
    world.commodityPrices.iron!.globalDemand = 1;

    world.player.cash = Math.max(world.player.cash, corp.sharePrice * 10 + 1);
    expect(executeAction(world, "player", "buyShares", { corpId: corp.id, shares: 10 }).ok).toBe(true);
    expect(executeAction(world, "player", "voteCeo", { corpId: corp.id, candidateId: "player" }).ok).toBe(true);
    expect(executeAction(world, "player", "acceptCeoAppointment", { corpId: corp.id }).ok).toBe(true);
    corp.liquidCapital = Math.max(corp.liquidCapital, corp.revenue);
    expect(executeAction(world, "player", "setCorporateSectorStrategy", {
      corpId: corp.id, sectorId: asset.id, strategyId: "iron_mining",
    }).ok).toBe(true);

    // Continue from a serialized mid-transition checkpoint. Each side advances
    // through the same public turn path; the resumed copy must not lose or
    // restart the strategy's source 12-turn clock.
    for (let i = 0; i < 6; i++) advanceTurn(world);
    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    for (let i = 6; i < 11; i++) {
      advanceTurn(world);
      advanceTurn(resumed);
    }
    const whileTransitioning = executeAction(world, "player", "setCorporateSectorStrategy", {
      corpId: corp.id, sectorId: asset.id, strategyId: "oil_gas",
    });
    expect(whileTransitioning).toMatchObject({
      ok: false,
      error: "Already transitioning to a new strategy. Wait for completion.",
    });
    advanceTurn(world);
    advanceTurn(resumed);
    const live = world.corporateSectors![asset.id]!;
    const replayed = resumed.corporateSectors![asset.id]!;
    expect(replayed).toEqual(live);
    expect(live.transitionFromStrategyId).toBeUndefined();
    expect(live.transitionStartTurn).toBeUndefined();
    // Game sectorTurn cleanup clears this timestamp at the 12-turn transition
    // boundary despite the initial command recording a +24 turn value.
    expect(live.transitionCooldownUntilTurn).toBeUndefined();
    expect(live.strategyId).toBe("iron_mining");
    const atExpiry = executeAction(world, "player", "setCorporateSectorStrategy", {
      corpId: corp.id, sectorId: asset.id, strategyId: "oil_gas",
    });
    expect(atExpiry.ok).toBe(true);
    expect(asset.transitionStartTurn).toBe(12);
    expect(asset.transitionCooldownUntilTurn).toBe(36);
  });

  it("rejects non-CEO, unaffordable, and same-strategy retools without partial writes", () => {
    const world = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", seed: "corp-source-retool-guards", playerName: "Alex" });
    const corp = world.corporations["US-extraction"]!;
    const asset = Object.values(corporateSectorAssets(world)).find(row => row.corporationId === corp.id)!;
    corp.ceoId = "npc";
    corp.ceoType = "npp";
    corp.ceoVacant = false;
    const beforeUnauthorized = JSON.stringify({ corp, asset });
    expect(executeAction(world, "player", "setCorporateSectorStrategy", {
      corpId: corp.id, sectorId: asset.id, strategyId: "iron_mining",
    })).toMatchObject({ ok: false });
    expect(JSON.stringify({ corp, asset })).toBe(beforeUnauthorized);

    corp.ceoId = "player";
    corp.ceoType = "player";
    corp.liquidCapital = Math.max(corp.liquidCapital, corp.revenue);
    asset.strategyId = "iron_mining";
    asset.transitionFromStrategyId = "standard";
    asset.transitionStartTurn = world.meta.turn;
    const beforeTransitionRefusal = JSON.stringify({ corp, asset });
    expect(executeAction(world, "player", "setCorporateSectorStrategy", {
      corpId: corp.id, sectorId: asset.id, strategyId: "oil_gas",
    })).toMatchObject({ ok: false, error: "Already transitioning to a new strategy. Wait for completion." });
    expect(JSON.stringify({ corp, asset })).toBe(beforeTransitionRefusal);

    delete asset.transitionFromStrategyId;
    delete asset.transitionStartTurn;
    asset.strategyId = "standard";
    asset.transitionCooldownUntilTurn = world.meta.turn + 1;
    const beforeCooldownRefusal = JSON.stringify({ corp, asset });
    expect(executeAction(world, "player", "setCorporateSectorStrategy", {
      corpId: corp.id, sectorId: asset.id, strategyId: "iron_mining",
    })).toMatchObject({ ok: false, error: `Strategy change on cooldown. 1 turns remaining.` });
    expect(JSON.stringify({ corp, asset })).toBe(beforeCooldownRefusal);

    delete asset.transitionCooldownUntilTurn;
    corp.liquidCapital = 0;
    const beforeSameStrategy = JSON.stringify({ corp, asset });
    expect(executeAction(world, "player", "setCorporateSectorStrategy", {
      corpId: corp.id, sectorId: asset.id, strategyId: "standard",
    })).toMatchObject({ ok: false, error: "Already using this strategy" });
    expect(JSON.stringify({ corp, asset })).toBe(beforeSameStrategy);
    const beforeUnaffordable = JSON.stringify({ corp, asset });
    expect(executeAction(world, "player", "setCorporateSectorStrategy", {
      corpId: corp.id, sectorId: asset.id, strategyId: "iron_mining",
    })).toMatchObject({ ok: false, error: "Insufficient corporation liquid capital for retooling" });
    expect(JSON.stringify({ corp, asset })).toBe(beforeUnaffordable);
  });

  it("uses the source shortage destination waiver and half-window transition", () => {
    const world = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", seed: "corp-source-shortage-retool", playerName: "Alex" });
    const corp = world.corporations["US-extraction"]!;
    const asset = Object.values(corporateSectorAssets(world)).find(row => row.corporationId === corp.id)!;
    world.player.cash = Math.max(world.player.cash, corp.sharePrice * 10 + 1);
    expect(executeAction(world, "player", "buyShares", { corpId: corp.id, shares: 10 }).ok).toBe(true);
    expect(executeAction(world, "player", "voteCeo", { corpId: corp.id, candidateId: "player" }).ok).toBe(true);
    expect(executeAction(world, "player", "acceptCeoAppointment", { corpId: corp.id }).ok).toBe(true);
    corp.liquidCapital = 0;
    world.commodityPrices.iron!.globalSupply = 49;
    world.commodityPrices.iron!.globalDemand = 100;
    const startTurn = world.meta.turn;

    const started = executeAction(world, "player", "setCorporateSectorStrategy", {
      corpId: corp.id,
      sectorId: asset.id,
      strategyId: "iron_mining",
    });

    expect(started).toMatchObject({ ok: true, message: expect.stringContaining("6-turn transition") });
    expect(asset).toMatchObject({
      strategyId: "iron_mining",
      transitionFromStrategyId: "standard",
      transitionStartTurn: startTurn - 6,
      transitionCooldownUntilTurn: startTurn + 24,
    });
    expect(corp.liquidCapital).toBe(0);
  });

  it("fails closed on source-era and source-tech gated methods without unlock state", () => {
    const eraWorld = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", seed: "corp-source-retool-era-gate", playerName: "Alex" });
    const eraCorp = eraWorld.corporations["US-manufacturing"]!;
    const eraAsset = Object.values(corporateSectorAssets(eraWorld)).find(row => row.corporationId === eraCorp.id)!;
    eraWorld.player.cash = Math.max(eraWorld.player.cash, eraCorp.sharePrice * 10 + 1);
    expect(executeAction(eraWorld, "player", "buyShares", { corpId: eraCorp.id, shares: 10 }).ok).toBe(true);
    expect(executeAction(eraWorld, "player", "voteCeo", { corpId: eraCorp.id, candidateId: "player" }).ok).toBe(true);
    expect(executeAction(eraWorld, "player", "acceptCeoAppointment", { corpId: eraCorp.id }).ok).toBe(true);

    const beforeEraRefusal = JSON.stringify({ eraCorp, eraAsset });
    expect(executeAction(eraWorld, "player", "setCorporateSectorStrategy", {
      corpId: eraCorp.id, sectorId: eraAsset.id, strategyId: "electronics_manufacturing",
    })).toMatchObject({ ok: false, error: "This production method is not available in this era yet." });
    expect(JSON.stringify({ eraCorp, eraAsset })).toBe(beforeEraRefusal);

    const techWorld = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", seed: "corp-source-retool-tech-gate", playerName: "Alex" });
    const techCorp = techWorld.corporations["US-energy"]!;
    const techAsset = Object.values(corporateSectorAssets(techWorld)).find(row => row.corporationId === techCorp.id)!;
    techWorld.player.cash = Math.max(techWorld.player.cash, techCorp.sharePrice * 10 + 1);
    expect(executeAction(techWorld, "player", "buyShares", { corpId: techCorp.id, shares: 10 }).ok).toBe(true);
    expect(executeAction(techWorld, "player", "voteCeo", { corpId: techCorp.id, candidateId: "player" }).ok).toBe(true);
    expect(executeAction(techWorld, "player", "acceptCeoAppointment", { corpId: techCorp.id }).ok).toBe(true);
    const beforeTechRefusal = JSON.stringify({ techCorp, techAsset });
    expect(executeAction(techWorld, "player", "setCorporateSectorStrategy", {
      corpId: techCorp.id, sectorId: techAsset.id, strategyId: "nuclear",
    })).toMatchObject({ ok: false, error: "Unlock this production method in the corporate technology tree first." });
    expect(JSON.stringify({ techCorp, techAsset })).toBe(beforeTechRefusal);
  });
});
