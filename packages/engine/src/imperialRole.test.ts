import { describe, expect, it } from "vitest";
import {
  IMPERIAL_STARTING_CAPITAL,
  getImperialRole,
  getImperialTitle,
  resolveProfileDestination,
} from "./imperialRole.js";

describe("imperial role reference facts (#242)", () => {
  it("titles the UK head of state King/Queen/Monarch by gender", () => {
    expect(getImperialTitle("UK", "male")).toBe("King");
    expect(getImperialTitle("UK", "female")).toBe("Queen");
    expect(getImperialTitle("UK", "nonbinary")).toBe("Monarch");
  });

  it("titles the JP head of state Emperor/Empress/Emperor by gender", () => {
    expect(getImperialTitle("JP", "male")).toBe("Emperor");
    expect(getImperialTitle("JP", "female")).toBe("Empress");
    expect(getImperialTitle("JP", "nonbinary")).toBe("Emperor");
  });

  it("returns no title where the reference configures none (US, DE, ES, SE)", () => {
    expect(getImperialTitle("US", "male")).toBeNull();
    expect(getImperialTitle("DE", "female")).toBeNull();
    expect(getImperialTitle("ES", "male")).toBeNull();
    expect(getImperialTitle("SE", "female")).toBeNull();
  });

  it("reports the UK starter corporation and starting capital exactly", () => {
    expect(getImperialRole("UK")).toEqual({
      titles: { male: "King", female: "Queen", nonbinary: "Monarch" },
      corporation: { name: "Royal Estate", sector: "real_estate" },
    });
    expect(IMPERIAL_STARTING_CAPITAL).toBe(50_000_000);
  });

  it("reports the JP starter corporation exactly", () => {
    expect(getImperialRole("JP")).toEqual({
      titles: { male: "Emperor", female: "Empress", nonbinary: "Emperor" },
      corporation: { name: "Chrysanthemum Properties", sector: "real_estate" },
    });
  });

  it("returns no role where the reference has no imperial configuration", () => {
    expect(getImperialRole("US")).toBeNull();
    expect(getImperialRole("DE")).toBeNull();
    expect(getImperialRole("ES")).toBeNull();
    expect(getImperialRole("SE")).toBeNull();
  });
});

describe("imperial profile gate (#54)", () => {
  const record = { id: "IMP-1", sequentialId: 7, name: "George" };

  it("routes ordinary saves to the ordinary profile when nothing is marked", () => {
    expect(resolveProfileDestination(null)).toBe("profile");
    expect(resolveProfileDestination(undefined)).toBe("profile");
    expect(resolveProfileDestination({})).toBe("profile");
  });

  it("routes to the ordinary profile when the marker is absent, even with a record", () => {
    expect(resolveProfileDestination({ imperialCharacter: record })).toBe("profile");
    expect(
      resolveProfileDestination({ activeCharacterType: "character", activeImperialCharacterId: "IMP-1", imperialCharacter: record }),
    ).toBe("profile");
  });

  it("routes to the ordinary profile when the record does not resolve, even with a marker", () => {
    expect(
      resolveProfileDestination({ activeCharacterType: "imperial", activeImperialCharacterId: "IMP-1" }),
    ).toBe("profile");
    expect(
      resolveProfileDestination({
        activeCharacterType: "imperial",
        activeImperialCharacterId: "IMP-1",
        imperialCharacter: null,
      }),
    ).toBe("profile");
    expect(
      resolveProfileDestination({
        activeCharacterType: "imperial",
        activeImperialCharacterId: "IMP-9",
        imperialCharacter: record,
      }),
    ).toBe("profile");
  });

  it("routes to the imperial destination only when the marker and record resolve together", () => {
    expect(
      resolveProfileDestination({
        activeCharacterType: "imperial",
        activeImperialCharacterId: "IMP-1",
        imperialCharacter: record,
      }),
    ).toBe("imperial");
    expect(
      resolveProfileDestination({
        activeCharacterType: "imperial",
        activeImperialCharacterId: 7,
        imperialCharacter: record,
      }),
    ).toBe("imperial");
  });
});
