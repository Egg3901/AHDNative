import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { createWorld } from "../world.js";

describe("source-authored political direction for tax options", () => {
  it("keeps political stance independent from fiscal rate movement", () => {
    const world = createWorld({ seed: "ie-tax-option-stance", playerName: "P", countryId: "IE", era: "1991", mode: "hos" });
    world.player.actions = 100;
    world.player.nationalInfluence = 10;

    expect(executeAction(world, "player", "sponsorBill", { catalogId: "ie_vat_rate", taxRate: 23 }).ok).toBe(true);
    expect(world.bills.at(-1)).toMatchObject({
      selectedRate: 23,
      effectDirection: 0,
      provisions: [expect.objectContaining({ policyOptionId: "ie_vat_rate_opt_6", effectDirection: 0 })],
    });

    const zero = createWorld({ seed: "ie-tax-option-abolition", playerName: "P", countryId: "IE", era: "1991", mode: "hos" });
    zero.player.actions = 100;
    zero.player.nationalInfluence = 5;
    expect(executeAction(zero, "player", "sponsorBill", { catalogId: "ie_vat_rate", taxRate: 0 }).ok).toBe(true);
    expect(zero.bills.at(-1)).toMatchObject({
      selectedRate: 0,
      effectDirection: -1,
      provisions: [expect.objectContaining({ policyOptionId: "ie_vat_rate_opt_0", effectDirection: -1 })],
    });
  });

});
