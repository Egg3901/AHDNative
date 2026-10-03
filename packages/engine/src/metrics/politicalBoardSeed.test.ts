import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";

describe("political board source equilibrium initialization", () => {
  it("seeds the Game structural residual from the authored DD 1953 law baselines", () => {
    const world = createWorld({ seed: "dd-board-baseline-residual", playerName: "Policy Chair", countryId: "DD", era: "1953", mode: "hos" });
    const board = world.regionalPoliticalMetrics?.BEO;

    expect(board?.countryId).toBe("DD");
    expect(board?.values["economy.workerSecurity"]).toBe(78);
    // Independent Game 968 politicalLegislation vector: national target 45.5,
    // no initial regional both-scope enactment, so 78 - 45.5 = 32.5.
    expect(board?.residuals?.["economy.workerSecurity"]).toBe(32.5);
  });
});
