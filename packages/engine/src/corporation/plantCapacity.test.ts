import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { buyPlantCapacity, capacityEraPriceIndex, capacityPricePerUnitAnchor, corporateSectorBasePrices, DEFAULT_SECTOR_OUTPUT_MIX, plantReplacementCostAnchor, sectorDemandMix, sectorSupplyMix, seedPlantCapital, SOURCE_DEFAULT_OPERATING_SUPPLY } from "./plantCapacity.js";

describe("corporate plant capital at the public asset boundary", () => {
  const manufacturingPrices = { steel: 11.466666666666667, building_materials: 5.733333333333333 } as const;

  it("prices source extraction capacity from the selected recipe's revenue per unit", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "capacity-strategy-pricing-source", playerName: "Alex" });
    const prices = corporateSectorBasePrices(world);

    // Independently executed AHDGame cb66acdf capacityPricePerUnit at
    // year=1953, eraUnitScale=69.76744186046511, strategyId=standard and
    // rare_earth_mining. Native uses those same recorded era prices/scale.
    expect(capacityPricePerUnitAnchor("extraction", prices, "standard", 1953)).toBeCloseTo(3.8370017846519926, 9);
    expect(capacityPricePerUnitAnchor("extraction", prices, "rare_earth_mining", 1953)).toBeCloseTo(1254.1666666666665, 9);
  });

  it("matches the pinned Game seed and list-price identities for a 1953 manufacturing sector", () => {
    const seeded = seedPlantCapital({
      revenueLocal: 2_096_250_000,
      localPerAnchor: 1,
      sectorType: "manufacturing",
      basePrices: manufacturingPrices,
      year: 1953,
    });
    expect(seeded.capitalStock).toBeCloseTo(22_982_142.85714286, 6);
    expect(seeded.capacityBookAnchor).toBeCloseTo(988_232_142.8571429, 6);
    expect(capacityPricePerUnitAnchor("manufacturing", manufacturingPrices, undefined, 1953)).toBe(43);
  });

  it("applies the source capacity price era column to both list value and seeded book", () => {
    expect([1953, 1978, 1985, 1995, 2019].map(capacityEraPriceIndex)).toEqual([1, 1.4, 2.6, 3.6, 5]);
    const prices = { software: 1000, electronics: 500 } as const;
    expect(capacityPricePerUnitAnchor("technology", prices, "software", 2019)).toBeCloseTo(17_647.058823529413, 9);
    const anchor = seedPlantCapital({
      revenueLocal: 1_000_000,
      localPerAnchor: 1,
      sectorType: "technology",
      strategyId: "software",
      basePrices: prices,
      year: 2019,
    });
    const sourceAnchorBook = seedPlantCapital({
      revenueLocal: 1_000_000,
      localPerAnchor: 1,
      sectorType: "technology",
      strategyId: "software",
      basePrices: prices,
      year: 1953,
    });
    expect(anchor.capacityBookAnchor).toBeCloseTo(sourceAnchorBook.capacityBookAnchor * 5, 6);
  });

  it("prices paid directed credit at list value and covers only one turn of depreciation", () => {
    const bought = buyPlantCapacity({
      capitalStock: 22_982_142.85714286,
      capacityBookAnchor: 988_232_142.8571429,
      creditAnchor: 43_000,
      capacityPricePerUnitAnchor: 43,
    });
    expect(bought.capitalStock).toBeCloseTo(22_983_142.85714286, 6);
    expect(bought.capacityBookAnchor).toBeCloseTo(988_275_142.8571429, 6);
    expect(plantReplacementCostAnchor({ capitalStock: 22_982_142.85714286, capacityPricePerUnitAnchor: 43 }))
      .toBeCloseTo(494_116.0714285714, 7);
  });

  it("does not create capacity from malformed or nonpositive money/price", () => {
    expect(buyPlantCapacity({ capitalStock: 50, capacityBookAnchor: 90, creditAnchor: Number.NaN, capacityPricePerUnitAnchor: 10 }))
      .toEqual({ capitalStock: 50, capacityBookAnchor: 90 });
    expect(buyPlantCapacity({ capitalStock: 50, capacityBookAnchor: 90, creditAnchor: 100, capacityPricePerUnitAnchor: 0 }))
      .toEqual({ capitalStock: 50, capacityBookAnchor: 90 });
    expect(buyPlantCapacity({ capitalStock: 50, creditAnchor: 0, capacityPricePerUnitAnchor: Number.NaN }))
      .toEqual({ capitalStock: 50, capacityBookAnchor: 0 });
  });

  it("keeps the Game legacy extraction operating row distinct from its explicit standard strategy", () => {
    // Game computeRawSupplyDemand falls back to SECTOR_SUPPLY for a default
    // asset, while an explicit transition/selection uses the strategy table.
    expect(DEFAULT_SECTOR_OUTPUT_MIX.extraction).toEqual({
      iron: 0.25,
      coal: 0.22,
      oil: 0.14,
      rare_earth: 0.14,
      natural_gas: 0.14,
      timber: 0.12,
    });
    expect(SOURCE_DEFAULT_OPERATING_SUPPLY.extraction).toEqual({
      iron: 0.4,
      coal: 0.3,
      oil: 0.14,
      rare_earth: 0.27,
      natural_gas: 0.24,
      timber: 0.2,
    });
  });

  it("prices and produces the source technology software strategy, not the standard recipe", () => {
    // AHDGame cb66acdf SECTOR_STRATEGIES.technology.software, available with
    // the source tech-tree feature disabled (the default Native contract).
    expect(sectorSupplyMix("technology", "software")).toEqual({ software: 0.55, electronics: 0.15 });
    expect(sectorDemandMix("technology", "software")).toEqual({ consulting_services: 0.15, energy: 0.1 });
    // Source capacityPricePerUnit is 3 / sum(rate / price), then multiplied by
    // the source year-specific capacity-price column.
    expect(capacityPricePerUnitAnchor("technology", { software: 2, electronics: 4 }, "software", 1953)).toBeCloseTo(
      3 / (0.55 / 2 + 0.15 / 4),
      9,
    );
    expect(capacityPricePerUnitAnchor("technology", { software: 1000, electronics: 500 }, "software", 2019)).toBeCloseTo(
      17_647.058823529413,
      9,
    );
  });
});
