import { describe, expect, it } from "vitest";
import { createWorld, deserializeSave, serializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";

const STAMP = "2026-10-01T00:00:00.000Z";

describe("union leadership through the public session", () => {
  it("organizes, opens a weighted election, saves the offer, accepts it, and saves ownership", () => {
    const world = createWorld({ seed: "public-union-leadership", playerName: "Alex", countryId: "US", era: "1953" });
    const union = world.unions["US-manufacturing"]!;
    world.player.actions = 50;
    const session = new GameSession();
    session.load(serializeSave(world, STAMP));

    for (let drive = 0; drive < 10; drive++) session.organizeUnion(union.id);
    expect(session.view().player.actions).toBe(0);
    expect(session.castUnionLeadershipVote(union.id)).toEqual({ ok: true, pendingLeaderCharacterId: "player" });

    const offered = deserializeSave(session.serialize(STAMP));
    expect(offered.unions[union.id]).toMatchObject({ ownerType: null, pendingLeaderCharacterId: "player" });
    const resumed = new GameSession();
    resumed.load(session.serialize(STAMP));
    expect(resumed.acceptUnionLeadership(union.id)).toEqual({ ok: true, ownerType: "player", ownerId: "player" });
    const saved = deserializeSave(resumed.serialize(STAMP));
    expect(saved.unions[union.id]).toMatchObject({ ownerType: "player", ownerId: "player", pendingLeaderCharacterId: null });
    expect(saved.unionOrganizers?.[`${union.id}:player`]).toMatchObject({ strength: 100, organizeCount: 10 });
  });
});
