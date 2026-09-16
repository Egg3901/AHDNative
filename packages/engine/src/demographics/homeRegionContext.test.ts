/**
 * Home-region electorate context for character creation (#242 slice, red).
 *
 * The creation screen must show source-grounded population and electorate
 * lean per home region instead of a bare name list. Lean is the same
 * turnout-weighted voter-group centre the general-election tally measures
 * from (accumulateVoteTurn median voter: w = categoryWeight * popShare *
 * turnout), so creation context and election math can never disagree.
 */
import { describe, expect, it } from "vitest";
import { electorateLeanForGroups, listCreationHomeRegions } from "./homeRegionContext.js";
import { US_CATEGORY_1953, type DemographicCategory } from "./categories.js";
import { US_STATE_DEMOGRAPHICS_1953 } from "./usStateDemographics1953.js";

const CATS: DemographicCategory[] = [
  {
    _id: "voterGroups",
    name: "Voter Groups",
    defaultWeight: 100,
    groups: [
      { id: "left", name: "Left", defaultEconomicLean: -2, defaultSocialLean: -1, defaultTurnout: 50 },
      { id: "right", name: "Right", defaultEconomicLean: 2, defaultSocialLean: 1, defaultTurnout: 50 },
    ],
  },
];

describe("electorateLeanForGroups (tally median-voter algebra)", () => {
  it("weights group leans by category weight, population share and turnout", () => {
    // left votes at full turnout, right stays home: the electorate centre is left.
    const lean = electorateLeanForGroups(CATS, { voterGroups: 100 }, {
      left: { population: 50, economicLean: -2, socialLean: -1, turnout: 100 },
      right: { population: 50, economicLean: 2, socialLean: 1, turnout: 0 },
    });
    expect(lean).toEqual({ economic: -2, social: -1 });
  });

  it("returns the midpoint when both groups vote equally", () => {
    const lean = electorateLeanForGroups(CATS, { voterGroups: 100 }, {
      left: { population: 50, economicLean: -2, socialLean: -1, turnout: 50 },
      right: { population: 50, economicLean: 2, socialLean: 1, turnout: 50 },
    });
    expect(lean).toEqual({ economic: 0, social: 0 });
  });

  it("returns null when no group carries usable weight", () => {
    expect(electorateLeanForGroups([], {}, {})).toBeNull();
    expect(electorateLeanForGroups(CATS, { voterGroups: 0 }, {
      left: { population: 50, economicLean: -2, socialLean: -1, turnout: 50 },
    })).toBeNull();
  });
});

describe("listCreationHomeRegions (world-free creation context)", () => {
  it("exposes the pack population and a seeded turnout-weighted lean for a US state", () => {
    const regions = listCreationHomeRegions("1953", "US");
    const ny = regions.find((region) => region.id === "NY");
    expect(ny).toMatchObject({ id: "NY", name: "New York", population: 14830192, seeded: true });
    // Independent oracle: the same weighted-mean algebra written fresh here
    // over the Layer-1 seed, not the implementation under test.
    const seed = US_STATE_DEMOGRAPHICS_1953.find((row) => row.stateId === "NY")!;
    let weightSum = 0;
    let economic = 0;
    let social = 0;
    for (const group of US_CATEGORY_1953.groups) {
      const row = seed.groups[group.id]!;
      const w = 100 * row.population * row.turnout;
      weightSum += w;
      economic += w * row.economicLean;
      social += w * row.socialLean;
    }
    expect(ny?.electorateLean).toEqual({
      economic: economic / weightSum,
      social: social / weightSum,
    });
    expect(Math.abs(ny!.electorateLean!.economic)).toBeLessThanOrEqual(5);
    expect(Math.abs(ny!.electorateLean!.social)).toBeLessThanOrEqual(5);
  });

  it("differentiates per-region leans from the Layer-1 seeds", () => {
    const regions = listCreationHomeRegions("1953", "US");
    const ny = regions.find((region) => region.id === "NY")!.electorateLean!;
    const al = regions.find((region) => region.id === "AL")!.electorateLean!;
    expect(ny).not.toEqual(al);
  });

  it("returns an empty list for an unknown country instead of inventing regions", () => {
    expect(listCreationHomeRegions("1953", "XX")).toEqual([]);
  });
});
