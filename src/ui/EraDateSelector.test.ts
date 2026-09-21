import { describe, expect, it } from "vitest";
import { resetDateIso } from "./EraDateSelector";

describe("resetDateIso", () => {
  it("maps the first game week to January 1", () => {
    expect(resetDateIso(1991, 1)).toBe("1991-01-01");
  });

  it("moves one seven-day turn per selected week", () => {
    expect(resetDateIso(1991, 2)).toBe("1991-01-08");
    expect(resetDateIso(2027, 48)).toBe("2027-11-26");
  });
});
