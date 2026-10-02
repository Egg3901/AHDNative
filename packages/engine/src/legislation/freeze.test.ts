import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { isLegislationFrozen, LEGISLATION_FREEZE_MESSAGE } from "./freeze.js";
import { executeAction } from "../actions/execute.js";
import { serializeSave } from "../save.js";

describe("parliamentary legislation freeze", () => {
  it("refuses an Irish bill while the seeded government is pending without spending resources", () => {
    const world = createWorld({ seed: "ie-pending-law-freeze", playerName: "P", countryId: "IE", era: "1991" });
    world.player.mode = "hos";
    world.player.actions = 100;
    world.player.nationalInfluence = 5;
    const before = serializeSave(world, "2026-10-01T00:00:00.000Z");

    expect(isLegislationFrozen(world, "IE")).toBe(true);
    expect(executeAction(world, "player", "sponsorBill", { catalogId: "ie_vat_rate", taxRate: 23 })).toMatchObject({
      ok: false,
      error: LEGISLATION_FREEZE_MESSAGE,
    });
    expect(serializeSave(world, "2026-10-01T00:00:00.000Z")).toEqual(before);
    expect(world.bills).toHaveLength(0);
  });

  it("allows sponsorship once the source formation state is formed", () => {
    const world = createWorld({ seed: "ie-formed-law-freeze", playerName: "P", countryId: "IE", era: "1991" });
    world.governments.IE!.status = "formed";
    world.player.mode = "hos";
    world.player.actions = 100;
    world.player.nationalInfluence = 5;

    expect(isLegislationFrozen(world, "IE")).toBe(false);
    expect(executeAction(world, "player", "sponsorBill", { catalogId: "ie_vat_rate", taxRate: 23 }).ok).toBe(true);
  });
});
