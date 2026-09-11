import { describe, expect, it } from "vitest";
import {
  PARTY_LEADERSHIP_TENURE_TURNS,
  getPartyLeadershipTenure,
} from "./leadershipTenure.js";

describe("party leadership tenure", () => {
  it("uses the source 24-turn requirement", () => {
    expect(PARTY_LEADERSHIP_TENURE_TURNS).toBe(24);
    expect(getPartyLeadershipTenure(0, 23, "US_DEM")).toMatchObject({
      eligible: false,
      turnsRemaining: 1,
    });
    expect(getPartyLeadershipTenure(0, 24, "US_DEM").eligible).toBe(true);
  });

  it("grandfathers saves without a join-turn field", () => {
    expect(getPartyLeadershipTenure(null, 0, "US_DEM").eligible).toBe(true);
    expect(getPartyLeadershipTenure(undefined, 0, "US_DEM").eligible).toBe(true);
  });

  it("exempts a founder only in the party they founded", () => {
    expect(getPartyLeadershipTenure(0, 0, "US_NEW", "US_NEW").eligible).toBe(true);
    expect(getPartyLeadershipTenure(0, 0, "US_DEM", "US_NEW")).toMatchObject({
      eligible: false,
      turnsRemaining: 24,
    });
  });
});
