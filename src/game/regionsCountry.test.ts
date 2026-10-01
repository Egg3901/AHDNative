/**
 * Selected-country RegionsQuery (#73).
 *
 * The world map country picker browses another nation's directory through
 * the existing client loadRegions({countryId, ...}): eligibility is presence
 * in world.countries with fallback to the player's country, directory and
 * selection stay inside the selected country, and directory ids are the
 * recorded region codes (properties.regionCode), never invented.
 */
import { describe, expect, it } from "vitest";
import { createWorld } from "@ahdclient/engine";
import { projectRegions } from "./regions";

function usWorld() {
  return createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "regions-country" });
}

describe("projectRegions selected country", () => {
  it("scopes the directory and selection to the queried country", () => {
    const view = projectRegions(usWorld(), { countryId: "UK", directoryPageSize: 100 });
    expect(view.playerCountryId).toBe("US");
    expect(view.selectedCountryId).toBe("UK");
    expect(view.selectedCountryName).toBe("United Kingdom");
    expect(view.directoryTotal).toBe(12);
    expect(view.directory.map((row) => row.id)).toContain("EMI");
    expect(view.selected?.countryId).toBe("UK");
    expect(view.playerHomeRegionId).toBeNull();
  });

  it("accepts lowercase country ids and keeps the query detached", () => {
    const view = projectRegions(usWorld(), { countryId: "uk", regionId: "EMI" });
    expect(view.selectedCountryId).toBe("UK");
    expect(view.selected?.id).toBe("EMI");
  });

  it("falls back to the player country for unknown or absent countries", () => {
    for (const view of [
      projectRegions(usWorld(), { countryId: "XX" }),
      projectRegions(usWorld(), {}),
      projectRegions(usWorld(), { countryId: "" }),
    ]) {
      expect(view.selectedCountryId).toBe("US");
      expect(view.selectedCountryName).toBe("United States");
      expect(view.selected?.countryId).toBe("US");
    }
  });

  it("ignores a selected region outside the selected country", () => {
    const view = projectRegions(usWorld(), { countryId: "UK", regionId: "CA" });
    expect(view.selectedCountryId).toBe("UK");
    expect(view.selected?.countryId).toBe("UK");
    expect(view.selected?.id).not.toBe("CA");
  });

  it("carries only recorded region codes in a foreign directory", () => {
    const world = usWorld();
    const view = projectRegions(world, { countryId: "UK", directoryPageSize: 100 });
    const recorded = new Set(
      Object.values(world.regions).filter((region) => region.countryId === "UK").map((region) => region.id),
    );
    expect(view.directory.length).toBe(recorded.size);
    for (const row of view.directory) {
      expect(recorded.has(row.id)).toBe(true);
    }
  });
});
