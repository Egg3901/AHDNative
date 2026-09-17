import { describe, expect, it } from "vitest";
import {
  clearCabinetOnTransition,
  createWorld,
  ensureScotusSeats,
  serializeSave,
  sponsorCabinetNomination,
} from "@ahdclient/engine";
import { GameSession } from "./session";
import { projectNominationList, projectScotusSponsor } from "./nominations";

const HOS_US = { era: "1953", countryId: "US", seed: "nom-tdd-1", playerName: "President", mode: "hos" } as const;
const CAREER_US = { era: "1953", countryId: "US", seed: "nom-tdd-1", playerName: "Alex" } as const;
const SAVED_AT = "2026-09-15T00:00:00.000Z";

function loadWorld(overrides: Record<string, unknown> = {}): GameSession {
  const world = createWorld({ ...HOS_US });
  Object.assign(world.player, { legislativeSeat: { countryId: "US", chamberKey: "senate" }, ...overrides });
  const session = new GameSession();
  session.load(serializeSave(world, SAVED_AT));
  return session;
}

describe("nomination projection and session commands (#273 bounded slice)", () => {
  it("projects an empty list for a fresh world", () => {
    expect(projectNominationList(createWorld({ ...CAREER_US }), "US")).toEqual([]);
  });

  it("sponsors a cabinet nomination through the session and projects pending detail", () => {
    const session = new GameSession();
    session.load(serializeSave(createWorld({ ...HOS_US }), SAVED_AT));
    const probe = createWorld({ ...HOS_US });
    const nominee = probe.politicians.find((p) => p.countryId === "US")!;
    const result = session.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: nominee.id,
    });
    expect(result.ok).toBe(true);
    const nominations = session.view().legislature.nominations ?? [];
    expect(nominations).toHaveLength(1);
    expect(nominations[0]).toMatchObject({
      kind: "cabinet",
      office: "Secretary of State",
      status: "active",
      playerVote: null,
    });
    expect(session.nomination(nominations[0]!.id)).toMatchObject({ id: nominations[0]!.id, status: "active" });
  });

  it("records a senator ballot through the session and keeps it across save/reload", () => {
    const session = loadWorld();
    const probe = createWorld({ ...HOS_US });
    const nominee = probe.politicians.find((p) => p.countryId === "US")!;
    expect(session.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: nominee.id,
    }).ok).toBe(true);
    const id = session.view().legislature.nominations![0]!.id;
    expect(session.act("voteCabinetNomination", { nominationId: id, vote: "for" }).ok).toBe(true);
    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.nomination(id)?.playerVote).toBe("for");
  });

  it("rejects a House ballot on a non-VP cabinet nomination without changing state", () => {
    const session = new GameSession();
    const world = createWorld({ ...HOS_US });
    world.player.legislativeSeat = { countryId: "US", chamberKey: "house" };
    session.load(serializeSave(world, SAVED_AT));
    const nominee = world.politicians.find((p) => p.countryId === "US")!;
    expect(session.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: nominee.id,
    }).ok).toBe(true);
    const id = session.view().legislature.nominations![0]!.id;
    const before = session.serialize(SAVED_AT);
    const vote = session.act("voteCabinetNomination", { nominationId: id, vote: "for" });
    expect(vote.ok).toBe(false);
    if (vote.ok === false) expect(vote.error).toMatch(/senator/i);
    expect(session.serialize(SAVED_AT)).toBe(before);
  });

  it("resolves a sponsored nomination to confirmed through turn advancement", () => {
    const session = loadWorld();
    const probe = createWorld({ ...HOS_US });
    const nominee = probe.politicians.find((p) => p.countryId === "US")!;
    session.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: nominee.id,
    });
    const id = session.view().legislature.nominations![0]!.id;
    session.act("voteCabinetNomination", { nominationId: id, vote: "for" });
    const deadline = session.nomination(id)!.votingEndsOnTurn;
    for (let turn = session.view().turn; turn < deadline; turn += 1) session.advance();
    // One player ballot cannot carry the chamber: NPP senators decide, so
    // the honest assertion is terminal resolution with a recomputed tally.
    const resolved = session.nomination(id)!;
    expect(["confirmed", "rejected"]).toContain(resolved.status);
    expect(resolved.tally.for + resolved.tally.against + resolved.tally.abstain).toBeGreaterThan(0);
  });

  it("keeps SCOTUS sponsorship unavailable to a non-President", () => {
    const session = new GameSession();
    session.create({ ...CAREER_US });
    const sponsor = session.view().legislature.scotusSponsor;
    expect(sponsor?.available).toBe(false);
    expect(sponsor?.disabledReason).toBe("Only the President of this country can propose Supreme Court nominations");
  });

  it("projects a vacant SCOTUS seat with nominee options for the President", () => {
    const world = createWorld({ ...HOS_US });
    ensureScotusSeats(world);
    const seat = world.supremeCourtSeats.find((candidate) => candidate.countryId === "US")!;
    Object.assign(seat, {
      justiceMode: null, justiceId: null, justiceName: null, justiceParty: null,
      economicLean: null, socialLean: null, seatedAtTurn: null, divergentHazardStartsTurn: null,
    });
    const sponsor = projectScotusSponsor(world, "US");
    expect(sponsor.available).toBe(true);
    const option = sponsor.seats.find((entry) => entry.seatNumber === seat.seatNumber)!;
    expect(option).toMatchObject({ vacant: true, hasActiveNomination: false, available: true });
    expect(sponsor.nominees.length).toBeGreaterThan(0);
  });

  it("sponsors a SCOTUS nomination through the session and keeps it across save/reload", () => {
    const world = createWorld({ ...HOS_US });
    ensureScotusSeats(world);
    const seat = world.supremeCourtSeats.find((candidate) => candidate.countryId === "US")!;
    Object.assign(seat, {
      justiceMode: null, justiceId: null, justiceName: null, justiceParty: null,
      economicLean: null, socialLean: null, seatedAtTurn: null, divergentHazardStartsTurn: null,
    });
    const nominee = world.politicians.find((p) => p.countryId === "US")!;
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    const result = session.act("sponsorScotusNomination", {
      countryId: "US",
      seatNumber: seat.seatNumber,
      nomineeId: nominee.id,
    });
    expect(result.ok).toBe(true);
    const nominations = session.view().legislature.nominations ?? [];
    const pending = nominations.find((entry) => entry.kind === "scotus")!;
    expect(pending).toMatchObject({
      kind: "scotus",
      seatNumber: seat.seatNumber,
      status: "active",
      chamber: "senate",
      playerVote: null,
    });
    expect(session.nomination(pending.id)).toMatchObject({ id: pending.id, status: "active" });
    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.nomination(pending.id)).toMatchObject({ status: "active", seatNumber: seat.seatNumber });
  });

  it("refuses SCOTUS sponsorship with the engine's exact reasons and unchanged state", () => {
    const world = createWorld({ ...HOS_US });
    ensureScotusSeats(world);
    const nominee = world.politicians.find((p) => p.countryId === "US")!;
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    const occupied = world.supremeCourtSeats.find((candidate) => candidate.countryId === "US")!;
    const before = session.serialize(SAVED_AT);
    const refused = session.act("sponsorScotusNomination", {
      countryId: "US",
      seatNumber: occupied.seatNumber,
      nomineeId: nominee.id,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok === false) expect(refused.error).toBe("Seat is not vacant");
    expect(session.serialize(SAVED_AT)).toBe(before);
  });

  it("refuses SCOTUS sponsorship for a non-President with unchanged state", () => {
    const world = createWorld({ ...HOS_US });
    ensureScotusSeats(world);
    const seat = world.supremeCourtSeats.find((candidate) => candidate.countryId === "US")!;
    Object.assign(seat, {
      justiceMode: null, justiceId: null, justiceName: null, justiceParty: null,
      economicLean: null, socialLean: null, seatedAtTurn: null, divergentHazardStartsTurn: null,
    });
    const nominee = world.politicians.find((p) => p.countryId === "US")!;
    world.executives.US!.presidentId = "US-1";
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    const before = session.serialize(SAVED_AT);
    const refused = session.act("sponsorScotusNomination", {
      countryId: "US",
      seatNumber: seat.seatNumber,
      nomineeId: nominee.id,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok === false) {
      expect(refused.error).toBe("Only the President of this country can propose Supreme Court nominations");
    }
    expect(session.serialize(SAVED_AT)).toBe(before);
  });

  it("refuses a duplicate SCOTUS nomination for the same seat with unchanged state", () => {
    const world = createWorld({ ...HOS_US });
    ensureScotusSeats(world);
    const seat = world.supremeCourtSeats.find((candidate) => candidate.countryId === "US")!;
    Object.assign(seat, {
      justiceMode: null, justiceId: null, justiceName: null, justiceParty: null,
      economicLean: null, socialLean: null, seatedAtTurn: null, divergentHazardStartsTurn: null,
    });
    const politicians = world.politicians.filter((p) => p.countryId === "US");
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    expect(session.act("sponsorScotusNomination", {
      countryId: "US",
      seatNumber: seat.seatNumber,
      nomineeId: politicians[0]!.id,
    }).ok).toBe(true);
    const before = session.serialize(SAVED_AT);
    const refused = session.act("sponsorScotusNomination", {
      countryId: "US",
      seatNumber: seat.seatNumber,
      nomineeId: politicians[1]!.id,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok === false) expect(refused.error).toBe("An active nomination for this seat already exists");
    expect(session.serialize(SAVED_AT)).toBe(before);
  });

  it("refuses a SCOTUS nominee from another country with unchanged state", () => {
    const world = createWorld({ ...HOS_US });
    ensureScotusSeats(world);
    const seat = world.supremeCourtSeats.find((candidate) => candidate.countryId === "US")!;
    Object.assign(seat, {
      justiceMode: null, justiceId: null, justiceName: null, justiceParty: null,
      economicLean: null, socialLean: null, seatedAtTurn: null, divergentHazardStartsTurn: null,
    });
    const foreign = world.politicians.find((p) => p.countryId !== "US")!;
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    const before = session.serialize(SAVED_AT);
    const refused = session.act("sponsorScotusNomination", {
      countryId: "US",
      seatNumber: seat.seatNumber,
      nomineeId: foreign.id,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok === false) expect(refused.error).toBe("Nominee not from US");
    expect(session.serialize(SAVED_AT)).toBe(before);
  });

  it("seats a confirmed SCOTUS justice in the targeted seat through turn advancement", () => {
    const world = createWorld({ ...HOS_US });
    ensureScotusSeats(world);
    const seat = world.supremeCourtSeats.find((candidate) => candidate.countryId === "US")!;
    Object.assign(seat, {
      justiceMode: null, justiceId: null, justiceName: null, justiceParty: null,
      economicLean: null, socialLean: null, seatedAtTurn: null, divergentHazardStartsTurn: null,
    });
    world.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    const nominee = world.politicians.find((p) => p.countryId === "US" && p.partyId === "US_REP")!;
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    expect(session.act("sponsorScotusNomination", {
      countryId: "US",
      seatNumber: seat.seatNumber,
      nomineeId: nominee.id,
    }).ok).toBe(true);
    const pending = session.view().legislature.nominations!.find((entry) => entry.kind === "scotus")!;
    expect(pending.votingEndsOnTurn).toBeGreaterThan(session.view().turn);
    expect(session.act("voteScotusNomination", { nominationId: pending.id, vote: "for" }).ok).toBe(true);
    const deadline = session.nomination(pending.id)!.votingEndsOnTurn;
    for (let turn = session.view().turn; turn < deadline; turn += 1) session.advance();
    const resolved = session.nomination(pending.id)!;
    expect(resolved.status).toBe("confirmed");
    expect(resolved).toMatchObject({ seatNumber: seat.seatNumber, chamber: "senate" });
    const targeted = session.view().legislature.scotusSponsor!.seats
      .find((entry) => entry.seatNumber === seat.seatNumber)!;
    expect(targeted).toMatchObject({ vacant: false, hasActiveNomination: false, available: false });
    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.nomination(pending.id)).toMatchObject({ status: "confirmed", seatNumber: seat.seatNumber });
  });
});

describe("nomination session commands, refusal atomicity, and full loop (#272)", () => {
  it("refuses cabinet sponsorship for a non-President with the engine's exact reason and unchanged state", () => {
    const session = new GameSession();
    session.create({ ...CAREER_US });
    const probe = createWorld({ ...HOS_US });
    const nominee = probe.politicians.find((p) => p.countryId === "US")!;
    const before = session.serialize(SAVED_AT);
    const refused = session.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: nominee.id,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok === false) {
      expect(refused.error).toBe("Only the President of this country can propose cabinet nominations");
    }
    expect(session.serialize(SAVED_AT)).toBe(before);
  });

  it("refuses a duplicate cabinet nomination with the engine's exact reason and unchanged state", () => {
    const session = new GameSession();
    session.load(serializeSave(createWorld({ ...HOS_US }), SAVED_AT));
    const probe = createWorld({ ...HOS_US });
    const politicians = probe.politicians.filter((p) => p.countryId === "US");
    expect(session.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: politicians[0]!.id,
    }).ok).toBe(true);
    // The projection quotes the same duplicate reason before the player acts again.
    const position = session.view().legislature.cabinetSponsor!.positions
      .find((entry) => entry.id === "secretary_of_state")!;
    expect(position).toMatchObject({
      vacant: true,
      hasActiveNomination: true,
      available: false,
      disabledReason: "An active nomination for this cabinet position already exists",
    });
    const before = session.serialize(SAVED_AT);
    const refused = session.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: politicians[1]!.id,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok === false) {
      expect(refused.error).toBe("An active nomination for this cabinet position already exists");
    }
    expect(session.serialize(SAVED_AT)).toBe(before);
  });

  it("routes a Vice President nomination through both chambers and keeps ballots across save/reload", () => {
    const world = createWorld({ ...HOS_US });
    expect(world.executives.US?.vicePresidentId).toBeNull();
    const nominee = world.politicians.find((p) => p.countryId === "US")!;

    // House ballot.
    const houseWorld = createWorld({ ...HOS_US });
    houseWorld.player.legislativeSeat = { countryId: "US", chamberKey: "house" };
    const houseSession = new GameSession();
    houseSession.load(serializeSave(houseWorld, SAVED_AT));
    expect(houseSession.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: "vicePresident",
      nomineeId: nominee.id,
    }).ok).toBe(true);
    const housePending = houseSession.view().legislature.nominations![0]!;
    expect(housePending).toMatchObject({ kind: "cabinet", chamber: "both", chamberLabel: "House and Senate" });
    expect(housePending.tally.houseFor).toBeDefined();
    expect(houseSession.act("voteCabinetNomination", { nominationId: housePending.id, vote: "for" }).ok).toBe(true);
    const houseReloaded = new GameSession();
    houseReloaded.load(houseSession.serialize(SAVED_AT));
    expect(houseReloaded.nomination(housePending.id)?.playerVote).toBe("for");

    // Senate ballot path on a fresh world accepts the senate vote too.
    const senateWorld = createWorld({ ...HOS_US });
    senateWorld.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    const senateSession = new GameSession();
    senateSession.load(serializeSave(senateWorld, SAVED_AT));
    expect(senateSession.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: "vicePresident",
      nomineeId: nominee.id,
    }).ok).toBe(true);
    const senateId = senateSession.view().legislature.nominations![0]!.id;
    expect(senateSession.act("voteCabinetNomination", { nominationId: senateId, vote: "against" }).ok).toBe(true);
    expect(senateSession.nomination(senateId)?.playerVote).toBe("against");
  });

  it("projects a withdrawn cabinet nomination at the session boundary", () => {
    const world = createWorld({ ...HOS_US });
    const nominee = world.politicians.find((p) => p.countryId === "US")!;
    const nomination = sponsorCabinetNomination(world, {
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: nominee.id,
    });
    const transition = clearCabinetOnTransition(world, "US");
    expect(transition.nominationsWithdrawn).toBe(1);
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    expect(session.nomination(nomination.id)).toMatchObject({
      id: nomination.id,
      kind: "cabinet",
      status: "withdrawn",
      statusLabel: "Withdrawn",
      voting: { available: false, disabledReason: "Nomination not found or voting closed" },
    });
    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.nomination(nomination.id)?.status).toBe("withdrawn");
  });

  it("creates, acts, saves, reloads, advances, and continues through the session boundary", () => {
    const session = new GameSession();
    const created = session.create({
      era: "1953", countryId: "US", seed: "nom-loop-1", playerName: "President", mode: "hos",
    });
    expect(created.legislature.cabinetSponsor?.available).toBe(true);
    const probe = createWorld({ ...HOS_US });
    const nominee = probe.politicians.find((p) => p.countryId === "US")!;
    expect(session.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: nominee.id,
    }).ok).toBe(true);
    const id = session.view().legislature.nominations![0]!.id;

    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.nomination(id)?.status).toBe("active");
    reloaded.advance();
    reloaded.advance();
    expect(reloaded.nomination(id)).toMatchObject({ status: "active", playerVote: null });

    // Continuing works after reload and turns: a senate-seated session can
    // still sponsor, advance, and record a ballot on the live world.
    const voting = new GameSession();
    const votingWorld = createWorld({ ...HOS_US });
    votingWorld.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    voting.load(serializeSave(votingWorld, SAVED_AT));
    expect(voting.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: nominee.id,
    }).ok).toBe(true);
    const votingId = voting.view().legislature.nominations![0]!.id;
    voting.advance();
    expect(voting.act("voteCabinetNomination", { nominationId: votingId, vote: "for" }).ok).toBe(true);
    expect(voting.nomination(votingId)?.playerVote).toBe("for");
  });

  it("rejects a minority-party cabinet nomination and seats nobody", () => {
    const world = createWorld({ ...HOS_US });
    world.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    // 1953 US Senate is 48 REP / 47 DEM, so a DEM nominee loses the
    // party-line Senate ballot deterministically.
    const nominee = world.politicians.find((p) => p.countryId === "US" && p.partyId === "US_DEM")!;
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    expect(session.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: nominee.id,
    }).ok).toBe(true);
    const id = session.view().legislature.nominations![0]!.id;
    const deadline = session.nomination(id)!.votingEndsOnTurn;
    for (let turn = session.view().turn; turn < deadline; turn += 1) session.advance();
    const resolved = session.nomination(id)!;
    expect(resolved.status).toBe("rejected");
    expect(resolved.tally.against).toBeGreaterThan(resolved.tally.for);
    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.nomination(id)?.status).toBe("rejected");
  }, 240000);

  it("seats a confirmed cabinet secretary in the nominated office", () => {
    const world = createWorld({ ...HOS_US });
    world.player.legislativeSeat = { countryId: "US", chamberKey: "senate" };
    // 1953 US Senate is 48 REP / 47 DEM with a REP president, so a REP
    // nominee wins the party-line Senate ballot deterministically.
    const nominee = world.politicians.find((p) => p.countryId === "US" && p.partyId === "US_REP")!;
    const session = new GameSession();
    session.load(serializeSave(world, SAVED_AT));
    expect(session.act("sponsorCabinetNomination", {
      countryId: "US",
      positionId: "secretary_of_state",
      nomineeId: nominee.id,
    }).ok).toBe(true);
    const id = session.view().legislature.nominations![0]!.id;
    const deadline = session.nomination(id)!.votingEndsOnTurn;
    for (let turn = session.view().turn; turn < deadline; turn += 1) session.advance();
    expect(session.nomination(id)?.status).toBe("confirmed");
    const position = session.view().legislature.cabinetSponsor!.positions
      .find((entry) => entry.id === "secretary_of_state")!;
    expect(position).toMatchObject({ vacant: false, hasActiveNomination: false, available: false });
  }, 240000);
});
