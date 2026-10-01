import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { buyPlantCapacity, capacityPricePerUnitAnchor, corporateSectorBasePrices, DEFAULT_SECTOR_OUTPUT_MIX, plantReplacementCostAnchor, seedPlantCapital } from "./plantCapacity.js";

describe("corporate plant capital at the public asset boundary", () => {
  const manufacturingPrices = { steel: 11.466666666666667, building_materials: 5.733333333333333 } as const;

  it("prices source extraction capacity from the selected recipe's revenue per unit", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "capacity-strategy-pricing-source", playerName: "Alex" });
    const prices = corporateSectorBasePrices(world);

    // Independently executed AHDGame cb66acdf capacityPricePerUnit at
    // year=1953, eraUnitScale=69.76744186046511, strategyId=standard and
    // rare_earth_mining. Native uses those same recorded era prices/scale.
    expect(capacityPricePerUnitAnchor("extraction", prices, "standard")).toBeCloseTo(3.8370017846519926, 9);
    expect(capacityPricePerUnitAnchor("extraction", prices, "rare_earth_mining")).toBeCloseTo(1254.1666666666665, 9);
  });

  it("matches the pinned Game seed and list-price identities for a 1953 manufacturing sector", () => {
    const seeded = seedPlantCapital({
      revenueLocal: 2_096_250_000,
      localPerAnchor: 1,
      sectorType: "manufacturing",
      basePrices: manufacturingPrices,
    });
    expect(seeded.capitalStock).toBeCloseTo(22_982_142.85714286, 6);
    expect(seeded.capacityBookAnchor).toBeCloseTo(988_232_142.8571429, 6);
    expect(capacityPricePerUnitAnchor("manufacturing", manufacturingPrices)).toBe(43);
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

  it("uses AHDGame's standard diversified extraction production rates", () => {
    // Independent vector from AHDGame src/lib/constants/sectorStrategies.ts
    // extraction.standard at immutable source revision cb66acdf0129616b8a09902727e9b58715c8bacb.
    expect(DEFAULT_SECTOR_OUTPUT_MIX.extraction).toEqual({
      iron: 0.25,
      coal: 0.22,
      oil: 0.14,
      rare_earth: 0.14,
      natural_gas: 0.14,
      timber: 0.12,
    });
  });
});
