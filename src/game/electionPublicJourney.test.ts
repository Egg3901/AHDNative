import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

describe("source-backed public election journeys", () => {
  it("runs a scheduled state candidacy through primary, save/reload, general, and opted-in re-entry", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "public-election-probe", playerName: "Alex", homeRegionId: "NY" });
    session.advance();
    expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);
    expect(session.act("setAutoRunForReelection", { enabled: true }).ok).toBe(true);
    expect(session.view().player.autoRunForReelection).toBe(true);
    const houseRace = session.view().elections.find((race) => race.id === "house:US:NY:c1");
    expect(houseRace).toMatchObject({ electionType: "house", status: "active", phase: "primary", candidacy: { available: true } });
    expect(session.act("declareCandidacy", { electionId: houseRace!.id }).ok).toBe(true);
    const saved = session.serialize("2026-10-02T00:00:00.000Z");
    expect(JSON.parse(saved).world.elections.find((race: { id: string }) => race.id === houseRace!.id).candidates.some((candidate: { id: string }) => candidate.id === "player")).toBe(true);
    const resumed = new GameSession();
    resumed.load(saved);
    expect(resumed.view().elections.find((race) => race.id === houseRace!.id)?.playerCandidate).toBe(true);

    const raceState = () => JSON.parse(resumed.serialize("2026-10-02T00:00:00.000Z")).world.elections
      .find((race: { id: string }) => race.id === houseRace!.id);
    const primaryEndTurn = raceState().primaryEndTurn as number;
    let view = resumed.view();
    while (view.turn <= primaryEndTurn) view = resumed.advance();
    expect(raceState().primaryResults).toBeDefined();
    expect(resumed.view().elections.find((race) => race.id === houseRace!.id)?.phase).toBe("general");

    const beforeGeneralReload = resumed.serialize("2026-10-02T00:00:00.000Z");
    const generalReload = new GameSession();
    view = generalReload.load(beforeGeneralReload);
    const endTurn = raceState().endTurn as number;
    while (view.turn <= endTurn) view = generalReload.advance();
    const resolved = JSON.parse(generalReload.serialize("2026-10-02T00:00:00.000Z")).world.elections
      .find((race: { id: string }) => race.id === houseRace!.id);
    expect(resolved.status).toBe("resolved");
    expect(resolved.winners).toEqual(expect.any(Array));

    for (let turn = 0; turn < 12; turn += 1) view = generalReload.advance();
    const reentry = generalReload.view().elections.find((race) => race.id === "house:US:NY:c2");
    expect(reentry?.playerCandidate).toBe(true);
  }, 900_000);
});
