import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { executeAction } from "../actions/execute.js";
import { deserializeSave, serializeSave } from "../save.js";

// Public executive command boundary. Source's country nationalize route
// authorizes discounted/seizure; a fair-value taking requires a passed bill.
describe("source nationalization authority", () => {
  it("refuses a fair-value executive taking without changing the world", () => {
    const world = createWorld({ seed: "fair-requires-legislation", era: "1953", countryId: "US", playerName: "President", mode: "hos" });
    const before = JSON.stringify(world);
    const result = executeAction(world, "player", "nationalizeCorporation", { corporationId: "US-media", tier: "fair" });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/passed.*bill|legislat/i) });
    expect(JSON.stringify(world)).toBe(before);
  });
  it("enacts a sovereign state-ownership bill at fair value and preserves its legislative authority on reload", () => {
    const world = createWorld({ seed: "fair-legislative-npc", era: "1953", countryId: "US", playerName: "President", mode: "hos" });
    // Recorded proposal resource budget; this does not claim an earned NPI career.
    world.player.nationalInfluence = 5;
    const actions = world.player.actions;
    const result = executeAction(world, "player", "sponsorBill", { catalogId: "state_ownership.nationalize", corporationId: "US-media" });
    expect(result).toMatchObject({ ok: true });
    // Source onBillEnacted refunds the recorded charge once after passage.
    expect(world.player.actions).toBe(actions);
    expect(world.player.nationalInfluence).toBe(5);
    expect(world.bills.at(-1)).toMatchObject({ category: "state ownership", status: "signed", proposalCostsRefunded: true, proposalActionCost: 10, proposalNpiCost: 5, provisions: [{ type: "nationalize", targetCorporationId: "US-media" }] });
    expect(world.corporations["US-media"]).toBeUndefined();
    expect(world.corporations["NAT-US"]).toMatchObject({ ownershipState: "stateOwned" });
    expect(world.stateOwnershipLedger?.at(-1)).toMatchObject({ tier: "fair", method: "legislative", triggers: ["npc"] });
    const restored = deserializeSave(serializeSave(world, "1953-01-01T00:00:00.000Z"));
    expect(restored.bills.at(-1)).toEqual(world.bills.at(-1));
    expect(restored.stateOwnershipLedger).toEqual(world.stateOwnershipLedger);
  });
});
