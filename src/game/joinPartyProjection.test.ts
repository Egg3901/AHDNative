import { describe, expect, it } from "vitest";
import { createWorld } from "@ahdclient/engine";
import { GameSession, joinPartyDisabledReason } from "./session";

/**
 * Hub joinParty projection vs the authoritative canJoinParty contract
 * (#243 fresh-world audit follow-up).
 *
 * The hub row carries a party picker, so it cannot name a target: it stays
 * enabled while any same-country party passes canJoinParty, and names the
 * engine reason once no selectable party can execute. Before this fix the
 * hub exposed joinParty as enabled during the 24-turn switch cooldown, when
 * every join attempt fails. executeAction stays authoritative throughout.
 */

const stamp = "2026-09-18T00:00:00.000Z";

const DEMOGRAPHICS = {
  race: "white",
  gender: "male",
  education: "college",
  wealth: "high",
} as const;

function memberCreation(partyId: string) {
  return {
    name: "Alex",
    partyId,
    policies: { economic: 0, social: 0 },
    demographics: { ...DEMOGRAPHICS },
    stats: {
      charisma: 4,
      debate: 4,
      energy: 4,
      fundraising: 4,
      businessAcumen: 4,
      statecraft: 4,
      intellect: 4,
    },
  };
}

function hubJoin(session: GameSession) {
  const entry = session.view().actions.find((action) => action.id === "joinParty");
  expect(entry).toBeDefined();
  return entry!;
}

describe("hub joinParty projection", () => {
  it("stays available for an eligible independent world and executes", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "join-eligible", playerName: "Alex" });

    const entry = hubJoin(session);
    expect(entry.available).toBe(true);
    expect(entry.disabledReason).toBeUndefined();
    expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);
  });

  it("stays available for a fresh creation member when a switch can execute", () => {
    const session = new GameSession();
    session.create({
      era: "1953", countryId: "US", seed: "join-fresh-member", playerName: "Alex",
      creation: memberCreation("US_DEM"),
    });

    // The hub row is truthful: joining US_REP succeeds from this state.
    expect(hubJoin(session)).toMatchObject({ available: true });
    const parties = session.view().parties;
    expect(parties.find((p) => p.id === "US_DEM")?.membership?.join).toMatchObject({
      available: false,
      disabledReason: "You are already a member of this party.",
    });
    expect(parties.find((p) => p.id === "US_REP")?.membership?.join).toMatchObject({ available: true });

    const same = session.act("joinParty", { partyId: "US_DEM" });
    expect(same.ok).toBe(false);
    if (!same.ok) expect(same.error).toMatch("Already a member of US_DEM");
    expect(session.act("joinParty", { partyId: "US_REP" }).ok).toBe(true);
  });

  it("disables with the cooldown reason when no switch can execute, then recovers", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "join-cooldown", playerName: "Alex" });
    expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);

    expect(hubJoin(session)).toMatchObject({
      available: false,
      disabledReason: "Party switch cooldown: 24 turn(s) remaining",
    });
    // The projection names the exact engine refusal.
    const refused = session.act("joinParty", { partyId: "US_REP" });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe("Party switch cooldown: 24 turn(s) remaining");

    // Save/reload preserves the gate mid-cooldown.
    const reloaded = new GameSession();
    reloaded.load(session.serialize(stamp));
    expect(hubJoin(reloaded)).toMatchObject({
      available: false,
      disabledReason: "Party switch cooldown: 24 turn(s) remaining",
    });

    // Expire the cooldown through the persisted turn anchor rather than
    // simulating 24 full world turns. This exercises the same save/load
    // contract without making a projection test pay the full simulation cost.
    const expired = JSON.parse(session.serialize(stamp)) as {
      world: { meta: { turn: number }; player: { lastPartySwitchTurn?: number | null } };
    };
    expired.world.meta.turn = (expired.world.player.lastPartySwitchTurn ?? 0) + 24;
    const recovered = new GameSession();
    recovered.load(JSON.stringify(expired));
    expect(hubJoin(recovered)).toMatchObject({ available: true });
    expect(recovered.act("joinParty", { partyId: "US_REP" }).ok).toBe(true);
  });

  it("disables with already-member when a single-party member has no alternative", () => {
    const session = new GameSession();
    session.create({
      era: "1953", countryId: "RU", seed: "join-single-party", playerName: "Alex",
      creation: memberCreation("RU_CPSU"),
    });

    expect(hubJoin(session)).toMatchObject({
      available: false,
      disabledReason: "Already a member of RU_CPSU",
    });
    const same = session.act("joinParty", { partyId: "RU_CPSU" });
    expect(same.ok).toBe(false);
    if (!same.ok) expect(same.error).toBe("Already a member of RU_CPSU");
  });

  it("refuses a missing party through the engine and names it at the hub helper", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "join-missing", playerName: "Alex" });

    const missing = session.act("joinParty", { partyId: "US_NOPE" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toBe("Party not found: US_NOPE");
    expect(session.view().player.partyName).toBe("Independent");

    // Defensive branch: a world with no home parties offers no target.
    const empty = createWorld({ seed: "join-empty", playerName: "Alex", countryId: "US", era: "1953" });
    for (const id of Object.keys(empty.parties)) delete empty.parties[id];
    expect(joinPartyDisabledReason(empty)).toBe("No parties recorded for your country.");
  });
});
