import { describe, expect, it } from "vitest";
import {
  CAUCUS_NPP_RECRUIT_MIN_RELATIONSHIP,
  deserializeSave,
  executeAction,
  NPP_INFLUENCE_MISSING_STUBBORNNESS,
  playerNppRelationshipKey,
  serializeSave,
} from "@ahdclient/engine";
import { GameSession } from "./session";
import { projectPolitics } from "./politics";
import { projectCaucusManagement } from "./caucusManagement";

const OPTIONS = { era: "1953", countryId: "US", seed: "native-npp-ops-v1", playerName: "Alex" } as const;
const SAVED_AT = "2026-09-14T00:00:00.000Z";

describe("GameSession NPP influence and caucus recruit", () => {
  it("writes player relationship through act, persists it, and feeds caucus recruit eligibility", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);

    const politics = session.politics();
    const target = politics.politicians.find((p) => p.partyId === "US_DEM");
    expect(target).toBeTruthy();
    const loyalty = target!.influenceOptions.find((option) => option.type === "boost_loyalty");
    expect(loyalty).toMatchObject({ actionCost: 3, fundCost: 10000 });

    const influenced = session.act("influenceNpp", { targetId: target!.id, influenceType: "boost_loyalty" });
    expect(influenced.ok).toBe(true);
    const after = session.politics().politicians.find((p) => p.id === target!.id)!;
    expect(after.lastInfluence?.message).toBe((influenced as { message?: string }).message);
    const key = playerNppRelationshipKey(target!.id);
    const revived = deserializeSave(session.serialize(SAVED_AT));
    expect(revived.nppRelationships[key]?.score).toBe(after.relationshipScore);
    expect(projectPolitics(revived).politicians.find((p) => p.id === target!.id)?.relationshipScore)
      .toBe(after.relationshipScore);

    revived.player.funds = 100_000;
    revived.player.actions = 20;
    expect(executeAction(revived, "player", "createCaucus", { caucusName: "Blue Dog Caucus" }).ok).toBe(true);
    const caucusId = revived.caucuses[0]!.id;
    revived.nppRelationships[key] = {
      ...revived.nppRelationships[key]!,
      score: Math.max(revived.nppRelationships[key]!.score, CAUCUS_NPP_RECRUIT_MIN_RELATIONSHIP),
    };
    const recruit = executeAction(revived, "player", "recruitCaucusNpp", { caucusId, targetId: target!.id });
    expect(recruit.ok).toBe(true);
    expect(revived.caucuses[0]!.memberIds).toContain(target!.id);
    const management = projectCaucusManagement(revived);
    expect(management.caucuses[0]!.recruit.cooldownRemaining).toBeGreaterThan(0);
  });

  it("marks influence unavailable when personality stubbornness is unrecorded", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    const world = deserializeSave(session.serialize(SAVED_AT));
    world.player.funds = 100_000;
    world.player.actions = 20;
    const target = world.politicians.find((politician) => politician.countryId === "US");
    expect(target).toBeTruthy();
    delete (target as { personality?: unknown }).personality;
    const row = projectPolitics(world).politicians.find((politician) => politician.id === target!.id)!;
    expect(row.influenceOptions.every((option) => option.available === false)).toBe(true);
    expect(row.influenceOptions.every((option) => option.finalChance === null)).toBe(true);
    expect(row.influenceOptions[0]?.disabledReason).toBe(NPP_INFLUENCE_MISSING_STUBBORNNESS);
    const before = serializeSave(world, SAVED_AT);
    const refused = executeAction(world, "player", "influenceNpp", {
      targetId: target!.id, influenceType: "boost_loyalty",
    });
    expect(refused.ok).toBe(false);
    expect(refused.ok ? "" : refused.error).toBe(NPP_INFLUENCE_MISSING_STUBBORNNESS);
    expect(serializeSave(world, SAVED_AT)).toBe(before);
  });
});
