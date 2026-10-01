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
});
