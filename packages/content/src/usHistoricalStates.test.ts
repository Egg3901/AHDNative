import { describe, expect, it } from "vitest";
import { getPackByEra } from "./index.js";

// Independently executed current AHDGame bfe655d5 state materializer and
// apportionment. These are source-authored era rows, not a 2019 fallback.
describe("source-authored historical US state content", () => {
  it("uses the actual 1999 geography before presidential apportionment", () => {
    const states = getPackByEra("1999").states!;
    expect(states.find((state) => state.id === "CT")).toMatchObject({
      population: 3_282_031, gdp: 150_000, houseSeats: 6, senateSeats: 36,
    });
    expect(states.find((state) => state.id === "DC")).toMatchObject({
      population: 519_000, gdp: 57_000, houseSeats: 0, senateSeats: 0,
    });
  });
  it("uses the actual 2007 geography and federal district", () => {
    const states = getPackByEra("2007").states!;
    expect(states.find((state) => state.id === "CT")).toMatchObject({
      population: 3_502_309, gdp: 216_000, houseSeats: 5, senateSeats: 36,
    });
    expect(states.find((state) => state.id === "DC")).toMatchObject({
      population: 588_292, gdp: 93_000, houseSeats: 0, senateSeats: 0,
    });
  });
});
