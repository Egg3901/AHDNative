import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const SAVED_AT = "1953-01-20T00:00:00.000Z";

/** Source members POST/DELETE are player-joinable only when the recorded chairId is someone else. */
function sessionWithJoinableCaucus(seed: string): GameSession {
  const session = new GameSession();
  session.create({ era: "1953", countryId: "US", seed, playerName: "Morgan" });
  expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);
  const save = JSON.parse(session.serialize(SAVED_AT)) as {
    world: { caucuses: Array<Record<string, unknown>> };
  };
  save.world.caucuses.push({
    id: "caucus-civic-forum",
    countryId: "US",
    partyId: "US_DEM",
    name: "Civic Forum",
    treasury: 0,
    taxRate: 1.5,
    disbandedAt: null,
    memberIds: ["npc-chair"],
    chairId: "npc-chair",
    viceChairId: null,
  });
  const next = new GameSession();
  next.load(JSON.stringify(save));
  return next;
}

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

  it("joins a recorded same-party caucus without charging personal actions or funds", () => {
    // Game 954f1c2 members/route.ts POST writes membership and factionId with
    // no AP or fund debit. Authority is caucus.chairId, never memberIds[0].
    const session = sessionWithJoinableCaucus("caucus-free-join");
    const quoted = session.caucusManagement().caucuses[0]!.join;
    expect(quoted).toMatchObject({ available: true, cost: 0, fundCost: 0 });
    expect(quoted.consequences).toEqual(["Joins you to this caucus"]);
    const before = session.view().player;
    expect(session.act("joinCaucus", { caucusId: "caucus-civic-forum" }).ok).toBe(true);
    expect(session.view().player.actions).toBe(before.actions);
    expect(session.view().player.funds).toBe(before.funds);
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.caucusManagement().caucuses[0]).toMatchObject({
      name: "Civic Forum", isPlayerCaucus: true, isPlayerChair: false, playerRole: "member",
    });
    expect(resumed.view().player.actions).toBe(before.actions);
    expect(resumed.view().player.funds).toBe(before.funds);
  });

  it("lets a non-chair leave for free and keeps the declined chair-tax save untouched", () => {
    // Game members/[memberId] DELETE is free; PATCH/DELETE on [slug] are chair-only
    // via recorded chairId. A member who is only memberIds[0] cannot tax.
    const session = sessionWithJoinableCaucus("caucus-free-leave");
    expect(session.act("joinCaucus", { caucusId: "caucus-civic-forum" }).ok).toBe(true);
    const quoted = session.caucusManagement().caucuses[0]!;
    expect(quoted.leave).toMatchObject({ available: true, cost: 0, fundCost: 0 });
    expect(quoted.leave.consequences).toEqual(["Removes you from this caucus"]);
    expect(quoted.setTax.available).toBe(false);
    expect(quoted.setTax.disabledReason).toMatch(/chair/i);
    const taxBefore = session.serialize(SAVED_AT);
    expect(session.act("setCaucusTaxRate", { caucusId: "caucus-civic-forum", caucusTaxRate: 4 })).toMatchObject({
      ok: false, error: expect.stringMatching(/chair/i),
    });
    expect(session.serialize(SAVED_AT)).toBe(taxBefore);
    const before = session.view().player;
    expect(session.act("leaveCaucus").ok).toBe(true);
    expect(session.view().player.actions).toBe(before.actions);
    expect(session.view().player.funds).toBe(before.funds);
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.caucusManagement().playerCaucusId).toBeNull();
    expect(resumed.caucusManagement().caucuses[0]).toMatchObject({
      isPlayerCaucus: false, chairState: "unknown", memberCount: 1,
    });
    expect(resumed.view().player.actions).toBe(before.actions);
    expect(resumed.view().player.funds).toBe(before.funds);
  });

  it("quotes and executes chair tax and disband as free through the shared projection", () => {
    // Game [slug]/route.ts PATCH tax and DELETE disband charge nothing; chair
    // identity is caucus.chairId. Disband clears members and vacates seats.
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "caucus-chair-quote", playerName: "Morgan" });
    expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);
    expect(session.act("createCaucus", { caucusName: "Civic Forum", caucusTaxRate: 2 }).ok).toBe(true);
    const id = session.caucusManagement().caucuses[0]!.id;
    const entry = session.caucusManagement().caucuses[0]!;
    expect(entry.setTax).toMatchObject({
      available: true, cost: 0, fundCost: 0, consequences: ["Sets the caucus campaign-fund levy"],
    });
    expect(entry.disband).toMatchObject({
      available: true, cost: 0, fundCost: 0,
      consequences: ["Clears all members and vacates the chair seats", "Ends any caucus membership you hold"],
    });
    const before = session.view().player;
    expect(session.act("setCaucusTaxRate", { caucusId: id, caucusTaxRate: 4.5 }).ok).toBe(true);
    expect(session.act("disbandCaucus", { caucusId: id }).ok).toBe(true);
    expect(session.view().player.actions).toBe(before.actions);
    expect(session.view().player.funds).toBe(before.funds);
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.caucusManagement().caucusCount).toBe(0);
    expect(resumed.caucusManagement().playerCaucusId).toBeNull();
    expect(resumed.view().player.actions).toBe(before.actions);
    expect(resumed.view().player.funds).toBe(before.funds);
  });

  it("refuses tax and disband when only memberIds[0] looks like the chair and keeps the save", () => {
    // Source PATCH/DELETE compare caucus.chairId to the caller, never the
    // first roster slot. A vacant recorded seat cannot tax or disband.
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "caucus-chairid-authority", playerName: "Morgan" });
    expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);
    const save = JSON.parse(session.serialize(SAVED_AT)) as {
      world: { caucuses: Array<Record<string, unknown>>; player: { caucusId: string | null } };
    };
    save.world.caucuses.push({
      id: "caucus-roster-proxy",
      countryId: "US",
      partyId: "US_DEM",
      name: "Roster Proxy",
      treasury: 0,
      taxRate: 2,
      disbandedAt: null,
      memberIds: ["player"],
      chairId: null,
      viceChairId: null,
    });
    save.world.player.caucusId = "caucus-roster-proxy";
    const loaded = new GameSession();
    loaded.load(JSON.stringify(save));
    const before = loaded.serialize(SAVED_AT);
    expect(loaded.caucusManagement().caucuses[0]?.isPlayerChair).toBe(false);
    expect(loaded.act("setCaucusTaxRate", { caucusId: "caucus-roster-proxy", caucusTaxRate: 4 })).toMatchObject({
      ok: false, error: expect.stringMatching(/chair/i),
    });
    expect(loaded.act("disbandCaucus", { caucusId: "caucus-roster-proxy" })).toMatchObject({
      ok: false, error: expect.stringMatching(/chair/i),
    });
    expect(loaded.serialize(SAVED_AT)).toBe(before);
  });

});
