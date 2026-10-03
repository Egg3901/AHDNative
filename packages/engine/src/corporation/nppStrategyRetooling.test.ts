import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import type { CommodityType } from "../commodity/constants.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import {
  applyNppSourceStrategyRetools,
  corporationHasStrategy,
  sourceCorporateStrategyStaggerEligible,
  sourceStrategyPriceScore,
} from "./strategyRetooling.js";
import { isBaselineSourceStrategyAvailable } from "./sourceStrategyTechAvailability.js";
import { getSectorStrategy } from "./plantCapacity.js";

describe("AHDGame NPP strategy retooling", () => {
  it("uses the source global-price fallback and baseline tech grants", () => {
    const priceRatio = (commodity: CommodityType) =>
      commodity === "fertilizers" ? 2.3 : commodity === "chemicals" ? 0.8 : 1;
    const standard = getSectorStrategy("chemical_industries", "standard");
    const fertilizerMethod = getSectorStrategy("chemical_industries", "fertilizers");

    // Executed at immutable Game 968: strategyPriceScore returned -.1 for
    // standard and .65 for fertilizers under global fallback ratios of
    // chemicals=.8 and fertilizers=2.3.
    expect(sourceStrategyPriceScore(standard, priceRatio)).toBeCloseTo(-0.1, 12);
    expect(sourceStrategyPriceScore(fertilizerMethod, priceRatio)).toBeCloseTo(0.65, 12);

    // Executed Game getStrategyAvailability with its actual default tree
    // auto-grants: chemistry fertilizers is available in 1953; energy nuclear
    // is not available until its 1950 baseline node has passed.
    expect(isBaselineSourceStrategyAvailable("chemical_industries", "fertilizers", 1953)).toBe(true);
    expect(isBaselineSourceStrategyAvailable("energy", "nuclear", 1953)).toBe(false);
    expect(isBaselineSourceStrategyAvailable("energy", "nuclear", 1960)).toBe(true);
  });

  it("uses the source cohort gate against the persisted Native issuer key", () => {
    const issuerId = "US-chemical_industries";
    // Game's exact parseInt(last-six-hex, 16), NaN→0 behavior on this Native
    // non-ObjectId key gives its turn-8 slot without manufacturing an ObjectId.
    expect(sourceCorporateStrategyStaggerEligible(issuerId, 7)).toBe(false);
    expect(sourceCorporateStrategyStaggerEligible(issuerId, 8)).toBe(true);
  });

  it("checks secondary-sector recipes without changing the issuer's source tech-tree identity", () => {
    const world = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", seed: "npp-secondary-strategy-gate", playerName: "Alex" });
    const energyIssuer = world.corporations["US-energy"]!;

    // Game's chooseNppStrategyRetool iterates candidates from the owned
    // CorporateSector.sectorType, then passes that candidate to
    // getStrategyAvailability with the issuer's own type/tech tree. An energy
    // issuer therefore asks whether its energy tech tree unlocks a valid
    // manufacturing recipe; the cross-sector recipe lookup must not be
    // redirected to (or throw against) the issuer's energy catalog.
    // The exact getStrategyAvailability helper at Game 283fa48 returns
    // { locked: true, reason: "tech" } for this unresearched 2029 input.
    expect(corporationHasStrategy(energyIssuer, "additive_manufacturing", 2029, "manufacturing")).toBe(false);
  });

  it("searches the issuer's remaining eligible assets when its first asset is transitioning", () => {
    const world = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", seed: "npp-multi-asset-retool", playerName: "Alex" });
    const corp = world.corporations["US-chemical_industries"]!;
    corp.ceoType = "npp";
    corp.effectiveProfitMargin = -10;
    for (const row of Object.values(world.commodityPrices)) row.globalPrice = row.basePrice;
    world.commodityPrices.chemicals!.globalPrice = world.commodityPrices.chemicals!.basePrice * 0.8;
    world.commodityPrices.fertilizers!.globalPrice = world.commodityPrices.fertilizers!.basePrice * 2.3;
    world.meta.turn = 8;

    const assets = corporateSectorAssets(world);
    const first = Object.values(assets).find(row => row.corporationId === corp.id)!;
    first.transitionFromStrategyId = "standard";
    first.transitionStartTurn = 7;
    first.transitionCooldownUntilTurn = 31;
    const secondState = Object.values(world.regions).find(row => row.countryId === "US")!;
    const second = { ...first, id: `${first.id}-secondary`, stateId: secondState.id };
    delete second.transitionFromStrategyId;
    delete second.transitionStartTurn;
    delete second.transitionCooldownUntilTurn;
    assets[second.id] = second;

    applyNppSourceStrategyRetools(world);

    expect(first.strategyId ?? "standard").toBe("standard");
    expect(second.strategyId).toBe("fertilizers");
    expect(second.transitionFromStrategyId).toBe("standard");
  });

  it("does not run private NPP strategy decisions for suspended or state-owned issuers", () => {
    for (const blockedState of ["suspended", "state-owned"] as const) {
      const world = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", seed: `npp-retool-${blockedState}`, playerName: "Alex" });
      const corp = world.corporations["US-chemical_industries"]!;
      const asset = Object.values(corporateSectorAssets(world)).find(row => row.corporationId === corp.id)!;
      corp.ceoType = "npp";
      corp.effectiveProfitMargin = -10;
      if (blockedState === "suspended") corp.suspended = true;
      else corp.countryOwnerId = "US";
      for (const row of Object.values(world.commodityPrices)) row.globalPrice = row.basePrice;
      world.commodityPrices.chemicals!.globalPrice = world.commodityPrices.chemicals!.basePrice * 0.8;
      world.commodityPrices.fertilizers!.globalPrice = world.commodityPrices.fertilizers!.basePrice * 2.3;
      world.meta.turn = 8;

      applyNppSourceStrategyRetools(world);

      expect(asset.strategyId).toBeUndefined();
      expect(asset.transitionStartTurn).toBeUndefined();
    }
  });

  it("retools a distressed private NPP issuer after production and preserves it on save", () => {
    const world = createWorld({ era: "1953", countryId: "US", homeRegionId: "DC", seed: "npp-global-fallback-retool", playerName: "Alex" });
    const corp = world.corporations["US-chemical_industries"]!;
    const asset = Object.values(corporateSectorAssets(world)).find(row => row.corporationId === corp.id)!;
    corp.ceoType = "npp";
    delete corp.ceoId;
    corp.ceoVacant = false;
    corp.effectiveProfitMargin = -10;
    asset.strategyId = "standard";
    asset.capitalStock = 10_000;
    asset.capacityBookAnchor = 50_000_000;

    for (const row of Object.values(world.commodityPrices)) row.globalPrice = row.basePrice;
    world.commodityPrices.chemicals!.globalPrice = world.commodityPrices.chemicals!.basePrice * 0.8;
    world.commodityPrices.fertilizers!.globalPrice = world.commodityPrices.fertilizers!.basePrice * 2.3;
    world.meta.turn = 7;
    advanceTurn(world);

    expect(world.meta.turn).toBe(8);
    expect(asset).toMatchObject({
      strategyId: "fertilizers",
      transitionFromStrategyId: "standard",
      transitionStartTurn: 8,
      transitionCooldownUntilTurn: 32,
      retoolRescaleApplied: true,
    });
    // The source NPP decision is written after this turn's production pass;
    // this turn therefore clears the previous recipe and the new blend starts
    // on the next public advanceTurn.
    expect(Object.keys(asset.soldByCommodity ?? {})).toEqual(["chemicals", "plastics"]);
    // Immutable Game chooseNppStrategyRetool output for this exact score
    // vector and 10,000 units of source stock is 13,341.671878257246. Game
    // runs its plants phase first, reducing stock to 9,995 with
    // (1 - CAPITAL_DEPRECIATION_PER_TURN = 0.9995), then the NPP chooser
    // applies the same linear rescale ratio. The resulting stock is therefore
    // the source chooser result × 0.9995, as independently verified by
    // sectorTurn.plants.test.ts and the exact immutable chooser helper.
    const sourcePreProductionStock = 13_341.671878257246;
    const sourceDepreciationPerTurn = 0.0005;
    expect(asset.capitalStock).toBeCloseTo(sourcePreProductionStock * (1 - sourceDepreciationPerTurn), 7);

    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(resumed.corporateSectors?.[asset.id]).toEqual(asset);
    const twin = structuredClone(resumed);
    advanceTurn(resumed);
    advanceTurn(twin);
    expect(resumed.corporateSectors?.[asset.id]).toEqual(twin.corporateSectors?.[asset.id]);
    expect(resumed.corporateSectors?.[asset.id]?.transitionFromStrategyId).toBe("standard");
    expect(resumed.corporateSectors?.[asset.id]?.producedUnits).toBeGreaterThan(0);
    expect(Object.keys(resumed.corporateSectors?.[asset.id]?.soldByCommodity ?? {})).toContain("fertilizers");
  });
});
