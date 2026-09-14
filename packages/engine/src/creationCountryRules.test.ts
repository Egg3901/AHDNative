import { describe, expect, it } from "vitest";
import { isOnePartyCountry, isImperialEligibleCountry, IMPERIAL_ELIGIBLE_COUNTRIES } from "./creationCountryRules.js";

describe("character-creation country conditionals (#242)", () => {
  it("classifies the reference one-party states before a world exists", () => {
    expect(isOnePartyCountry("RU")).toBe(true);
    expect(isOnePartyCountry("DD")).toBe(true);
    expect(isOnePartyCountry("CN")).toBe(true);
    expect(isOnePartyCountry("US")).toBe(false);
    expect(isOnePartyCountry("UK")).toBe(false);
  });

  it("pins the reference imperial-eligible set (UK and JP only)", () => {
    // Source: AHDGame src/lib/imperial.ts getImperialEligibleCountries, whose
    // test asserts UK and JP are eligible and DE/US/CA are not.
    expect(IMPERIAL_ELIGIBLE_COUNTRIES).toEqual(["UK", "JP"]);
    expect(isImperialEligibleCountry("UK")).toBe(true);
    expect(isImperialEligibleCountry("JP")).toBe(true);
    expect(isImperialEligibleCountry("DE")).toBe(false);
    expect(isImperialEligibleCountry("US")).toBe(false);
  });
});
