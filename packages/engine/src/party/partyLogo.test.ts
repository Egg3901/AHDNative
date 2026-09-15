import { describe, expect, it } from "vitest";
import { partyLogoKey, resolvePartyLogoUrl } from "./partyLogo.js";

describe("partyLogoKey (authored-logo identity)", () => {
  it("keys defaults by country:abbreviation, never by sequential id", () => {
    expect(partyLogoKey("US", "DEM")).toBe("US:DEM");
    expect(partyLogoKey("us", "dem")).toBe("US:DEM");
    expect(partyLogoKey("  gb ", " lab ")).toBe("GB:LAB");
  });

  it("returns null when either half of the identity is missing", () => {
    expect(partyLogoKey(null, "DEM")).toBeNull();
    expect(partyLogoKey("US", null)).toBeNull();
    expect(partyLogoKey("", "")).toBeNull();
    expect(partyLogoKey("US", "  ")).toBeNull();
  });
});

describe("resolvePartyLogoUrl (authored override only)", () => {
  it("passes through a real authored URL", () => {
    expect(resolvePartyLogoUrl({ logoUrl: "/party-logos/us-dem-1.png" })).toBe("/party-logos/us-dem-1.png");
  });

  it("resolves to null when no authored URL exists: no remote default is substituted", () => {
    expect(resolvePartyLogoUrl({ countryId: "US", abbreviation: "DEM" })).toBeNull();
    expect(resolvePartyLogoUrl({ countryId: "US", abbreviation: "DEM", logoUrl: "   " })).toBeNull();
    expect(resolvePartyLogoUrl(null)).toBeNull();
    expect(resolvePartyLogoUrl(undefined)).toBeNull();
  });
});
