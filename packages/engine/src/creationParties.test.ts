import { describe, expect, it } from "vitest";
import { listCreationParties } from "./world.js";

describe("listCreationParties (#242)", () => {
  it("returns the country's parties with authored positions and default flag", () => {
    const parties = listCreationParties("1953", "US");
    const dem = parties.find((party) => party.id === "US_DEM");
    expect(dem).toBeDefined();
    expect(typeof dem!.economicPosition).toBe("number");
    expect(typeof dem!.socialPosition).toBe("number");
    expect(dem!.isDefault).toBe(true);
  });

  it("returns an empty list for a country with no authored parties", () => {
    expect(listCreationParties("1953", "ZZ")).toEqual([]);
  });

  it("keeps RU a single-party pack so the one-party briefing is honest", () => {
    const parties = listCreationParties("1953", "RU");
    expect(parties).toHaveLength(1);
    expect(parties[0]!.id).toBe("RU_CPSU");
  });
});
