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
  it("reaches an NPP-sponsored US bill through ordinary turns, vetoes it, and resolves the override after reload", () => {
    const session = new GameSession(() => new Date(SAVED_AT));
    session.create({ era: "1953", countryId: "US", seed: "presidential-veto-ordinary-turn", playerName: "President", mode: "hos", homeRegionId: "NY" });
    expect(session.view().player).toMatchObject({ mode: "hos", currentOffice: "president" });

    let enrolled: Record<string, unknown> | undefined;
    for (let turn = 0; turn < 24 && !enrolled; turn += 1) {
      const saved = JSON.parse(session.serialize(SAVED_AT)) as { world: { bills: Array<Record<string, unknown>> } };
      enrolled = saved.world.bills.find((bill) => bill["countryId"] === "US" && bill["nppSponsored"] === true && bill["status"] === "enrolled");
      if (!enrolled) session.advance();
    }
    if (!enrolled) {
      const saved = JSON.parse(session.serialize(SAVED_AT)) as { world: { bills: Array<Record<string, unknown>> } };
      enrolled = saved.world.bills.find((bill) => bill["countryId"] === "US" && bill["nppSponsored"] === true && bill["status"] === "enrolled");
    }
    expect(enrolled, "ordinary US NPP legislation should pass a chamber and reach the President").toBeDefined();
    const billId = String(enrolled!["id"]);
    const billBeforeVeto = JSON.parse(session.serialize(SAVED_AT)).world.bills.find((bill: Record<string, unknown>) => bill["id"] === billId);
    expect(billBeforeVeto).toMatchObject({ status: "enrolled", nppSponsored: true });
    expect(billBeforeVeto.votesFor).toBeGreaterThan(0);

    expect(session.act("vetoBill", { billId, vetoMessage: "Returned for reconsideration." })).toMatchObject({ ok: true });
    const vetoedSave = session.serialize(SAVED_AT);
    const vetoedWorld = JSON.parse(vetoedSave).world;
    const vetoed = vetoedWorld.bills.find((bill: Record<string, unknown>) => bill["id"] === billId);
    expect(vetoed).toMatchObject({
      status: "veto_override",
      presidentAction: "vetoed",
      vetoMessage: "Returned for reconsideration.",
      overrideVotingStartedAtTurn: vetoedWorld.meta.turn,
      overrideVotingEndsOnTurn: vetoedWorld.meta.turn + 2,
    });

    const resumed = new GameSession(() => new Date(SAVED_AT));
    resumed.load(vetoedSave);
    resumed.advance();
    expect(JSON.parse(resumed.serialize(SAVED_AT)).world.bills.find((bill: Record<string, unknown>) => bill["id"] === billId))
      .toMatchObject({ status: "veto_override" });
    resumed.advance();
    const resolved = JSON.parse(resumed.serialize(SAVED_AT)).world.bills.find((bill: Record<string, unknown>) => bill["id"] === billId);
    expect(["signed", "override_failed"]).toContain(resolved.status);
    expect(resolved.vetoedByCharacterId).toBe("player");
    if (resolved.status === "signed") expect(resolved.presidentAction).toBe("override");
  });

  it("signs an enrolled bill through GameSession and persists the applied enactment", () => {
    const creator = new GameSession(() => new Date(SAVED_AT));
    creator.create({ era: "1953", countryId: "US", seed: "presidential-sign-boundary", playerName: "President", mode: "hos", homeRegionId: "NY" });
    const session = addEnrolledBill(creator);

    expect(session.act("signBill", { billId: "presidential-veto-contract" })).toMatchObject({ ok: true });
    const signed = JSON.parse(session.serialize(SAVED_AT)) as { world: { bills: Array<Record<string, unknown>>; enactedLaws: Array<Record<string, unknown>> } };
    expect(signed.world.bills.find((bill) => bill["id"] === "presidential-veto-contract")).toMatchObject({
      status: "signed",
      presidentAction: "signed",
    });
    expect(signed.world.enactedLaws).toContainEqual(expect.objectContaining({ billId: "presidential-veto-contract" }));

    const resumed = new GameSession(() => new Date(SAVED_AT));
    resumed.load(session.serialize(SAVED_AT));
    expect(JSON.parse(resumed.serialize(SAVED_AT)).world.bills.find((bill: Record<string, unknown>) => bill["id"] === "presidential-veto-contract"))
      .toMatchObject({ status: "signed", presidentAction: "signed" });
  });

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

  it("refuses sign and veto when the player is not the recorded US President without changing the save", () => {
    const creator = new GameSession(() => new Date(SAVED_AT));
    creator.create({ era: "1953", countryId: "US", seed: "veto-not-president", playerName: "Candidate", mode: "career", homeRegionId: "NY" });
    const session = addEnrolledBill(creator);
    const before = session.serialize(SAVED_AT);
    expect(session.act("signBill", { billId: "presidential-veto-contract" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/sitting US President/i),
    });
    expect(session.act("vetoBill", { billId: "presidential-veto-contract" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/sitting US President/i),
    });
    expect(session.serialize(SAVED_AT)).toBe(before);
  });
});
