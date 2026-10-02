import { describe, expect, it } from "vitest";
import { advanceTurn, createWorld, deserializeSave, executeAction, projectSaveToV42, serializeSave } from "@ahdclient/engine";
import type { Bill, ElectionRecord } from "@ahdclient/engine";
import { buildLegislationDetails } from "./legislationDetails";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-02T00:00:00.000Z";

function sourceWeightedWinners(mergedCandidateParty = false) {
    const world = createWorld({ seed: "source-weighted-winners", playerName: "TD", countryId: "IE", era: "1991" });
    world.nppAutonomyLevel = "off";
    world.player.homeRegionId = "COR";
    expect(executeAction(world, "player", "joinParty", { partyId: "IE_FF" }).ok).toBe(true);
    const opponent = world.politicians.find(p => p.countryId === "IE" && p.partyId === "IE_FG")!;
    if (mergedCandidateParty) {
      world.parties.IE_OLD = { ...world.parties.IE_FG!, id: "IE_OLD", name: "Old party", mergedIntoPartyId: "IE_FG" };
      opponent.partyId = "IE_OLD";
    }
    // Recorded ballot fixture at the public turn boundary. Game's actual
    // allocateSeats('dail', 'COR', 10, [600, 400], 1000) returns 6 and 4.
    // This verifies allocation and continuation, not career reachability.
    const race: ElectionRecord = {
      id: "dail:IE:COR:weighted-fixture", countryId: "IE", electionType: "dail", state: "COR", cycle: 1,
      chamberKey: "dail", totalSeats: 10, status: "active", startTurn: 0, primaryEndTurn: 0, endTurn: 1,
      primaryResults: { recordedAt: "1991-01-01T00:00:00.000Z", byParty: {} },
      candidates: [
        { id: "player", name: "TD", partyId: "IE_FF", isNPP: false, incumbent: false },
        { id: opponent.id, name: opponent.name, partyId: mergedCandidateParty ? "IE_OLD" : "IE_FG", isNPP: true, incumbent: false },
      ],
      tally: { player: 600_000_000_000, [opponent.id]: 400_000_000_000 },
      tallyState: {
        _id: "dail:IE:COR:weighted-fixture", electionId: "dail:IE:COR:weighted-fixture", state: "COR",
        totalVotes: { player: 600_000_000_000, [opponent.id]: 400_000_000_000 },
        candidateNames: { player: "TD", [opponent.id]: opponent.name },
        candidateParties: { player: "IE_FF", [opponent.id]: "IE_FG" },
        turnSnapshots: [], finalized: false, createdAt: "1991-01-01T00:00:00.000Z", updatedAt: "1991-01-01T00:00:00.000Z",
      },
    };
    world.elections = [race];
    advanceTurn(world);
    return { world, race, opponent };
}

describe("source multi-seat winner continuation", () => {
  it("seats a stale pre-merge candidacy into the party that now survives", () => {
    const { world, opponent } = sourceWeightedWinners(true);
    expect(opponent.chamberKey).toBe("dail");
    expect(opponent.partyId).toBe("IE_FG");
    expect(world.legislatures.IE!.chambers.find(c => c.key === "dail")!.composition.seatsByParty.IE_FG).toBeGreaterThan(0);
    expect(world.legislatures.IE!.chambers.find(c => c.key === "dail")!.composition.seatsByParty.IE_OLD).toBeUndefined();
  });

  it("retains every allocated seat on the actual human and NPP winners through an ordinary turn and reload", () => {
    const { world, race, opponent } = sourceWeightedWinners();
    expect(race.status).toBe("resolved");
    expect(world.player.legislativeSeat).toMatchObject({ countryId: "IE", chamberKey: "dail", regionId: "COR", seatsHeld: 6 });
    expect(world.politicians.find(p => p.id === opponent.id)).toMatchObject({ chamberKey: "dail", electedState: "COR", seatsHeld: 4 });
    const saved = deserializeSave(serializeSave(world, SAVED_AT));
    expect(saved.player.legislativeSeat).toEqual(world.player.legislativeSeat);
    expect(saved.politicians.find(p => p.id === opponent.id)).toMatchObject({ seatsHeld: 4 });
    const composition = saved.legislatures.IE!.chambers.find(c => c.key === "dail")!.composition;
    expect(composition).toEqual(world.legislatures.IE!.chambers.find(c => c.key === "dail")!.composition);
    advanceTurn(world);
    advanceTurn(saved);
    expect(JSON.parse(serializeSave(saved, SAVED_AT)).world).toEqual(JSON.parse(serializeSave(world, SAVED_AT)).world);
    expect(saved.player.legislativeSeat).toMatchObject({ seatsHeld: 6 });
    expect(saved.politicians.find(p => p.id === opponent.id)).toMatchObject({ seatsHeld: 4 });
  });
  it("counts the elected human's complete seat weight in the public PM vote", () => {
    const { world } = sourceWeightedWinners();
    // Recorded authority fixture, independent of chair-career reachability.
    world.parties.IE_FF!.chairId = "player";
    expect(executeAction(world, "player", "proposePmAppointment").ok).toBe(true);
    const appointment = world.pmAppointmentVotes.at(-1)!;
    expect(executeAction(world, "player", "votePmAppointment", { pmAppointmentVoteId: appointment.id, pmVote: "aye" }).ok).toBe(true);
    expect(appointment.votesFor).toBe(6);
    const resumed = deserializeSave(serializeSave(world, SAVED_AT));
    expect(resumed.pmAppointmentVotes.at(-1)!.votesFor).toBe(6);
  });

  it("shows the actual weighted current-holder bill ballot through the public action and query", () => {
    const { world, opponent } = sourceWeightedWinners();
    const bill: Bill = {
      id: "weighted-bill", title: "Recorded bill ballot", summary: "", countryId: "IE", category: "economy",
      provisions: [], originChamber: "dail", currentChamber: "dail", status: "active",
      sponsorId: "player", sponsorName: "TD", sponsorPartyId: "IE_FF",
      votes: { [opponent.id]: "against", departed: "against" }, votesFor: 0, votesAgainst: 0, votesAbstain: 0,
      proposedAtTurn: world.meta.turn, votingEndsOnTurn: world.meta.turn + 2,
      filibusterInvocations: [], updatedAtTurn: world.meta.turn,
    };
    world.bills.push(bill);
    expect(executeAction(world, "player", "voteOnBill", { billId: bill.id, vote: "for" }).ok).toBe(true);
    const card = buildLegislationDetails(world).chambers.flatMap(c => c.active).find(b => b.id === bill.id)!;
    expect(card).toMatchObject({ votesFor: 6, votesAgainst: 4, votesAbstain: 0, playerVote: "for" });
    const resumed = deserializeSave(serializeSave(world, SAVED_AT));
    const savedCard = buildLegislationDetails(resumed).chambers.flatMap(c => c.active).find(b => b.id === bill.id)!;
    expect(savedCard).toEqual(card);
  });

  it("resolves the public six-seat aye versus four-seat nay ballot and freezes it across reload and another turn", () => {
    const { world, opponent } = sourceWeightedWinners();
    const votes: Bill["votes"] = {};
    for (const holder of world.politicians) {
      if (holder.countryId === "IE" && holder.chamberKey === "dail") votes[holder.id] = "abstain";
    }
    votes[opponent.id] = "against";
    const bill: Bill = {
      id: "weighted-resolution", title: "Recorded resolution", summary: "", countryId: "IE", category: "economy",
      provisions: [], originChamber: "dail", currentChamber: "dail", status: "active",
      sponsorId: "player", sponsorName: "TD", sponsorPartyId: "IE_FF",
      votes, votesFor: 0, votesAgainst: 0, votesAbstain: 0,
      proposedAtTurn: world.meta.turn, votingEndsOnTurn: world.meta.turn + 1,
      filibusterInvocations: [], updatedAtTurn: world.meta.turn,
    };
    world.bills.push(bill);
    expect(executeAction(world, "player", "voteOnBill", { billId: bill.id, vote: "for" }).ok).toBe(true);
    const resumed = deserializeSave(serializeSave(world, SAVED_AT));
    advanceTurn(resumed);
    const resolved = resumed.bills.find(b => b.id === bill.id)!;
    expect(resolved).toMatchObject({ status: "enrolled", votesFor: 6, votesAgainst: 4 });
    expect(resolved.voteSnapshot).toMatchObject({ for: 6, against: 4 });
    const continued = deserializeSave(serializeSave(resumed, SAVED_AT));
    advanceTurn(continued);
    const card = buildLegislationDetails(continued).chambers.flatMap(c => [...c.active, ...c.completed]).find(b => b.id === bill.id)!;
    expect(card).toMatchObject({ votesFor: 6, votesAgainst: 4 });
  });

  it("refreshes parliamentary party totals from live weighted offices after the public party departure", () => {
    const { world } = sourceWeightedWinners();
    const chamber = world.legislatures.IE!.chambers.find(c => c.key === "dail")!;
    const before = chamber.composition.seatsByParty.IE_FF!;
    expect(executeAction(world, "player", "leaveParty").ok).toBe(true);
    expect(world.player.legislativeSeat).toMatchObject({ seatsHeld: 6 });
    advanceTurn(world);
    expect(chamber.composition.seatsByParty.IE_FF).toBe(before - 6);
    expect(world.governments.IE!.seatsByParty).toEqual(chamber.composition.seatsByParty);
  });

  it("counts an aggregated Senate office in the public cabinet ballot and retains it after reload", () => {
    const world = createWorld({ seed: "weighted-cabinet", playerName: "Alex", countryId: "US", era: "1953", mode: "hos" });
    // Recorded scoped-office fixture, not a claim that this career earned six Senate seats.
    world.player.legislativeSeat = { countryId: "US", chamberKey: "senate", seatsHeld: 6 };
    const nominee = world.politicians.find(p => p.countryId === "US")!;
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    expect(session.act("sponsorCabinetNomination", { countryId: "US", positionId: "secretary_of_state", nomineeId: nominee.id }).ok).toBe(true);
    const id = session.view().legislature.nominations![0]!.id;
    expect(session.act("voteCabinetNomination", { nominationId: id, vote: "for" }).ok).toBe(true);
    expect(session.nomination(id)!.tally).toEqual({ for: 6, against: 0, abstain: 0 });
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.nomination(id)!.tally).toEqual({ for: 6, against: 0, abstain: 0 });
  });

  it("refuses schema 42 export when the real resolved winners carry weighted seats", () => {
    const { world } = sourceWeightedWinners();
    const projection = projectSaveToV42(serializeSave(world, SAVED_AT));
    expect(projection).toMatchObject({ ok: false, error: expect.stringMatching(/weighted.*seat/i) });
  });

  it("keeps the first UK formation pending without manufacturing a PM-vacancy snap deadline", () => {
    const world = createWorld({ seed: "source-uk-first-formation", playerName: "Alex", countryId: "UK", era: "2019" });
    advanceTurn(world);
    expect(world.governments.UK).toMatchObject({ status: "pending", pmVacancyDeadlineTurn: null });
  });

});
