import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-02T00:00:00.000Z";

function initialSession(seed: string) {
  const session = new GameSession();
  session.create({ era: "1953", countryId: "US", seed, playerName: "Alex", mode: "hos", homeRegionId: "NY" });
  return session;
}

// Vectors independently executed from current Game evaluateEligibility:
// NPCs require no distress; player financial distress and vacancy mature at72.
describe("source executive nationalization eligibility (#75)", () => {
  it("offers and takes a source NPC-founded solvent company without inventing financial distress", () => {
    const session = initialSession("source-npc-taking");
    const action = session.view().actions.find(row => row.id === "nationalizeCorporation")!;
    expect(action.choices?.some(row => row.id === "US-media")).toBe(true);
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "seizure" }).ok).toBe(true);
    expect(session.stateOwnership().rows[0]).toMatchObject({ triggers: ["npc"], triggerLabel: "NPC-owned" });
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.stateOwnership()).toEqual(session.stateOwnership());
  });

  it.each([71, 72])("enforces the source player financial-distress grace at turn %s", turn => {
    const session = initialSession("source-player-grace");
    const save = JSON.parse(session.serialize(SAVED_AT));
    save.world.meta.turn = turn;
    const donor = save.world.corporations["US-media"];
    // Source userId-origin classification is independent of current CEO.
    donor.nationalizationOwnerKind = "player";
    donor.liquidCapital = -50;
    donor.insolventSinceTurn = 0;
    donor.financialDistressSinceTurn = 0;
    session.load(JSON.stringify(save));
    const before = session.serialize(SAVED_AT);
    const result = session.act("nationalizeCorporation", { corporationId: donor.id, tier: "seizure" });
    expect(result.ok).toBe(turn >= 72);
    if (turn < 72) expect(session.serialize(SAVED_AT)).toBe(before);
    else expect(session.stateOwnership().rows[0].triggers).toEqual(["distress"]);
  });

  it("refuses a cured player firm even when an old insolvency timestamp remains", () => {
    const session = initialSession("source-cured-player");
    const save = JSON.parse(session.serialize(SAVED_AT));
    save.world.meta.turn = 100;
    Object.assign(save.world.corporations["US-media"], {
      nationalizationOwnerKind: "player", liquidCapital: 50,
      insolventSinceTurn: 0, financialDistressSinceTurn: 0,
    });
    session.load(JSON.stringify(save));
    const before = session.serialize(SAVED_AT);
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "seizure" }).ok).toBe(false);
    expect(session.serialize(SAVED_AT)).toBe(before);
  });

  it.each([71, 72])("uses the source seated/vacant CEO clock independently at turn %s", turn => {
    const session = initialSession("source-ceo-vacancy");
    const save = JSON.parse(session.serialize(SAVED_AT));
    save.world.meta.turn = turn;
    Object.assign(save.world.corporations["US-media"], {
      nationalizationOwnerKind: "player", liquidCapital: 50,
      insolventSinceTurn: null, financialDistressSinceTurn: undefined,
      ceoVacant: true, ceoVacantSinceTurn: 0,
    });
    session.load(JSON.stringify(save));
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "seizure" }).ok).toBe(turn >= 72);
  });

  it.each([167, 168])("preserves the source re-nationalization cooldown at turn %s", turn => {
    const session = initialSession("source-renationalization");
    const save = JSON.parse(session.serialize(SAVED_AT));
    save.world.meta.turn = turn;
    Object.assign(save.world.corporations["US-media"], {
      nationalizationOwnerKind: "npc", insolventSinceTurn: 0, privatizedAtTurn: 0,
    });
    session.load(JSON.stringify(save));
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "seizure" }).ok).toBe(turn >= 168);
  });
  it("starts and preserves the source player distress clock after actual turn cash, then clears a cure on continuation", () => {
    const session = initialSession("source-player-clock");
    const save = JSON.parse(session.serialize(SAVED_AT));
    Object.assign(save.world.corporations["US-media"], {
      nationalizationOwnerKind: "player", liquidCapital: -1e12,
      ceoType: "player", ceoId: "player", ceoVacant: false,
      insolventSinceTurn: null, financialDistressSinceTurn: undefined,
    });
    session.load(JSON.stringify(save));
    session.advance();
    const started = JSON.parse(session.serialize(SAVED_AT));
    expect(started.world.corporations["US-media"].liquidCapital).toBeLessThan(0);
    expect(started.world.corporations["US-media"].financialDistressSinceTurn).toBe(started.world.meta.turn);
    const resumed = new GameSession();
    resumed.load(JSON.stringify(started));
    resumed.advance();
    const continued = JSON.parse(resumed.serialize(SAVED_AT));
    expect(continued.world.corporations["US-media"].financialDistressSinceTurn).toBe(started.world.meta.turn);
    // A recorded cash recovery goes through the same public continuation
    // boundary; no earlier onset is reconstructed or silently backfilled.
    continued.world.corporations["US-media"].liquidCapital = 1e12;
    resumed.load(JSON.stringify(continued));
    resumed.advance();
    expect(JSON.parse(resumed.serialize(SAVED_AT)).world.corporations["US-media"].financialDistressSinceTurn).toBeUndefined();
  });

  it("keeps the source NPC creator classification when the recorded CEO is the player", () => {
    const session = initialSession("source-owner-versus-manager");
    const save = JSON.parse(session.serialize(SAVED_AT));
    Object.assign(save.world.corporations["US-media"], { ceoType: "player", ceoId: "player", ceoVacant: false });
    session.load(JSON.stringify(save));
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "seizure" }).ok).toBe(true);
    expect(session.stateOwnership().rows[0].triggers).toEqual(["npc"]);
  });

  it("starts and clears the source vacancy clock through shareholder vote, accept, resign and saved continuation", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", homeRegionId: "DC", seed: "source-ceo-clock", playerName: "Alex" });
    expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    expect(session.act("voteCeo", { corpId: "US-media", candidateId: "player" }).ok).toBe(true);
    expect(session.act("acceptCeoAppointment", { corpId: "US-media" }).ok).toBe(true);
    session.advance();
    expect(session.act("resignCeo", { corpId: "US-media" }).ok).toBe(true);
    const resigned = JSON.parse(session.serialize(SAVED_AT));
    expect(resigned.world.corporations["US-media"].ceoVacantSinceTurn).toBe(resigned.world.meta.turn);
    const resumed = new GameSession();
    resumed.load(JSON.stringify(resigned));
    expect(resumed.act("voteCeo", { corpId: "US-media", candidateId: "player" }).ok).toBe(true);
    expect(resumed.act("acceptCeoAppointment", { corpId: "US-media" }).ok).toBe(true);
    const seated = JSON.parse(resumed.serialize(SAVED_AT));
    expect(seated.world.corporations["US-media"].ceoVacant).toBe(false);
    expect(seated.world.corporations["US-media"].ceoVacantSinceTurn).toBeUndefined();
  });
});
