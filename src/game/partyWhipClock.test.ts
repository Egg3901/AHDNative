import { describe, expect, it } from "vitest";
import { createWorld, serializeSave, type Bill } from "@ahdclient/engine";
import { GameSession } from "./session";

const OPTIONS = { seed: "leadership-acceptance", playerName: "Player", countryId: "US", era: "1953" } as const;

function activeBill(id: string, chamber = "house"): Bill {
  return {
    id,
    title: "Party discipline test",
    summary: "Test bill",
    countryId: "US",
    category: "economy",
    provisions: [],
    originChamber: chamber,
    currentChamber: chamber,
    status: "active",
    sponsorId: null,
    sponsorName: "Test sponsor",
    sponsorPartyId: "US_DEM",
    votes: {},
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    proposedAtTurn: 0,
    filibusterInvocations: [],
    updatedAtTurn: 0,
  };
}

describe("source party whip wall-clock session continuation", () => {
  it("checks custom-party NPP controls against observed wall time, not game turns", () => {
    const world = createWorld(OPTIONS);
    world.player.partyId = "US_DEM";
    world.player.partyJoinedTurn = 21;
    world.parties.US_DEM!.isDefault = false;
    world.parties.US_DEM!.chairId = "player";
    world.parties.US_DEM!.nppControlCreatedAt = "2026-10-03T00:00:00.000Z";
    world.player.partyJoinedAt = "2026-10-01T00:00:00.000Z";
    world.player.lastPartySwitchAt = "2026-10-01T00:00:00.000Z";
    world.charters.push({
      id: "custom-party-charter",
      countryId: "US",
      partyId: "US_DEM",
      founderId: "player",
      foundedAtTurn: 20,
      status: "ratified",
      expiresOnTurn: null,
      expiresAt: null,
      founderReplacementDeadlineTurn: null,
      founderReplacementDeadline: null,
      proposedName: "Custom Democrats",
      proposedAbbr: "DEM",
      founderIds: ["player"],
      signatures: [{ founderId: "player", signedAtTurn: 20 }],
      platform: { economic: 0, social: 0 },
      createdAtTurn: 20,
      ratifiedAtTurn: 20,
    });
    world.meta.turn = 5000;
    world.bills.push(activeBill("bill-custom-whip"));
    let now = new Date("2026-10-04T23:59:00.000Z");
    const session = new GameSession(() => new Date(now));
    session.load(serializeSave(world, "2026-10-04T23:59:00.000Z"));
    expect(session.legislation({ billId: "bill-custom-whip" }).selectedBill?.hardWhip)
      .toMatchObject({ available: false, disabledReason: expect.stringMatching(/48 hours/i) });
    const tooEarly = session.act("issuePartyWhip", {
      billId: "bill-custom-whip",
      whipDirection: "for",
      whipMode: "soft",
    });
    expect(tooEarly).toMatchObject({ ok: false, error: expect.stringMatching(/48 hours/i) });
    expect(JSON.parse(session.serialize("2026-10-04T23:59:00.000Z")).world.partyWhips).toBeUndefined();

    world.parties.US_DEM!.nppControlCreatedAt = "2026-10-01T00:00:00.000Z";
    world.player.partyJoinedAt = "2026-10-03T00:00:00.000Z";
    world.player.lastPartySwitchAt = "2026-10-03T00:00:00.000Z";
    session.load(serializeSave(world, "2026-10-04T23:59:00.000Z"));
    expect(session.legislation({ billId: "bill-custom-whip" }).selectedBill?.hardWhip)
      .toMatchObject({ available: false, disabledReason: expect.stringMatching(/stable membership/i) });
    const memberTenureTooEarly = session.act("issuePartyWhip", {
      billId: "bill-custom-whip",
      whipDirection: "for",
      whipMode: "soft",
    });
    expect(memberTenureTooEarly).toMatchObject({ ok: false, error: expect.stringMatching(/stable membership/i) });

    now = new Date("2026-10-05T00:00:00.000Z");
    expect(session.legislation({ billId: "bill-custom-whip" }).selectedBill?.hardWhip)
      .toEqual({ available: true });
    const ready = session.act("issuePartyWhip", {
      billId: "bill-custom-whip",
      whipDirection: "for",
      whipMode: "soft",
    });
    expect(ready.ok).toBe(true);
    const restored = new GameSession(() => new Date(now));
    restored.load(session.serialize("2026-10-05T00:00:00.000Z"));
    expect(restored.legislation({ billId: "bill-custom-whip" }).selectedBill?.hardWhip)
      .toEqual({ available: true });
    const serializedWorld = JSON.parse(restored.serialize("2026-10-05T00:00:00.000Z")).world;
    expect(serializedWorld.partyWhips).toMatchObject([{ attemptNumber: 1 }]);
    expect(serializedWorld.parties.US_DEM.nppControlCreatedAt).toBe("2026-10-01T00:00:00.000Z");
    expect(serializedWorld.player.partyJoinedAt).toBe("2026-10-03T00:00:00.000Z");
    expect(serializedWorld.player.lastPartySwitchAt).toBe("2026-10-03T00:00:00.000Z");
  });

});
