import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { UK_WESTMINSTER_2024_CONSTITUENCIES } from "./ukWestminster2024";

const OFFICIAL_REGION_COUNTS = {
  EAE: 61,
  EMI: 47,
  LON: 75,
  NEE: 27,
  NIR: 18,
  NWE: 73,
  SCO: 57,
  SEE: 91,
  SWE: 58,
  WAL: 32,
  WMI: 57,
  YHU: 54,
};

describe("UK Westminster 2024 constituency catalog", () => {
  it("matches the complete official House of Commons region lookup", () => {
    const rows = [...UK_WESTMINSTER_2024_CONSTITUENCIES]
      .sort((a, b) => a.id.localeCompare(b.id));
    const canonical = rows
      .map((row) => `${row.id}|${row.name}|${row.regionId}`)
      .join("\n");

    expect(rows).toHaveLength(650);
    expect(new Set(rows.map((row) => row.id)).size).toBe(650);
    expect(Object.fromEntries(Object.keys(OFFICIAL_REGION_COUNTS).map((regionId) => [
      regionId,
      rows.filter((row) => row.regionId === regionId).length,
    ]))).toEqual(OFFICIAL_REGION_COUNTS);
    // SHA-256 of the sorted id, name, and mapped region rows generated from
    // HoC-GE2024-results-by-constituency.csv. This catches any change to any
    // one of the 650 source-backed rows, including swaps that preserve counts.
    expect(createHash("sha256").update(canonical).digest("hex")).toBe(
      "26f3ccf7947258f020f5e377200c13c3292c49dd60ca6c32b2cebd4050a07c47",
    );
  });

  it("keeps reviewed border-area constituencies in their official regions", () => {
    const byName = new Map(UK_WESTMINSTER_2024_CONSTITUENCIES.map((row) => [row.name, row.regionId]));
    expect(byName.get("Barrow and Furness")).toBe("NWE");
    expect(byName.get("East Thanet")).toBe("SEE");
    expect(byName.get("North Northumberland")).toBe("NEE");
  });
});
