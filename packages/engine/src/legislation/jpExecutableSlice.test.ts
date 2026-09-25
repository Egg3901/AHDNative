import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { createWorld } from "../world.js";
import { getLaw } from "./catalog.js";

/**
 * #283 correction: the authored Japan consumption-tax row and engine policy
 * were previously tested by letting a US Head of State sponsor a JP bill via
 * sponsorCountryId. The AHDGame proposal route requires a same-country seat
 * or sovereign role, and JP is not a playable Native country in any pack.
 * That earlier direct-state exercise did not prove a player-reachable law.
 */
describe("Japan consumption-tax catalog boundary (#283)", () => {
  it("retains the authored option but refuses foreign player sponsorship", () => {
    expect(getLaw("jp_consumption_tax")?.taxPolicy?.options?.find((option) => option.rate === 13))
      .toMatchObject({ id: "jp_consumption_tax_opt_6", economic: 1, social: 0 });
    const world = createWorld({ seed: "jp-law-country-gate", playerName: "P", countryId: "US", era: "1991" });
    world.player.mode = "hos";
    world.player.actions = 100;
    const before = world.player.actions;
    expect(executeAction(world, "player", "sponsorBill", {
      catalogId: "jp_consumption_tax", sponsorCountryId: "JP", taxRate: 13,
    })).toMatchObject({ ok: false, error: expect.stringContaining("player's country") });
    expect(world.player.actions).toBe(before);
    expect(world.bills).toHaveLength(0);
  });
});
