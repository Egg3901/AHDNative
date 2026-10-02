import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { recomputeComposition } from "../elections/orchestration.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { nationalPartyElectionsPhase } from "../intraparty/phases.js";
import { rngFromSeed } from "../rng.js";
import { createWorld } from "../world.js";
import { pmAppointmentPhase, PM_APPOINTMENT_VOTE_DURATION_TURNS } from "./pmAppointment.js";

function eligibleIrishChair() {
  const world = createWorld({ seed: "ie-pm-appointment", playerName: "Dáil Member", countryId: "IE", era: "1991" });
  const partyId = "IE_FF";
  world.player.legislativeSeat = { countryId: "IE", chamberKey: "dail" };
  world.player.partyId = partyId;
  world.player.partyJoinedTurn = 0;
  world.meta.turn = 24;
  recomputeComposition(world, "IE", "dail");
  world.player.actions = 50;
  const rng = rngFromSeed("ie-pm-party-chair-election");
  nationalPartyElectionsPhase.run(world, rng);
  const chairElection = world.nationalPartyElections.find((election) => election.partyId === partyId && election.position === "chair" && election.status === "voting");
  if (!chairElection) throw new Error("Expected the existing national party election phase to create a chair ballot");
  if (!executeAction(world, "player", "contestPartyLeadership", { intrapartyElectionId: chairElection.id }).ok) {
    throw new Error("Expected the player to contest the existing chair ballot after 24 turns of party tenure");
  }
  if (!executeAction(world, "player", "votePartyLeadership", { intrapartyElectionId: chairElection.id, candidateId: "player" }).ok) {
    throw new Error("Expected the player to vote in the existing chair ballot");
  }
  world.meta.turn = chairElection.endTurn;
  nationalPartyElectionsPhase.run(world, rng);
  if (world.parties[partyId]!.chairId !== "player") throw new Error("Expected the source-compatible leadership resolver to award the chair to the player");
  return world;
}

describe("Irish PM appointment (#284 source formation prerequisite)", () => {
  it("requires a real Dáil seat and source party-chair authority before creating a ballot", () => {
    const world = createWorld({ seed: "ie-pm-no-chair", playerName: "Dáil Member", countryId: "IE", era: "1991" });
    world.player.partyId = "IE_FF";
    world.player.legislativeSeat = { countryId: "IE", chamberKey: "dail" };
    const before = serializeSave(world, "2026-10-01T00:00:00.000Z");
    expect(executeAction(world, "player", "proposePmAppointment")).toMatchObject({
      ok: false,
      error: "Only the party chair, acting vice-chair, or coalition chair may nominate a Taoiseach",
    });
    expect(world.pmAppointmentVotes).toEqual([]);
    expect(serializeSave(world, "2026-10-01T00:00:00.000Z")).toBe(before);

    world.parties.IE_FF!.viceChairId = "player";
    expect(executeAction(world, "player", "proposePmAppointment").ok).toBe(true);
  });

  it("persists an eligible chair nomination, records the player's weighted Dáil vote, then installs PM on source auto-aye expiry", () => {
    const world = eligibleIrishChair();
    expect(world.governments.IE?.status).toBe("pending");
    const actionsBefore = world.player.actions;
    expect(executeAction(world, "player", "proposePmAppointment")).toMatchObject({ ok: true });
    const vote = world.pmAppointmentVotes[0]!;
    expect(vote).toMatchObject({
      countryId: "IE", chamberKey: "dail", partyId: "IE_FF", nomineeId: "player",
      nomineeName: "Dáil Member", formationType: "minority", closesTurn: world.meta.turn + PM_APPOINTMENT_VOTE_DURATION_TURNS,
      status: "active",
    });
    expect(world.player.actions).toBe(actionsBefore);
    expect(executeAction(world, "player", "votePmAppointment", {
      pmAppointmentVoteId: vote.id, pmVote: "aye",
    })).toMatchObject({ ok: true });
    expect(vote.votes).toEqual({ player: "aye" });

    const saved = deserializeSave(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    expect(saved.pmAppointmentVotes).toEqual(world.pmAppointmentVotes);
    saved.meta.turn = vote.closesTurn;
    pmAppointmentPhase.run(saved, undefined as never);
    expect(saved.pmAppointmentVotes[0]).toMatchObject({ status: "passed", votesFor: 73, votesAgainst: 0, closedTurn: vote.closesTurn });
    expect(saved.governments.IE).toMatchObject({
      status: "formed", formationType: "minority", governingPartyId: "IE_FF", pmPoliticianId: "player", formedTurn: vote.closesTurn,
    });

    const resumed = deserializeSave(serializeSave(saved, "2026-10-01T00:00:00.000Z"));
    advanceTurn(resumed);
    expect(resumed.governments.IE).toMatchObject({ status: "formed", pmPoliticianId: "player" });
  });

  it("rejects an unseated voter and a ballot id from another country without changing vote state", () => {
    const world = eligibleIrishChair();
    executeAction(world, "player", "proposePmAppointment");
    const vote = world.pmAppointmentVotes[0]!;
    world.player.legislativeSeat = null;
    const before = JSON.stringify(vote);
    expect(executeAction(world, "player", "votePmAppointment", {
      pmAppointmentVoteId: vote.id, pmVote: "aye",
    })).toMatchObject({ ok: false, error: expect.stringContaining("elected Dáil member") });
    expect(JSON.stringify(vote)).toBe(before);
  });
});
