import { describe, expect, it } from "vitest";
import { nigeriaSourceNppBackground } from "./packs/nigeriaSourceNpp.js";

describe("source Nigeria NPP geography", () => {
  it("preserves the six source zones, exact era GDP units, active parties and governor fallback", () => {
    const expectedPartyAbbreviations: Record<string, string[]> = {
      "1953": ["NCNC", "AG", "NPC"],
      "1979": ["NPN", "UPN", "NPP", "GNPP", "PRP"],
      "1991": ["SDP", "NRC"],
      "1999": ["SDP", "NRC"],
      "2007": ["SDP", "NRC"],
      "2019": ["APC", "PDP", "LP", "NNPP", "APGA"],
      "2023": ["APC", "PDP", "LP", "NNPP", "APGA"],
    };
    const expectedGovernorParties: Record<string, string[]> = {
      "1953": ["NG_NPC", "NG_NPC", "NG_NPC", "NG_AG", "NG_NCNC", "NG_NCNC"],
      "1979": Array(6).fill("independent"),
      "1991": ["NG_NRC", "NG_NRC", "NG_SDP", "NG_SDP", "NG_SDP", "NG_NRC"],
      "1999": Array(6).fill("independent"),
      "2007": Array(6).fill("independent"),
      "2019": ["NG_APC", "NG_APC", "NG_APC", "NG_APC", "NG_PDP", "NG_APGA"],
      "2023": ["NG_APC", "NG_APC", "NG_APC", "NG_APC", "NG_PDP", "NG_APGA"],
    };
    for (const [era, abbreviations] of Object.entries(expectedPartyAbbreviations)) {
      const source = nigeriaSourceNppBackground(era);
      expect(source.countryId).toBe("NG");
      expect(source.regions.map((region) => region.id)).toEqual([
        "NORTH_WEST", "NORTH_EAST", "NORTH_CENTRAL", "SOUTH_WEST", "SOUTH_SOUTH", "SOUTH_EAST",
      ]);
      expect(source.parties.map((party) => party.abbreviation)).toEqual(abbreviations);
      expect(source.parties.map((party) => party.sourceSequentialId)).toEqual(abbreviations.map((_, i) => i + 1));
      expect(source.parties.every((party) => party.treasury === 0)).toBe(true);
      expect(source.regions.every((region) => region.population > 0 && region.gdp > 0)).toBe(true);
      expect(source.regions.every((region) => region.gdpCurrencyCode === (era === "1953" ? "USD" : "NGN"))).toBe(true);
      expect(source.regions.map((region) => region.governorPartyId)).toEqual(expectedGovernorParties[era]);
      expect(source.regions.every((region) => region.governorPartyId === "independent" || source.parties.some((party) => party.id === region.governorPartyId))).toBe(true);
    }
    for (const era of ["1979", "1999", "2007"]) {
      expect(nigeriaSourceNppBackground(era).regions.map((region) => region.governorPartyId)).toEqual(Array(6).fill("independent"));
    }
  });
});
