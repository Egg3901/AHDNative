import { describe, expect, it } from "vitest";
import { isOnePartyCountry, isImperialEligibleCountry, imperialEligibleCountries, onePartyCountries } from "./creationCountryRules.js";

describe("character-creation country conditionals (#242)", () => {
  it("derives one-party states from the government data, not a hand list", () => {
    // Reference `selectedCountry?.governmentType === "onePartyState"` over
    // COUNTRY_CONFIGS. Every governmentType onePartyState country is one-party
    // even when Native has no pack for it yet.
    for (const id of ["RU", "DD", "CN", "HU", "PL", "RO", "YU", "BG", "CS", "BLR", "UKR", "BAL"]) {
      expect(isOnePartyCountry(id), id).toBe(true);
    }
    for (const id of ["US", "UK", "DE", "JP", "IE"]) {
      expect(isOnePartyCountry(id), id).toBe(false);
    }
  });

  it("derives imperial-eligible countries from governmentType parliamentaryMonarchy", () => {
    // Reference getImperialEligibleCountries: isImperialCountry (default true
    // for parliamentaryMonarchy) && !imperialSharedWith. Includes ES/SE, which
    // are parliamentary monarchies even though Native does not play them yet.
    for (const id of ["UK", "JP", "ES", "SE"]) {
      expect(isImperialEligibleCountry(id), id).toBe(true);
    }
    for (const id of ["US", "DE", "IE", "FR", "DD", "RU"]) {
      expect(isImperialEligibleCountry(id), id).toBe(false);
    }
  });

  it("exposes the derived sets so UI/claims read one grounded source", () => {
    expect(imperialEligibleCountries()).toEqual(expect.arrayContaining(["UK", "JP", "ES", "SE"]));
    expect(imperialEligibleCountries()).not.toContain("DE");
    expect(onePartyCountries()).toEqual(expect.arrayContaining(["RU", "DD", "CN"]));
    expect(onePartyCountries()).not.toContain("UK");
  });
});
