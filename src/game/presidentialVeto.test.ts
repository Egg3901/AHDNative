import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-03T12:00:00.000Z";

function addEnrolledBill(session: GameSession) {
  const save = JSON.parse(session.serialize(SAVED_AT)) as { world: Record<string, unknown> };
  const world = save.world;
  (world["bills"] as Array<Record<string, unknown>>).push({
    id: "presidential-veto-contract",
    title: "Enrolled source-contract bill",
    summary: "Declared enrolled-phase fixture for the public executive action boundary.",
    countryId: "US",
    category: "economy",
    provisions: [],
    originChamber: "house",
    currentChamber: "house",
    status: "enrolled",
    sponsorId: "US-1",
    sponsorName: "Source fixture sponsor",
    sponsorPartyId: "US_DEM",
    votes: { "US-1": "for" },
    votesFor: 1,
    votesAgainst: 0,
    votesAbstain: 0,
    proposedAtTurn: 0,
    presidentActionDeadlineOnTurn: (world["meta"] as { turn: number }).turn + 2,
    filibusterInvocations: [],
    updatedAtTurn: (world["meta"] as { turn: number }).turn,
  });
  world["partyWhips"] = [{
    id: "passage-phase-whip",
    billId: "presidential-veto-contract",
    partyId: "US_DEM",
    countryId: "US",
    chamber: "house",
    direction: "for",
    mode: "soft",
    attemptNumber: 1,
    issuedAtTurn: (world["meta"] as { turn: number }).turn,
    issuerId: "player",
    issuerRole: "chair",
  }];
  const loaded = new GameSession(() => new Date(SAVED_AT));
  loaded.load(JSON.stringify(save));
  return loaded;
}

describe("US presidential veto action boundary", () => {
  it("vetoes an enrolled bill through GameSession and preserves a clean override window across reload", () => {
    const creator = new GameSession(() => new Date(SAVED_AT));
    creator.create({ era: "1953", countryId: "US", seed: "veto-action-boundary", playerName: "President", mode: "hos", homeRegionId: "NY" });
    const session = addEnrolledBill(creator);

    expect(session.legislation().chambers[0]?.completed.find((bill) => bill.id === "presidential-veto-contract")?.vetoAvailable).toBe(true);
    const result = session.act("vetoBill", { billId: "presidential-veto-contract", vetoMessage: "I object." });
    expect(result).toMatchObject({ ok: true });

    const after = JSON.parse(session.serialize(SAVED_AT)) as { world: { meta: { turn: number }; bills: Array<Record<string, unknown>>; partyWhips: unknown[] } };
    const bill = after.world.bills.find((candidate) => candidate["id"] === "presidential-veto-contract")!;
    expect(bill).toMatchObject({
      status: "veto_override",
      presidentAction: "vetoed",
      vetoMessage: "I object.",
      vetoedByCharacterId: "player",
      vetoedAtTurn: after.world.meta.turn,
      overrideVotingStartedAtTurn: after.world.meta.turn,
      overrideVotingEndsOnTurn: after.world.meta.turn + 2,
      vetoOverrideVotes: {},
      vetoOverrideVotesFor: 0,
      vetoOverrideVotesAgainst: 0,
    });
    expect(after.world.partyWhips).toEqual([]);

    const resumed = new GameSession(() => new Date(SAVED_AT));
    resumed.load(session.serialize(SAVED_AT));
    const persisted = JSON.parse(resumed.serialize(SAVED_AT)) as typeof after;
    expect(persisted.world.bills.find((candidate) => candidate["id"] === "presidential-veto-contract")).toEqual(bill);
    resumed.advance();
    expect(resumed.view().turn).toBe(after.world.meta.turn + 1);
  });

  it("refuses a veto when the player is not the recorded US President without changing the save", () => {
    const creator = new GameSession(() => new Date(SAVED_AT));
    creator.create({ era: "1953", countryId: "US", seed: "veto-not-president", playerName: "Candidate", mode: "career", homeRegionId: "NY" });
    const session = addEnrolledBill(creator);
    const before = session.serialize(SAVED_AT);
    expect(session.act("vetoBill", { billId: "presidential-veto-contract" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/sitting US President/i),
    });
    expect(session.serialize(SAVED_AT)).toBe(before);
  });
});
