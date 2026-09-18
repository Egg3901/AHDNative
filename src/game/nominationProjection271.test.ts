import { describe, expect, it } from "vitest";
import {
  clearCabinetOnTransition,
  createWorld,
  ensureScotusSeats,
  serializeSave,
  sponsorCabinetNomination,
} from "@ahdclient/engine";
import { GameSession } from "./session";
import {
  projectNominationDetail,
  projectNominationList,
} from "./nominations";

const HOS_US = { era: "1953", countryId: "US", seed: "nom-271-1", playerName: "President", mode: "hos" } as const;
const SAVED_AT = "2026-09-15T00:00:00.000Z";

function senateSession() {
  const world = createWorld({ ...HOS_US });
  world.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
  const session = new GameSession();
  session.load(serializeSave(world, SAVED_AT));
  return session;
}

function vacantScotusSeat(session: GameSession) {
  const world = (session as unknown as { requireWorld(): ReturnType<typeof createWorld> }).requireWorld();
  ensureScotusSeats(world);
  const seat = world.supremeCourtSeats.find((candidate) => candidate.countryId === "US")!;
  Object.assign(seat, {
    justiceMode: null, justiceId: null, justiceName: null, justiceParty: null,
    economicLean: null, socialLean: null, seatedAtTurn: null, divergentHazardStartsTurn: null,
  });
  return seat.seatNumber;
}

describe("unified nomination list/detail projection (#271)", () => {
  it("projects an empty list and a null detail for unknown ids", () => {
    const session = senateSession();
    expect(session.view().legislature.nominations).toEqual([]);
    expect(session.nomination("nomination-that-does-not-exist")).toBeNull();
    expect(projectNominationDetail(createWorld({ ...HOS_US }), "missing")).toBeNull();
  });

  it("projects a pending cabinet nomination with every list/detail field", () => {
    const session = senateSession();
    const probe = createWorld({ ...HOS_US });
    const nominee = probe.politicians.find((p) => p.countryId === "US")!;
    expect(session.act("sponsorCabinetNomination", {
      countryId: "US", positionId: "secretary_of_state", nomineeId: nominee.id,
    }).ok).toBe(true);

    const list = session.view().legislature.nominations ?? [];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: expect.any(String),
      kind: "cabinet",
      countryId: "US",
      chamber: "senate",
      chamberLabel: "Senate",
      office: "Secretary of State",
      positionId: "secretary_of_state",
      nominee: nominee.name,
      nomineeParty: nominee.partyId,
      sponsor: "President",
      status: "active",
      statusLabel: "Vote Open",
      playerVote: null,
      voting: { available: true },
    });
    expect(list[0]!.votingEndsOnTurn).toBe(list[0]!.proposedAtTurn + 24);
    expect(list[0]!.resolvedAtTurn).toBeNull();
    expect(list[0]!.tally).toMatchObject({ for: expect.any(Number), against: expect.any(Number), abstain: expect.any(Number) });

    // Detail is the same projection by id.
    expect(session.nomination(list[0]!.id)).toEqual(list[0]!);
  });

  it("unifies cabinet and SCOTUS nominations pending-first with Senate routing", () => {
    const session = senateSession();
    const seatNumber = vacantScotusSeat(session);
    const probe = createWorld({ ...HOS_US });
    const politicians = probe.politicians.filter((p) => p.countryId === "US");
    expect(session.act("sponsorCabinetNomination", {
      countryId: "US", positionId: "secretary_of_state", nomineeId: politicians[0]!.id,
    }).ok).toBe(true);
    expect(session.act("sponsorScotusNomination", {
      countryId: "US", seatNumber, nomineeId: politicians[1]!.id,
    }).ok).toBe(true);

    const list = session.view().legislature.nominations ?? [];
    expect(list).toHaveLength(2);
    expect(list.map((entry) => entry.kind).sort()).toEqual(["cabinet", "scotus"]);
    const scotus = list.find((entry) => entry.kind === "scotus")!;
    expect(scotus).toMatchObject({
      countryId: "US",
      chamber: "senate",
      chamberLabel: "Senate",
      office: `Supreme Court Seat #${seatNumber}`,
      seatNumber,
      nominee: politicians[1]!.name,
      status: "active",
      statusLabel: "Vote Open",
      playerVote: null,
      voting: { available: true },
    });
    // Sponsor resolves to the president's name, not the raw sponsor id.
    expect(scotus.sponsor).toBe("President");
    for (const entry of list) {
      expect(session.nomination(entry.id)).toEqual(entry);
    }
  });

  it("routes VP nominations to both chambers with House and Senate totals", () => {
    const session = senateSession();
    const probe = createWorld({ ...HOS_US });
    const nominee = probe.politicians.find((p) => p.countryId === "US")!;
    expect(session.act("sponsorCabinetNomination", {
      countryId: "US", positionId: "vicePresident", nomineeId: nominee.id,
    }).ok).toBe(true);
    const pending = session.view().legislature.nominations![0]!;
    expect(pending).toMatchObject({ kind: "cabinet", chamber: "both", chamberLabel: "House and Senate" });
    expect(pending.tally.houseFor).toBeDefined();
    expect(pending.tally.houseAgainst).toBeDefined();
    expect(pending.tally.houseAbstain).toBeDefined();
    expect(session.nomination(pending.id)).toEqual(pending);
  });

  it("exposes the engine's exact vote blocked reasons at the session boundary", () => {
    const world = createWorld({ ...HOS_US });
    world.player.legislativeSeat = { countryId: "US", chamberKey: "house" };
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    const nominee = world.politicians.find((p) => p.countryId === "US")!;
    expect(session.act("sponsorCabinetNomination", {
      countryId: "US", positionId: "secretary_of_state", nomineeId: nominee.id,
    }).ok).toBe(true);
    const cabinet = session.view().legislature.nominations![0]!;
    expect(cabinet.voting).toEqual({
      available: false,
      disabledReason: "Only Senators can vote on cabinet nominations",
    });

    const seatNumber = vacantScotusSeat(session);
    expect(session.act("sponsorScotusNomination", {
      countryId: "US", seatNumber, nomineeId: nominee.id,
    }).ok).toBe(true);
    const scotus = session.view().legislature.nominations!.find((entry) => entry.kind === "scotus")!;
    expect(scotus.voting).toEqual({
      available: false,
      disabledReason: "Only Senators can vote on Justice nominations",
    });
  });

  it("keeps a recorded ballot in list and detail across save/reload and turns", () => {
    const session = senateSession();
    const probe = createWorld({ ...HOS_US });
    const nominee = probe.politicians.find((p) => p.countryId === "US")!;
    expect(session.act("sponsorCabinetNomination", {
      countryId: "US", positionId: "secretary_of_state", nomineeId: nominee.id,
    }).ok).toBe(true);
    const id = session.view().legislature.nominations![0]!.id;
    const deadline = session.nomination(id)!.votingEndsOnTurn;
    expect(session.act("voteCabinetNomination", { nominationId: id, vote: "for" }).ok).toBe(true);
    expect(session.nomination(id)?.playerVote).toBe("for");

    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.nomination(id)).toMatchObject({ status: "active", playerVote: "for", votingEndsOnTurn: deadline });

    reloaded.advance();
    reloaded.advance();
    const kept = reloaded.nomination(id)!;
    expect(kept).toMatchObject({ id, status: "active", playerVote: "for", votingEndsOnTurn: deadline });
    expect(reloaded.view().legislature.nominations).toHaveLength(1);

    const reread = new GameSession();
    reread.load(reloaded.serialize(SAVED_AT));
    expect(reread.nomination(id)).toEqual(kept);
  });

  it("projects confirmed and rejected nominations with resolution turns at the session boundary", () => {
    const world = createWorld({ ...HOS_US });
    world.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    const politicians = world.politicians.filter((p) => p.countryId === "US");
    const confirmed = sponsorCabinetNomination(world, {
      countryId: "US", positionId: "secretary_of_state", nomineeId: politicians[0]!.id,
    });
    const senateKeys = world.politicians
      .filter((p) => p.countryId === "US" && (p.chamberKey === "senate" || p.chamberKey === "upper" || p.chamberKey === "senate_us"))
      .slice(0, 3)
      .map((p) => `pol_${p.id}`);
    const confirmedVotes: Record<string, "for" | "against" | "abstain"> = { player: "for" };
    for (const key of senateKeys) confirmedVotes[key] = "for";
    Object.assign(confirmed, {
      status: "confirmed", votes: confirmedVotes, confirmedAtTurn: 25,
    });
    const rejected = sponsorCabinetNomination(world, {
      countryId: "US", positionId: "secretary_of_treasury", nomineeId: politicians[1]!.id,
    });
    Object.assign(rejected, {
      status: "rejected", votesFor: 10, votesAgainst: 85, votesAbstain: 0,
      votes: {}, rejectedAtTurn: 25,
    });
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));

    // Pending-first ordering keeps resolved entries after any active ones.
    const list = session.view().legislature.nominations ?? [];
    expect(list).toHaveLength(2);
    expect(session.nomination(confirmed.id)).toMatchObject({
      kind: "cabinet",
      status: "confirmed",
      statusLabel: "Confirmed",
      resolvedAtTurn: 25,
      tally: { for: 4, against: 0, abstain: 0 },
      voting: { available: false, disabledReason: "Nomination not found or voting closed" },
    });
    expect(session.nomination(rejected.id)).toMatchObject({
      status: "rejected",
      statusLabel: "Rejected",
      resolvedAtTurn: 25,
      voting: { available: false, disabledReason: "Nomination not found or voting closed" },
    });

    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.nomination(confirmed.id)?.status).toBe("confirmed");
    expect(reloaded.nomination(rejected.id)?.status).toBe("rejected");
  });

  it("projects a withdrawn cabinet nomination with no ballot at the session boundary", () => {
    const world = createWorld({ ...HOS_US });
    const nominee = world.politicians.find((p) => p.countryId === "US")!;
    const nomination = sponsorCabinetNomination(world, {
      countryId: "US", positionId: "secretary_of_state", nomineeId: nominee.id,
    });
    expect(clearCabinetOnTransition(world, "US").nominationsWithdrawn).toBe(1);
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    expect(session.nomination(nomination.id)).toMatchObject({
      kind: "cabinet",
      status: "withdrawn",
      statusLabel: "Withdrawn",
      resolvedAtTurn: null,
      voting: { available: false, disabledReason: "Nomination not found or voting closed" },
    });
    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.nomination(nomination.id)?.status).toBe("withdrawn");
  });

  it("projects a withdrawn SCOTUS nomination with no ballot at the session boundary", () => {
    const world = createWorld({ ...HOS_US });
    ensureScotusSeats(world);
    const seat = world.supremeCourtSeats.find((candidate) => candidate.countryId === "US")!;
    Object.assign(seat, {
      justiceMode: null, justiceId: null, justiceName: null, justiceParty: null,
      economicLean: null, socialLean: null, seatedAtTurn: null, divergentHazardStartsTurn: null,
    });
    const nominee = world.politicians.find((p) => p.countryId === "US")!;
    world.scotusNominations.push({
      id: "scotus_nom_US_1_1",
      countryId: "US",
      seatNumber: seat.seatNumber,
      nomineeMode: "character",
      nomineeId: nominee.id,
      nomineeName: nominee.name,
      nomineeParty: nominee.partyId,
      proposedBy: "player",
      status: "withdrawn",
      votesFor: 0,
      votesAgainst: 0,
      votesAbstain: 0,
      votes: {},
      votingEndsOnTurn: 25,
      proposedAtTurn: 1,
    });
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    expect(session.nomination("scotus_nom_US_1_1")).toMatchObject({
      kind: "scotus",
      chamber: "senate",
      status: "withdrawn",
      statusLabel: "Withdrawn",
      sponsor: "President",
      voting: { available: false, disabledReason: "Nomination not found or voting closed" },
    });
  });

  it("returns an empty list for a country with no nominations", () => {
    expect(projectNominationList(createWorld({ ...HOS_US }), "US")).toEqual([]);
    expect(projectNominationList(createWorld({ ...HOS_US }), "UK")).toEqual([]);
  });
});
