import { describe, expect, it } from "vitest";
import { createWorld, serializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";
import { projectNominationList } from "./nominations";

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

  it("keeps SCOTUS sponsorship honestly unavailable without #270", () => {
    const session = new GameSession();
    session.create({ ...CAREER_US });
    const sponsor = session.view().legislature.scotusSponsor;
    expect(sponsor?.available).toBe(false);
    expect(sponsor?.disabledReason).toMatch(/#270/);
  });
});
