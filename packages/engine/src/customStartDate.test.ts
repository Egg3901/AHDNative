import { describe, expect, it } from "vitest";
import { createWorld } from "./world.js";

describe("custom world start date", () => {
  it("keeps the authored content era while starting on the requested date", () => {
    const world = createWorld({
      era: "1991",
      startDate: "1994-04-23",
      countryId: "US",
      playerName: "Player",
      seed: "custom-date",
    });
    expect(world.meta.era).toBe("1991");
    expect(world.meta.date).toBe("1994-04-23");
    expect(world.news[0]?.date).toBe("1994-04-23");
  });

  it("rejects a date before the selected content anchor", () => {
    expect(() =>
      createWorld({
        era: "1991",
        startDate: "1989-01-01",
        countryId: "US",
        playerName: "Player",
        seed: "invalid-date",
      }),
    ).toThrow(/cannot precede/);
  });
});
