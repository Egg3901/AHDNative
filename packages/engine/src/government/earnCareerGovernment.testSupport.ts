import { expect } from "vitest";
import type { WorldState } from "../types.js";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { PARTY_LEADERSHIP_TENURE_TURNS } from "../intraparty/leadershipTenure.js";
import { EXECUTIVE_OFFICE_BY_COUNTRY } from "../actions/officeRegistry.js";

/** Real party-chair nomination and chamber appointment before career bills.
 * Only the existing chair ballot's closing calendar is shortened. Authority,
 * votes, appointment's 24-turn window and save continuation use public paths. */
export function earnCareerGovernment(world: WorldState, catalogId: string): WorldState {
  const countryId = world.player.countryId;
  const partyId = world.player.partyId!;
  expect(world.governments[countryId]?.status).toBe("pending");
  const before = serializeSave(world, "2026-10-02T00:00:00.000Z");
  expect(executeAction(world, "player", "sponsorBill", { catalogId })).toMatchObject({ ok: false, error: expect.stringContaining("formation") });
  expect(serializeSave(world, "2026-10-02T00:00:00.000Z")).toBe(before);
  const joinedTurn = world.player.partyJoinedTurn!;
  while (world.meta.turn < joinedTurn + PARTY_LEADERSHIP_TENURE_TURNS) advanceTurn(world);
  world.player.actions = 100;
  const chair = world.nationalPartyElections.find(e => e.partyId === partyId && e.position === "chair" && e.status === "voting");
  expect(chair).toBeDefined();
  expect(executeAction(world, "player", "contestPartyLeadership", { intrapartyElectionId: chair!.id }).ok).toBe(true);
  expect(executeAction(world, "player", "votePartyLeadership", { intrapartyElectionId: chair!.id, candidateId: "player" }).ok).toBe(true);
  // Let the source-authored chair ballot close on its real calendar. Do not
  // edit the election's end turn to accelerate this prerequisite.
  while (world.meta.turn <= chair!.endTurn) advanceTurn(world);
  expect(world.parties[partyId]!.chairId).toBe("player");
  expect(executeAction(world, "player", "proposePmAppointment")).toMatchObject({ ok: true });
  const vote = world.pmAppointmentVotes.at(-1)!;
  expect(vote).toMatchObject({ countryId, nomineeId: "player", status: "active", closesTurn: world.meta.turn + 24 });
  expect(executeAction(world, "player", "votePmAppointment", { pmAppointmentVoteId: vote.id, pmVote: "aye" }).ok).toBe(true);
  world = deserializeSave(serializeSave(world));
  for (let i = 0; i < 24; i++) advanceTurn(world);
  expect(world.pmAppointmentVotes.find(v => v.id === vote.id)).toMatchObject({ status: "passed" });
  expect(world.governments[countryId]).toMatchObject({ status: "formed", pmPoliticianId: "player" });
  expect(world.player.currentOffice).toMatchObject({ countryId, type: EXECUTIVE_OFFICE_BY_COUNTRY[countryId] });
  return deserializeSave(serializeSave(world));
}
