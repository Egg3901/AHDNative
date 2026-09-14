import { describe, expect, it } from "vitest";
import {
  MAX_COMPASS_DISTANCE,
  alignmentBand,
  compassDistance,
  ideologyLabel,
  nearestParty,
  type CompassPoint,
} from "./policyAlignment.js";

const DEM: CompassPoint & { id: string } = { id: "US_DEM", economic: -3, social: -2 };
const REP: CompassPoint & { id: string } = { id: "US_REP", economic: 3, social: 2 };
const UK_LAB: CompassPoint & { id: string } = { id: "UK_LAB", economic: -4, social: -1 };

describe("compass distance and bands (reference registration/alignment.ts parity)", () => {
  it("measures Euclidean distance on the -5..+5 plane and bounds it corner to corner", () => {
    expect(compassDistance({ economic: 0, social: 0 }, { economic: 3, social: 4 })).toBeCloseTo(5, 10);
    expect(MAX_COMPASS_DISTANCE).toBeCloseTo(Math.hypot(10, 10), 10);
  });

  it("buckets distance into the reference bands at the reference thresholds", () => {
    expect(alignmentBand(0)).toBe("aligned");
    expect(alignmentBand(1.49)).toBe("aligned");
    expect(alignmentBand(1.5)).toBe("close");
    expect(alignmentBand(2.99)).toBe("close");
    expect(alignmentBand(3)).toBe("daylight");
    expect(alignmentBand(5.49)).toBe("daylight");
    expect(alignmentBand(5.5)).toBe("at-odds");
  });
});

describe("nearestParty (reference registration/alignment.ts parity)", () => {
  it("returns the platform closest to the point with its distance and band", () => {
    const closest = nearestParty({ economic: -3.5, social: -2.2 }, [DEM, REP, UK_LAB]);
    expect(closest?.party.id).toBe("US_DEM");
    expect(closest?.band).toBe("aligned");
  });

  it("returns null when no party carries authored positions", () => {
    expect(nearestParty({ economic: 0, social: 0 }, [])).toBeNull();
  });
});

describe("ideologyLabel (reference politics.ts getCompassPositionLabel parity)", () => {
  it("names the archetype quadrant, flipping the social axis sign", () => {
    // The character/party ruler stores traditional as POSITIVE social, the
    // INVERSE of the reference compass archetype axis. A left-authoritarian
    // point (econ -4, social +3.5) therefore maps to the reference (-4, -3.5)
    // region, whose nearest archetype is "Authoritarian Left".
    expect(ideologyLabel({ economic: -4, social: 3.5 })).toBe("Authoritarian Left");
    // A traditionalist on the right maps to reference (1, -2.5) => Traditionalist.
    expect(ideologyLabel({ economic: 1, social: 2.5 })).toBe("Traditionalist");
    expect(ideologyLabel({ economic: 0, social: 0 })).toBe("Centrist");
  });
});
