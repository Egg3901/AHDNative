import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import {
  computeSectorSaleValuation,
  listCorporateSectorForSale,
  unlistCorporateSectorForSale,
  updateCorporateSectorListing,
} from "./corporateSectorSale.js";

const WORLD = { era: "1953", countryId: "US", seed: "issue-294-sale", playerName: "Alex" } as const;
const SAVED_AT = "2026-09-15T00:00:00.000Z";

/** World with a recorded player share block so the player passes sale authority. */
function worldWithPlayerShares() {
  const world = createWorld(WORLD);
  const assets = corporateSectorAssets(world);
  const asset = Object.values(assets).find((candidate) => candidate.corporationId === "US-media")!;
  world.corporations["US-media"]!.shareholders.push({ holder: "player", shares: 100, avgCostPerShare: 1 });
  return { world, asset };
}

/**
 * #294 sale-listing valuation. Source grounding (AHDGame e364c04):
 * sectorValuation.ts computeSectorListingValuation (price = 0.75 x NPV,
 * NPV = yearlyProfit / 0.15) over the sectorProfitBasis daily-profit identity
 * (revenue x margin - stored growthCost), with constants from
 * constants/corporations.ts (NPV_ANNUAL_DISCOUNT_RATE, SECTOR_FOR_SALE_PRICE_FRACTION).
 * Native stores per-turn (weekly game-calendar, calendar.ts DAYS_PER_TURN=7,
 * TURNS_PER_YEAR=48) revenue, so the annualizer is TURNS_PER_YEAR where the
 * reference annualizes daily revenue by TURNS_PER_YEAR/TURNS_PER_DAY.
 */
describe("#294 corporate-sector sale valuation", () => {
  it("annualizes per-turn profit at TURNS_PER_YEAR and applies the 0.75 x NPV anchors", () => {
    // Independent literal vector: 4800/turn at 50% with no growth cost.
    // per-turn profit 2400, yearly 2400x48=115200, NPV 115200/0.15=768000,
    // asking price round(768000x0.75)=576000.
    const valuation = computeSectorSaleValuation({ revenue: 4800, profitMargin: 50, currentGrowthCost: 0 });
    expect(valuation.perTurnProfitAnchor).toBe(2400);
    expect(valuation.yearlyProfitAnchor).toBe(115200);
    expect(valuation.npvAnchor).toBe(768000);
    expect(valuation.priceAnchor).toBe(576000);
  });

  it("prices at zero when growth cost wipes out base profit", () => {
    const valuation = computeSectorSaleValuation({ revenue: 4800, profitMargin: 50, currentGrowthCost: 2400 });
    expect(valuation.perTurnProfitAnchor).toBe(0);
    expect(valuation.npvAnchor).toBe(0);
    expect(valuation.priceAnchor).toBe(0);
  });
});

describe("#294 sale listing commands", () => {
  it("lists at the live computed anchor and refuses a second listing without touching the anchor", () => {
    const { world, asset } = worldWithPlayerShares();
    const corp = world.corporations[asset.corporationId]!;
    const expected = computeSectorSaleValuation({
      revenue: corp.revenue,
      profitMargin: corp.profitMargin,
      currentGrowthCost: corp.currentGrowthCost,
    });
    expect(expected.priceAnchor).toBeGreaterThan(0);

    const listed = listCorporateSectorForSale(world, asset.id, "player");
    expect(listed).toMatchObject({ ok: true, priceAnchor: expected.priceAnchor });
    expect(world.corporateSectors![asset.id]!.forSale).toEqual({ priceAnchor: expected.priceAnchor });

    const relist = listCorporateSectorForSale(world, asset.id, "player");
    expect(relist.ok).toBe(false);
    expect(world.corporateSectors![asset.id]!.forSale).toEqual({ priceAnchor: expected.priceAnchor });
  });

  it("refuses to list for a non-shareholder and leaves the world untouched", () => {
    const world = createWorld(WORLD);
    const assets = corporateSectorAssets(world);
    const asset = Object.values(assets).find((candidate) => candidate.corporationId === "US-media")!;
    const before = structuredClone(world.corporateSectors);

    const result = listCorporateSectorForSale(world, asset.id, "player");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/shareholder/i);
    expect(world.corporateSectors![asset.id]!.forSale).toBeNull();
    expect(world.corporateSectors).toEqual(before);
  });

  it("refuses to list a sector with no positive price anchor", () => {
    const { world, asset } = worldWithPlayerShares();
    world.corporations[asset.corporationId]!.profitMargin = 0;
    world.corporations[asset.corporationId]!.currentGrowthCost = 0;

    const result = listCorporateSectorForSale(world, asset.id, "player");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/profitab/i);
    expect(world.corporateSectors![asset.id]!.forSale).toBeNull();
  });

  it("refuses every command for an unknown listing", () => {
    const { world } = worldWithPlayerShares();
    expect(listCorporateSectorForSale(world, "corporate-sector:US:media:missing", "player").ok).toBe(false);
    expect(updateCorporateSectorListing(world, "corporate-sector:US:media:missing", "player", 100).ok).toBe(false);
    expect(unlistCorporateSectorForSale(world, "corporate-sector:US:media:missing", "player").ok).toBe(false);
  });

  it("updates a listing to an explicit positive finite price and rejects bad prices atomically", () => {
    const { world, asset } = worldWithPlayerShares();
    expect(listCorporateSectorForSale(world, asset.id, "player").ok).toBe(true);

    const updated = updateCorporateSectorListing(world, asset.id, "player", 12345);
    expect(updated).toMatchObject({ ok: true, priceAnchor: 12345 });
    expect(world.corporateSectors![asset.id]!.forSale).toEqual({ priceAnchor: 12345 });

    for (const bad of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const refused = updateCorporateSectorListing(world, asset.id, "player", bad);
      expect(refused.ok).toBe(false);
      expect(refused.error).toMatch(/positive finite/i);
      expect(world.corporateSectors![asset.id]!.forSale).toEqual({ priceAnchor: 12345 });
    }
  });

  it("re-anchors an update from live corporation state when no price is given", () => {
    const { world, asset } = worldWithPlayerShares();
    expect(listCorporateSectorForSale(world, asset.id, "player").ok).toBe(true);
    const corp = world.corporations[asset.corporationId]!;
    corp.revenue *= 2;

    const updated = updateCorporateSectorListing(world, asset.id, "player");
    const expected = computeSectorSaleValuation({
      revenue: corp.revenue,
      profitMargin: corp.profitMargin,
      currentGrowthCost: corp.currentGrowthCost,
    });
    expect(updated).toMatchObject({ ok: true, priceAnchor: expected.priceAnchor });
    expect(world.corporateSectors![asset.id]!.forSale).toEqual({ priceAnchor: expected.priceAnchor });
  });

  it("refuses to update or unlist a listing that is not for sale", () => {
    const { world, asset } = worldWithPlayerShares();
    expect(updateCorporateSectorListing(world, asset.id, "player", 100).ok).toBe(false);
    expect(unlistCorporateSectorForSale(world, asset.id, "player").ok).toBe(false);
    expect(world.corporateSectors![asset.id]!.forSale).toBeNull();
  });

  it("refuses update and unlist for a non-shareholder without touching the anchor", () => {
    const { world, asset } = worldWithPlayerShares();
    expect(listCorporateSectorForSale(world, asset.id, "player").ok).toBe(true);
    const anchor = world.corporateSectors![asset.id]!.forSale;
    world.corporations[asset.corporationId]!.shareholders =
      world.corporations[asset.corporationId]!.shareholders.filter((entry) => entry.holder !== "player");

    expect(updateCorporateSectorListing(world, asset.id, "player", 999).ok).toBe(false);
    expect(unlistCorporateSectorForSale(world, asset.id, "player").ok).toBe(false);
    expect(world.corporateSectors![asset.id]!.forSale).toEqual(anchor);
  });

  it("unlists a live listing back to null", () => {
    const { world, asset } = worldWithPlayerShares();
    expect(listCorporateSectorForSale(world, asset.id, "player").ok).toBe(true);
    const unlisted = unlistCorporateSectorForSale(world, asset.id, "player");
    expect(unlisted).toMatchObject({ ok: true });
    expect(world.corporateSectors![asset.id]!.forSale).toBeNull();
  });

  it("survives the public save boundary with the listing intact", () => {
    const { world, asset } = worldWithPlayerShares();
    const listed = listCorporateSectorForSale(world, asset.id, "player");
    expect(listed.ok).toBe(true);
    const restored = deserializeSave(serializeSave(world, SAVED_AT));
    expect(restored.corporateSectors![asset.id]!.forSale).toEqual({ priceAnchor: listed.priceAnchor });
  });
});
