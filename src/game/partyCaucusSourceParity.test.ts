import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const SAVED_AT = "1953-01-20T00:00:00.000Z";

describe("source party and caucus charges through the player session", () => {
  it("joins a party without charging personal actions or funds and preserves membership on reload", () => {
    // Game 954f1c2 join/route.ts calls applyCharacterPartyJoin. That source
    // writes membership and resets party influence without any AP/fund debit.
    const session = new GameSession();
    const created = session.create({ era: "1953", countryId: "US", seed: "party-source-costs", playerName: "Morgan" });
    expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);
    expect(session.view().player.actions).toBe(created.player.actions);
    expect(session.view().player.funds).toBe(created.player.funds);
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.partyManagement().parties.find((party) => party.id === "US_DEM")?.isPlayerParty).toBe(true);
    expect(resumed.view().player.actions).toBe(created.player.actions);
    expect(resumed.view().player.funds).toBe(created.player.funds);
  });

  it("creates a caucus for free and persists its chair and levy without a second charge", () => {
    // Game 954f1c2 caucuses/route.ts creates treasury=0 and chair membership;
    // the only character write is factionId, with no AP or fund increment.
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "caucus-source-costs", playerName: "Morgan" });
    expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);
    const before = session.view().player;
    expect(session.act("createCaucus", { caucusName: "Civic Forum", caucusTaxRate: 2.5 }).ok).toBe(true);
    expect(session.view().player.actions).toBe(before.actions);
    expect(session.view().player.funds).toBe(before.funds);
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.caucusManagement().caucuses[0]).toMatchObject({
      name: "Civic Forum", treasury: 0, taxRate: 2.5, isPlayerChair: true, isPlayerCaucus: true,
    });
    expect(resumed.view().player.actions).toBe(before.actions);
    expect(resumed.view().player.funds).toBe(before.funds);
  });

  it("leaves a party freely, vacates its caucus chair and retains the join cooldown after reload", () => {
    // Game leave/route.ts resets party clout, closes faction membership,
    // vacates seats and retains the old join cooldown without any debit.
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "party-free-leave", playerName: "Morgan" });
    expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);
    expect(session.act("createCaucus", { caucusName: "Civic Forum" }).ok).toBe(true);
    const before = session.view().player;
    expect(session.act("leaveParty").ok).toBe(true);
    expect(session.view().player.actions).toBe(before.actions);
    expect(session.view().player.funds).toBe(before.funds);
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.partyManagement().parties.some((party) => party.isPlayerParty)).toBe(false);
    expect(resumed.caucusManagement().playerCaucusId).toBeNull();
    expect(resumed.act("joinParty", { partyId: "US_REP" })).toMatchObject({ ok: false, error: expect.stringContaining("24") });
    expect(resumed.view().player.actions).toBe(before.actions);
    expect(resumed.view().player.funds).toBe(before.funds);
  });


  it("requires a caucus chair to hand over or disband instead of leaving and preserves rejected state", () => {
    // Source members/[memberId]/route.ts rejects chair self-removal with403.
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "caucus-chair-leave", playerName: "Morgan" });
    expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);
    expect(session.act("createCaucus", { caucusName: "Civic Forum" }).ok).toBe(true);
    const before = session.serialize(SAVED_AT);
    expect(session.act("leaveCaucus")).toMatchObject({ ok: false, error: expect.stringContaining("Chairs can't leave") });
    expect(session.serialize(SAVED_AT)).toBe(before);
    const resumed = new GameSession();
    resumed.load(before);
    expect(resumed.caucusManagement().caucuses[0]?.leave).toMatchObject({ available: false, disabledReason: expect.stringContaining("Chairs can't leave") });
    expect(resumed.caucusManagement().caucuses[0]?.disband.available).toBe(true);
  });

});
