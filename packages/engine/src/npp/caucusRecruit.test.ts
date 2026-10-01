import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, projectSaveToV42, serializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import { playerNppRelationshipKey } from "./nppInfluence.js";
import {
  CAUCUS_NPP_RECRUIT_COOLDOWN_TURNS,
  CAUCUS_NPP_RECRUIT_MIN_RELATIONSHIP,
  listCaucusNppRecruitOptions,
} from "./caucusRecruit.js";
import type { Politician, WorldState } from "../types.js";

const SAVED_AT = "2026-09-14T00:00:00.000Z";
const OPTIONS = { era: "1953", countryId: "US", seed: "npp-caucus-recruit-v1", playerName: "Ada" } as const;

function chairedCaucus() {
  const world = createWorld({ ...OPTIONS });
  world.player.partyId = "US_DEM";
  world.player.funds = 100_000;
  world.player.actions = 20;
  const created = executeAction(world, "player", "createCaucus", { caucusName: "Blue Dog Caucus", caucusTaxRate: 2 });
  expect(created.ok).toBe(true);
  const caucusId = world.caucuses[0]!.id;
  const target = world.politicians.find((p) => p.countryId === "US" && p.partyId === "US_DEM");
  if (!target) throw new Error("expected a US DEM politician");
  return { world, caucusId, target };
}

function setRelationship(world: WorldState, target: Politician, score: number) {
  world.nppRelationships[playerNppRelationshipKey(target.id)] = {
    score,
    updatedAtTurn: world.meta.turn,
    lastAttemptTurn: world.meta.turn,
    totalAttempts: 1,
    successfulAttempts: 1,
  };
}

describe("recruitCaucusNpp through the public action", () => {
  it("lets the chair recruit a same-party NPP at relationship 60 for free and keeps membership across save/reload", () => {
    const { world, caucusId, target } = chairedCaucus();
    setRelationship(world, target, CAUCUS_NPP_RECRUIT_MIN_RELATIONSHIP);
    const fundsBefore = world.player.funds;
    const actionsBefore = world.player.actions;
    const result = executeAction(world, "player", "recruitCaucusNpp", { caucusId, targetId: target.id });
    expect(result.ok).toBe(true);
    expect(world.caucuses[0]!.memberIds).toContain(target.id);
    expect(world.caucuses[0]!.lastNppRecruitTurn).toBe(world.meta.turn);
    expect(world.player.actions).toBe(actionsBefore);
    expect(world.player.funds).toBe(fundsBefore);

    const revived = deserializeSave(serializeSave(world, SAVED_AT));
    expect(revived.caucuses[0]!.memberIds).toContain(target.id);
    expect(revived.caucuses[0]!.lastNppRecruitTurn).toBe(world.meta.turn);
  });

  it("refuses below 60 relationship with no charge", () => {
    const { world, caucusId, target } = chairedCaucus();
    setRelationship(world, target, 59);
    const before = serializeSave(world, SAVED_AT);
    const result = executeAction(world, "player", "recruitCaucusNpp", { caucusId, targetId: target.id });
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/at least 60 relationship/);
    expect(serializeSave(world, SAVED_AT)).toBe(before);
  });

  it("hides needs_relationship from the chair chooser and lists eligible targets", () => {
    const { world, caucusId, target } = chairedCaucus();
    const listed = listCaucusNppRecruitOptions(world, caucusId);
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error(listed.error);
    expect(listed.items.find((item) => item.id === target.id)).toBeUndefined();
    setRelationship(world, target, 60);
    const eligible = listCaucusNppRecruitOptions(world, caucusId);
    expect(eligible.ok).toBe(true);
    if (!eligible.ok) throw new Error(eligible.error);
    expect(eligible.items.find((item) => item.id === target.id)?.status).toBe("eligible");
  });

  it("enforces the 12-turn caucus-global cooldown without a charge", () => {
    const { world, caucusId, target } = chairedCaucus();
    const second = world.politicians.find((p) => p.countryId === "US" && p.partyId === "US_DEM" && p.id !== target.id);
    if (!second) throw new Error("expected a second DEM politician");
    setRelationship(world, target, 80);
    setRelationship(world, second, 80);
    expect(executeAction(world, "player", "recruitCaucusNpp", { caucusId, targetId: target.id }).ok).toBe(true);
    const before = serializeSave(world, SAVED_AT);
    const blocked = executeAction(world, "player", "recruitCaucusNpp", { caucusId, targetId: second.id });
    expect(blocked.ok).toBe(false);
    expect(blocked.ok ? "" : blocked.error).toMatch(/12-turn NPP recruitment cooldown/);
    expect(serializeSave(world, SAVED_AT)).toBe(before);
    expect(CAUCUS_NPP_RECRUIT_COOLDOWN_TURNS).toBe(12);
  });

  it("rejects a non-chair and a cross-party target without a charge", () => {
    const { world, caucusId, target } = chairedCaucus();
    setRelationship(world, target, 80);
    world.caucuses[0]!.chairId = "npc-chair";
    const before = serializeSave(world, SAVED_AT);
    const notChair = executeAction(world, "player", "recruitCaucusNpp", { caucusId, targetId: target.id });
    expect(notChair.ok).toBe(false);
    expect(notChair.ok ? "" : notChair.error).toMatch(/chair/i);
    expect(serializeSave(world, SAVED_AT)).toBe(before);

    const { world: world2, caucusId: id2 } = chairedCaucus();
    const republican = world2.politicians.find((p) => p.partyId === "US_REP");
    if (!republican) throw new Error("expected a Republican");
    world2.nppRelationships[playerNppRelationshipKey(republican.id)] = {
      score: 80, updatedAtTurn: 0,
    };
    const cross = executeAction(world2, "player", "recruitCaucusNpp", { caucusId: id2, targetId: republican.id });
    expect(cross.ok).toBe(false);
    expect(cross.ok ? "" : cross.error).toMatch(/same party|member of this party/i);
  });

  it("refuses a v42 projection once a recruit turn is recorded", () => {
    const { world, caucusId, target } = chairedCaucus();
    setRelationship(world, target, 80);
    expect(executeAction(world, "player", "recruitCaucusNpp", { caucusId, targetId: target.id }).ok).toBe(true);
    const projected = projectSaveToV42(serializeSave(world, SAVED_AT));
    expect(projected.ok).toBe(false);
    expect(projected.ok ? "" : projected.error).toMatch(/cannot be projected to schema 42/);
  });
});
