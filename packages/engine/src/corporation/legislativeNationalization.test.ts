import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../index.js";
import { executeAction } from "../actions/execute.js";
import { deserializeSave, serializeSave, projectSaveToV42 } from "../save.js";

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
    // Source treats a recorded null legacy privatization clock as no cooldown.
    world.corporations["US-media"]!.privatizedAtTurn = null;
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
  it("posts a player-origin legislative taking with the source 48-turn notice instead of using executive distress", () => {
    const world = createWorld({ seed: "fair-player-notice", era: "1953", countryId: "US", playerName: "President", mode: "hos" });
    // Recorded creator-origin and proposal resources, not an earned founding career.
    world.corporations["US-media"]!.nationalizationOwnerKind = "player";
    world.player.nationalInfluence = 5;
    expect(executeAction(world, "player", "nationalizeCorporation", { corporationId: "US-media", tier: "seizure" }).ok).toBe(false);
    expect(executeAction(world, "player", "sponsorBill", { catalogId: "state_ownership.nationalize", corporationId: "US-media" })).toMatchObject({ ok: true });
    const saved = JSON.parse(serializeSave(world, "1953-01-01T00:00:00.000Z"));
    expect(saved.world.corporations["US-media"]).toBeDefined();
    expect(saved.world.stateOwnershipLedger).toBeUndefined();
    expect(saved.world.pendingNationalizations).toMatchObject([{ targetCorporationId: "US-media", countryId: "US", method: "legislative", tier: "fair", status: "pending", postedAtTurn: 0, noticeDeadlineTurn: 48 }]);
    expect(projectSaveToV42(JSON.stringify(saved))).toMatchObject({ ok: false, error: expect.stringMatching(/notice|pending nationalization/i) });
    const resumed = deserializeSave(JSON.stringify(saved));
    expect(JSON.parse(serializeSave(resumed, "1953-01-01T00:00:00.000Z")).world.pendingNationalizations).toEqual(saved.world.pendingNationalizations);
  });

  it("completes the recorded legislative notice at its ordinary turn deadline and matches restored continuation", () => {
    const world = createWorld({ seed: "fair-player-due", era: "1953", countryId: "US", playerName: "President", mode: "hos" });
    world.corporations["US-media"]!.nationalizationOwnerKind = "player";
    world.player.nationalInfluence = 5;
    // Recorded unknown governing-party context selects source neutral ideology.
    world.executives.US!.presidentParty = null;
    expect(executeAction(world, "player", "sponsorBill", { catalogId: "state_ownership.nationalize", corporationId: "US-media" }).ok).toBe(true);
    const nearDeadline = JSON.parse(serializeSave(world, "1953-01-01T00:00:00.000Z"));
    // A recorded near-deadline continuation, not proof of a 48-turn earned career.
    nearDeadline.world.meta.turn = 47;
    const direct = deserializeSave(JSON.stringify(nearDeadline));
    const restored = deserializeSave(serializeSave(direct, "1953-01-01T00:00:00.000Z"));
    advanceTurn(direct);
    advanceTurn(restored);
    expect(direct.corporations["US-media"]).toBeUndefined();
    expect(direct.pendingNationalizations?.at(-1)).toMatchObject({ status: "completed", resolvedAtTurn: 48 });
    expect(direct.stateOwnershipLedger?.at(-1)).toMatchObject({ method: "legislative", tier: "fair", triggers: ["supermajority"], turn: 48 });
    expect(JSON.parse(serializeSave(restored, "1953-01-01T00:00:00.000Z")).world).toEqual(JSON.parse(serializeSave(direct, "1953-01-01T00:00:00.000Z")).world);
  });

});
