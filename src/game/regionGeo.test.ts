/**
 * regionGeo regression locks (#73).
 *
 * The three PINs below are the d3-geo 3.1.1 geoAlbersUsa oracle values
 * recorded by the calibration run (1187 grid/shard points at scale 1000 /
 * translate [480,250]: 676 claimed by both with max deviation 1.6e-13 px,
 * 511 both-null, 0 claim mismatches). They lock the ported AlbersUsa
 * composite (rotate spin + recenter shift + clip fractions) against drift.
 * Inputs are the real city lon/lats; the frame reproduces the oracle
 * scale/translate exactly (ox/oy is the lower48 translate point).
 */
import { describe, expect, it } from "vitest";
import {
  countryGeoConfig,
  dropDegenerateRings,
  featureRegionCode,
  projectAlbersUsa,
  projectRegionGeometry,
  type AlbersUsaFrame,
} from "./regionGeo";

const ORACLE_FRAME: AlbersUsaFrame = { width: 960, height: 500, scale: 1000, ox: 480, oy: 250 };

describe("regionGeo oracle pins", () => {
  it("pins Washington DC through the lower48 segment", () => {
    expect(projectAlbersUsa(-77.0369, 38.9072, ORACLE_FRAME)).toEqual(
      [741.4835593595853, 221.0117491699184],
    );
  });

  it("pins Anchorage through the Alaska inset", () => {
    const point = projectAlbersUsa(-149.9003, 61.2181, ORACLE_FRAME);
    expect(point).not.toBeNull();
    expect(point![0]).toBeCloseTo(191.3672519767023, 9);
    expect(point![1]).toBeCloseTo(434.0599355541369, 9);
  });

  it("pins Honolulu through the Hawaii inset", () => {
    const point = projectAlbersUsa(-157.8583, 21.3069, ORACLE_FRAME);
    expect(point).not.toBeNull();
    expect(point![0]).toBeCloseTo(310.35380520663966, 9);
    expect(point![1]).toBeCloseTo(437.83874841506633, 9);
  });

  it("leaves open ocean unclaimed by every segment", () => {
    expect(projectAlbersUsa(0, 0, ORACLE_FRAME)).toBeNull();
  });
});

describe("regionGeo source mapping", () => {
  it("reads the recorded region code verbatim and rejects id-less features", () => {
    expect(featureRegionCode({ properties: { regionCode: "CA" } })).toBe("CA");
    expect(featureRegionCode({ properties: {} })).toBeNull();
    expect(featureRegionCode({ properties: { regionCode: "" } })).toBeNull();
    expect(featureRegionCode({})).toBeNull();
  });

  it("drops only degenerate rings, keeping the valid remainder", () => {
    const kept = dropDegenerateRings({
      geometry: {
        type: "Polygon",
        coordinates: [
          [[0, 0], [1, 0], [1, 1], [0, 0]],
          [[5, 5]],
        ],
      },
      properties: { regionCode: "HN" },
    });
    expect(kept?.geometry?.coordinates).toHaveLength(1);

    expect(
      dropDegenerateRings({
        geometry: { type: "Polygon", coordinates: [[[5, 5]]] },
        properties: { regionCode: "HN" },
      }),
    ).toBeNull();
  });

  it("renders only recorded codes and reports records without a shape", () => {
    const config = countryGeoConfig("US")!;
    const recorded = new Map([["CA", "California"], ["ZZ", "Nowhere"]]);
    const { regions, missing } = projectRegionGeometry(
      [
        {
          geometry: { type: "Polygon", coordinates: [[[-124, 32], [-114, 32], [-114, 42], [-124, 42], [-124, 32]]] },
          properties: { regionCode: "CA", na: "California" },
        },
        {
          geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: { regionCode: "UNRECORDED" },
        },
      ],
      recorded,
      config,
    );
    expect(regions.map((region) => region.id)).toEqual(["CA"]);
    expect(missing).toEqual(["ZZ"]);
  });

  it("has no bundled shard for unmapped countries", () => {
    expect(countryGeoConfig("FR")).toBeNull();
    expect(countryGeoConfig("XX")).toBeNull();
  });
});
