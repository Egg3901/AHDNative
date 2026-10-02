import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { executeAction } from "../actions/execute.js";
import { deserializeSave, serializeSave } from "../save.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { EXTRACTION_FOUNDING_BUILD_DISCOUNT, EXTRACTION_STARTER_BUILD_TURNS, EXTRACTION_STARTER_UNITS, SECTOR_EXPANSION_BASE_COST_ANCHOR, sourceCapacityEraPriceIndex } from "./operations.js";
import { anchorToLocal, rateForLocalBalance } from "../forex/conversion.js";
import { capacityPricePerUnitAnchor, corporateSectorBasePrices } from "../corporation/plantCapacity.js";

const options = { seed: "regional-extraction-entry", playerName: "Tester", countryId: "US", era: "2019" } as const;

describe("regional extraction operation entry", () => {
  it("opens and saves a source resource operation from the public CEO action", () => {
    const world = createWorld(options);
    const corporation = world.corporations["US-extraction"]!;
    corporation.ceoId = "player";
    corporation.ceoType = "player";
    corporation.ceoVacant = false;
    corporation.liquidCapital = 1_000_000;
    const before = corporation.liquidCapital;

    const result = executeAction(world, "player", "expandRegionalExtraction", { regionId: "TX" });

    expect(result.ok).toBe(true);
    const operation = Object.values(corporateSectorAssets(world)).find((asset) => asset.corporationId === "US-extraction" && asset.stateId === "TX")!;
    const starterCost = operation.buildQueue?.[0]?.costPaidAnchor ?? 0;
    const acumen = world.player.stats?.businessAcumen ?? 5.5;
    const prime = world.centralBanks.US!.primeRate;
    const costOfLiving = world.regionalMetrics.TX?.["economic.costOfLiving"]?.value ?? 100;
    const rateMultiplier = Math.max(0.5, 1 + (prime / 10) * Math.max(0, 1 - (acumen - 5.5) * 0.06));
    const acumenMultiplier = Math.max(0.5, 1 - (acumen - 5.5) * 0.03);
    const hostMultiplier = Math.max(0.6, Math.min(1.6, costOfLiving / 100));
    // The sole national extraction issuer holds 100% of corporate-sector share.
    // Game's no-rival density floor is 0.35, so the 3x monopoly toll becomes 1.7x.
    const sourceStarterQuote = Math.round(
      EXTRACTION_STARTER_UNITS * capacityPricePerUnitAnchor("extraction", corporateSectorBasePrices(world), undefined, Number(world.meta.date.slice(0, 4))) * 1.7 * rateMultiplier * acumenMultiplier * hostMultiplier * EXTRACTION_FOUNDING_BUILD_DISCOUNT,
    );
    expect(starterCost).toBe(sourceStarterQuote);
    expect(operation.capitalStock).toBe(0);
    expect(operation.capacityBookAnchor).toBe(0);
    expect(operation.buildQueue).toEqual([expect.objectContaining({
      unitsOrdered: EXTRACTION_STARTER_UNITS,
      costPaidAnchor: starterCost,
      startTurn: world.meta.turn,
      onlineTurn: world.meta.turn + EXTRACTION_STARTER_BUILD_TURNS,
      smooth: true,
    })]);
    expect(operation.constructionInProgressAnchor).toBe(starterCost);
    const totalCost = anchorToLocal(SECTOR_EXPANSION_BASE_COST_ANCHOR + starterCost, rateForLocalBalance(world, "US"));
    expect(world.corporations["US-extraction"]!.liquidCapital).toBe(before - totalCost);
    expect(Object.values(corporateSectorAssets(world))).toContainEqual(expect.objectContaining({
      corporationId: "US-extraction", countryId: "US", stateId: "TX", sectorType: "extraction", workers: 500,
    }));
    const reloaded = deserializeSave(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    expect(Object.values(corporateSectorAssets(reloaded))).toContainEqual(expect.objectContaining({
      corporationId: "US-extraction", countryId: "US", stateId: "TX", sectorType: "extraction", workers: 500,
      capitalStock: 0, capacityBookAnchor: 0, buildQueue: operation.buildQueue,
    }));
  });

  it("uses the source capacity price column and source era-scaled entry fee anchors", () => {
    expect(sourceCapacityEraPriceIndex(1953)).toBe(1);
    expect(sourceCapacityEraPriceIndex(1978)).toBe(1.4);
    expect(sourceCapacityEraPriceIndex(1985)).toBe(2.6);
    expect(sourceCapacityEraPriceIndex(1995)).toBe(3.6);
    expect(sourceCapacityEraPriceIndex(2019)).toBe(5);
  });

  it("rejects an NPC or vacant CEO, a no-deposit region, and a duplicate without charging the company", () => {
    const world = createWorld(options);
    const corporation = world.corporations["US-extraction"]!;
    corporation.liquidCapital = 1_000_000;
    const before = corporation.liquidCapital;
    expect(executeAction(world, "player", "expandRegionalExtraction", { regionId: "TX" }).ok).toBe(false);
    corporation.ceoId = "player";
    corporation.ceoType = "player";
    corporation.ceoVacant = true;
    expect(executeAction(world, "player", "expandRegionalExtraction", { regionId: "TX" }).ok).toBe(false);
    corporation.ceoVacant = false;
    expect(executeAction(world, "player", "expandRegionalExtraction", { regionId: "DC" }).ok).toBe(false);
    expect(executeAction(world, "player", "expandRegionalExtraction", { regionId: "TX" }).ok).toBe(true);
    expect(executeAction(world, "player", "expandRegionalExtraction", { regionId: "TX" }).ok).toBe(false);
    const operation = Object.values(corporateSectorAssets(world)).find((asset) => asset.corporationId === corporation.id && asset.stateId === "TX")!;
    const totalCost = anchorToLocal(SECTOR_EXPANSION_BASE_COST_ANCHOR + operation.buildQueue![0]!.costPaidAnchor, rateForLocalBalance(world, "US"));
    expect(corporation.liquidCapital).toBe(before - totalCost);
  });
});
