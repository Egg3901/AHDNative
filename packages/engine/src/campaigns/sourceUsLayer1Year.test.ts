import { describe, expect, it } from "vitest";
import { sourceUsLayer1ForYear, supportsSourceUsStartingYear } from "./sourceUsLayer1Year.js";
import { sourceCampaignUnits1953, sourceCampaignUnitsForYear } from "./sourceCampaignElectorate.js";
import { createWorld } from "../world.js";
import { campaignCellsForRegion, hasSource1953DemographicShape, hasSourceYearDemographicShape } from "./targetedAds.js";

describe("current-source US annual Layer-1 substrate", () => {
  it("matches independently captured source vectors across starting eras and interpolation years", () => {
    const anchor = sourceUsLayer1ForYear("NY", 1953, 1953)!;
    expect(anchor.marginals.race).toEqual({ white: 91, black: 6, hispanic: 2, asian: 1, other: 0 });
    expect(anchor.positions.race!.white).toEqual({ economicLean: 1.2, socialLean: -0.9 });
    expect(anchor.turnoutRates.race!.black).toBe(40);

    const checkpoint = sourceUsLayer1ForYear("NY", 1985, 1953)!;
    expect(checkpoint.marginals.race).toEqual({ white: 72, black: 14.000000000000002, hispanic: 10.5, asian: 3, other: 0.5 });
    expect(checkpoint.positions.race!.white).toEqual({ economicLean: 0.09999999999999998, socialLean: 0 });
    expect(checkpoint.turnoutRates.race!.black).toBe(47.5);

    const alternateClock = sourceUsLayer1ForYear("NY", 1985, 1979)!;
    expect(alternateClock.marginals.race).toEqual(checkpoint.marginals.race);
    expect(alternateClock.turnoutRates.race!.black).toBe(52.5);
    const modernEra = sourceUsLayer1ForYear("NY", 2025, 2019)!;
    expect(modernEra.marginals.race).toEqual({ white: 51.5, black: 15, hispanic: 20.5, asian: 9.5, other: 3.5000000000000004 });
    expect(modernEra.positions.race!.white).toEqual({ economicLean: -1.5, socialLean: -1.5 });
    expect(sourceUsLayer1ForYear("NY", 1985, 2020)).toBeNull();
    expect(sourceUsLayer1ForYear("not-a-state", 1985, 1953)).toBeNull();
    expect(supportsSourceUsStartingYear(2019)).toBe(true);
    expect(supportsSourceUsStartingYear(2020)).toBe(false);
  });

  it("retains the discrete legacy path and derives anchored source-year units", () => {
    const legacy = sourceCampaignUnits1953("NY")!;
    const anchored = sourceCampaignUnitsForYear("NY", 1953, 1953)!;
    // The current Game resolver applies its source checkpoint correction even
    // at the 1953 anchor; the older Native path predates that correction.
    expect(anchored).not.toEqual(legacy);
    expect(anchored.reduce((sum, unit) => sum + unit.share, 0)).toBeCloseTo(1, 10);
    const later = sourceCampaignUnitsForYear("NY", 1985, 1953)!;
    expect(later.length).toBeGreaterThan(0);
    expect(later.reduce((sum, unit) => sum + unit.share, 0)).toBeCloseTo(1, 10);
    expect(later).not.toEqual(legacy);
  });

  it("preserves the clockless 1953 legacy consumer without fabricating a year anchor", () => {
    const world = createWorld({ seed: "source-year-legacy-fallback", playerName: "Player", countryId: "US", era: "1953", homeRegionId: "NY" });
    delete world.meta.startingYear;
    expect(hasSourceYearDemographicShape(world, "NY")).toBe(false);
    expect(hasSource1953DemographicShape(world, "NY")).toBe(true);
    expect(campaignCellsForRegion(world, "NY")).toEqual(sourceCampaignUnits1953("NY")!.flatMap((unit) => unit.campaignCells));
  });
});
