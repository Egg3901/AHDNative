import { describe, expect, it } from "vitest";
import { clearCommodity } from "../index.js";

const uniformAffinity = () => 1;

describe("clearCommodity source feasibility and receipts", () => {
  it("clears the short side and returns matching exporter/importer receipts", () => {
    const result = clearCommodity({
      countries: ["US", "CN"],
      supply: { US: 100, CN: 0 },
      demand: { US: 40, CN: 40 },
      affinity: uniformAffinity,
    });

    expect(result.clearedVolume).toBeCloseTo(40);
    expect(result.flow.US?.CN).toBeCloseTo(40);
    expect(result.perCountry.US).toEqual({ exports: 40, imports: 0, net: 40, uncleared: 20 });
    expect(result.perCountry.CN).toEqual({ exports: 0, imports: 40, net: -40, uncleared: 0 });
  });

  it("keeps unreachable demand unmet instead of exporting beyond the reachable surplus", () => {
    // Source Game clearing.test.ts: CS has 10 surplus, US 200, and US cannot
    // reach CN's 50-unit deficit. The earlier deficit-binding IPF pass scaled
    // the sole reachable CS→CN cell up to 50 and fabricated 40 units.
    const result = clearCommodity({
      countries: ["CS", "US", "CN"],
      supply: { CS: 30, US: 300, CN: 0 },
      demand: { CS: 20, US: 100, CN: 50 },
      affinity: (exporter, importer) => importer === "CN" && exporter !== "CS" ? 0 : 1,
    });

    expect(result.flow.CS?.CN).toBeLessThanOrEqual(10 + 1e-9);
    expect(result.flow.US?.CN ?? 0).toBe(0);
    expect(result.perCountry.CS?.exports).toBeLessThanOrEqual(10 + 1e-9);
    expect(result.perCountry.CN?.imports).toBeLessThanOrEqual(10 + 1e-9);
    expect(result.perCountry.CN?.uncleared).toBeCloseTo(-40);
    expect(result.clearedVolume).toBeLessThanOrEqual(10 + 1e-9);
  });

  it("caps a high-affinity importer at its recorded deficit and leaves spare supply reachable elsewhere", () => {
    const result = clearCommodity({
      countries: ["US", "CN", "DE"],
      supply: { US: 100, CN: 0, DE: 0 },
      demand: { US: 0, CN: 10, DE: 100 },
      affinity: (_exporter, importer) => importer === "CN" ? 1000 : 1,
    });

    expect(result.perCountry.CN?.imports).toBeLessThanOrEqual(10 + 1e-9);
    expect(result.perCountry.DE?.imports).toBeGreaterThan(80);
    expect(result.perCountry.US?.exports).toBeCloseTo(100, 3);
  });

  it("keeps embargo-capped volume in the public uncleared receipts", () => {
    const result = clearCommodity({
      countries: ["US", "CN"],
      supply: { US: 100, CN: 0 },
      demand: { US: 0, CN: 100 },
      affinity: uniformAffinity,
      capUnits: (exporter, importer) => exporter === "US" && importer === "CN" ? 30 : undefined,
    });

    expect(result.flow.US?.CN).toBeLessThanOrEqual(30 + 1e-9);
    expect(result.perCountry.US?.uncleared).toBeGreaterThan(0);
    expect(result.perCountry.CN?.uncleared).toBeLessThan(0);
    expect(result.clearedVolume).toBeCloseTo(30);
  });

  it("keeps every receipt within its source national surplus or deficit", () => {
    const countries = ["US", "CN", "DE", "JP", "HU"];
    const supply = { US: 500, CN: 10, DE: 40, JP: 0, HU: 25 };
    const demand = { US: 100, CN: 300, DE: 10, JP: 60, HU: 5 };
    const result = clearCommodity({
      countries,
      supply,
      demand,
      affinity: (exporter, importer) => importer === "CN" && exporter !== "HU" ? 0 : exporter === "US" && importer === "JP" ? 3 : 1,
    });

    for (const country of countries) {
      const net = supply[country as keyof typeof supply]! - demand[country as keyof typeof demand]!;
      expect(result.perCountry[country]!.exports).toBeLessThanOrEqual(Math.max(0, net) + 1e-9);
      expect(result.perCountry[country]!.imports).toBeLessThanOrEqual(Math.max(0, -net) + 1e-9);
    }
  });
});
