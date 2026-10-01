import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, projectSaveToV42, serializeSave } from "../save.js";
import { executeAction } from "../actions/execute.js";
import {
  calculateNppInfluenceChance,
  determineNppInfluenceOutcome,
  forkNppInfluenceRng,
  INFLUENCE_ACTIONS,
  INFLUENCE_LIMITS,
  NPP_INFLUENCE_MISSING_STUBBORNNESS,
  nppInfluenceOutcomeMessage,
  nppInfluenceRelationshipChange,
  playerNppRelationshipKey,
  quoteNppInfluence,
} from "./nppInfluence.js";
import type { Politician, WorldState } from "../types.js";

const SAVED_AT = "2026-09-14T00:00:00.000Z";
const OPTIONS = { era: "1953", countryId: "US", seed: "npp-influence-v1", playerName: "Ada" } as const;

function samePartyTarget(world: WorldState): Politician {
  const target = world.politicians.find((politician) => politician.countryId === "US" && politician.partyId === "US_DEM");
  if (!target) throw new Error("expected a US DEM politician");
  return target;
}

function preparedWorld(overrides?: {
  stubbornness?: number;
  politicalInfluence?: number;
  favorability?: number;
  relationship?: number;
  extra?: number;
  partyId?: string | null;
  targetPartyId?: string;
}): { world: WorldState; target: Politician } {
  const world = createWorld({ ...OPTIONS });
  world.player.partyId = overrides?.partyId === undefined ? "US_DEM" : overrides.partyId;
  world.player.funds = 500_000;
  world.player.actions = 20;
  world.player.politicalInfluence = overrides?.politicalInfluence ?? 0;
  world.player.favorability = overrides?.favorability ?? 50;
  const target = samePartyTarget(world);
  target.personality.stubbornness = overrides?.stubbornness ?? 0;
  if (overrides?.targetPartyId) target.partyId = overrides.targetPartyId;
  if (overrides?.relationship) {
    world.nppRelationships[playerNppRelationshipKey(target.id)] = {
      score: overrides.relationship,
      updatedAtTurn: 0,
    };
  }
  return { world, target };
}

function expectedFor(world: WorldState, target: Politician, extraAnchor = 0) {
  const rel = world.nppRelationships[playerNppRelationshipKey(target.id)]?.score ?? 0;
  return calculateNppInfluenceChance({
    actorPartyId: world.player.partyId,
    actorCountryId: world.player.countryId,
    actorPoliticalInfluence: world.player.politicalInfluence,
    actorFavorability: world.player.favorability,
    nppPartyId: target.partyId,
    nppCountryId: target.countryId,
    stubbornness: target.personality.stubbornness,
    extraAnchor,
    relationshipScore: rel,
    influenceType: "boost_loyalty",
  });
}

describe("NPP influence calculator (source-executed vectors, pin 01797b2708)", () => {
  it("matches independently executed chance vectors", () => {
    expect(calculateNppInfluenceChance({
      actorPartyId: "US_DEM", actorCountryId: "US", actorPoliticalInfluence: 0, actorFavorability: 50,
      nppPartyId: "US_DEM", nppCountryId: "US", stubbornness: 0, extraAnchor: 0, relationshipScore: 0,
      influenceType: "boost_loyalty",
    })).toMatchObject({
      baseChance: 55, stubbornnessPenalty: 0, partyBonus: 20, politicalInfluenceBonus: 0,
      favorabilityBonus: 5, fundBonus: 0, relationshipBonus: 0, finalChance: 80,
    });

    expect(calculateNppInfluenceChance({
      actorPartyId: "US_DEM", actorCountryId: "US", actorPoliticalInfluence: 40, actorFavorability: 60,
      nppPartyId: "US_DEM", nppCountryId: "US", stubbornness: 50, extraAnchor: 0, relationshipScore: 20,
      influenceType: "boost_loyalty",
    })).toMatchObject({
      stubbornnessPenalty: 20, partyBonus: 20, politicalInfluenceBonus: 8,
      favorabilityBonus: 6, relationshipBonus: 3, finalChance: 72,
    });

    expect(calculateNppInfluenceChance({
      actorPartyId: "US_DEM", actorCountryId: "US", actorPoliticalInfluence: 10, actorFavorability: 40,
      nppPartyId: "US_REP", nppCountryId: "US", stubbornness: 80, extraAnchor: 0, relationshipScore: 0,
      influenceType: "boost_loyalty",
    })).toMatchObject({
      stubbornnessPenalty: 32, partyBonus: -10, politicalInfluenceBonus: 2,
      favorabilityBonus: 4, finalChance: 19,
    });

    expect(calculateNppInfluenceChance({
      actorPartyId: null, actorCountryId: "US", actorPoliticalInfluence: 0, actorFavorability: 0,
      nppPartyId: null, nppCountryId: "US", stubbornness: 0, extraAnchor: 0, relationshipScore: 0,
      influenceType: "boost_loyalty",
    })).toMatchObject({ partyBonus: 20, finalChance: 75 });

    expect(calculateNppInfluenceChance({
      actorPartyId: "US_DEM", actorCountryId: "US", actorPoliticalInfluence: 0, actorFavorability: 50,
      nppPartyId: "US_DEM", nppCountryId: "US", stubbornness: 0, extraAnchor: 100000, relationshipScore: 0,
      influenceType: "boost_loyalty",
    })).toMatchObject({ fundBonus: 10, finalChance: 85 });
  });

  it("maps rolls to source success / failure / backfire including the 95 floor", () => {
    expect(determineNppInfluenceOutcome(80, 80)).toBe("success");
    expect(determineNppInfluenceOutcome(81, 80)).toBe("failure");
    expect(determineNppInfluenceOutcome(94, 80)).toBe("failure");
    expect(determineNppInfluenceOutcome(95, 80)).toBe("backfire");
    expect(determineNppInfluenceOutcome(95, 85)).toBe("backfire");
    expect(nppInfluenceRelationshipChange("success")).toBe(10);
    expect(nppInfluenceRelationshipChange("failure")).toBe(-5);
    expect(nppInfluenceRelationshipChange("backfire")).toBe(-25);
  });
});

describe("influenceNpp through the public action", () => {
  it("consumes AP and funds on success, failure, and backfire and writes relationship only", () => {
    const { world, target } = preparedWorld();
    const calc = expectedFor(world, target);
    expect(calc.finalChance).toBe(80);
    const preview = forkNppInfluenceRng(world).int(1, 100);
    const outcome = determineNppInfluenceOutcome(preview, calc.finalChance);
    const beforeFav = target.favorability;
    const beforeInf = target.politicalInfluence;
    const beforeStub = target.personality.stubbornness;
    const actionsBefore = world.player.actions;
    const fundsBefore = world.player.funds;

    const result = executeAction(world, "player", "influenceNpp", {
      targetId: target.id,
      influenceType: "boost_loyalty",
    });
    expect(result.ok).toBe(true);
    expect(result.ok ? result.message : "").toBe(
      nppInfluenceOutcomeMessage(outcome, target.name, "boost_loyalty"),
    );
    expect(world.player.actions).toBe(actionsBefore - INFLUENCE_ACTIONS.boost_loyalty.actionCost);
    expect(world.player.funds).toBe(fundsBefore - INFLUENCE_ACTIONS.boost_loyalty.baseFundCost);
    const rel = world.nppRelationships[playerNppRelationshipKey(target.id)]!;
    expect(rel.score).toBe(nppInfluenceRelationshipChange(outcome));
    expect(rel.lastAttemptTurn).toBe(world.meta.turn);
    expect(target.favorability).toBe(beforeFav);
    expect(target.politicalInfluence).toBe(beforeInf);
    expect(target.personality.stubbornness).toBe(beforeStub);
    expect(world.nppInfluenceAttempts?.[0]?.roll).toBe(preview);
    expect(world.nppInfluenceAttempts?.[0]?.outcome).toBe(outcome);
  });

  it("keeps relationship, attempt log and dedicated stream across save/reload", () => {
    const { world, target } = preparedWorld();
    expect(executeAction(world, "player", "influenceNpp", {
      targetId: target.id, influenceType: "boost_loyalty",
    }).ok).toBe(true);
    const key = playerNppRelationshipKey(target.id);
    const before = world.nppRelationships[key]!;
    const rng = world.nppInfluenceRng;
    const attempts = world.nppInfluenceAttempts;
    const revived = deserializeSave(serializeSave(world, SAVED_AT));
    expect(revived.nppRelationships[key]).toEqual(before);
    expect(revived.nppInfluenceRng).toEqual(rng);
    expect(revived.nppInfluenceAttempts).toEqual(attempts);

    const nextPreview = forkNppInfluenceRng(revived).int(1, 100);
    const next = executeAction(revived, "player", "influenceNpp", {
      targetId: target.id, influenceType: "boost_loyalty",
    });
    expect(next.ok).toBe(false);
    expect(next.ok ? "" : next.error).toMatch(/wait .* more turn/);

    revived.meta.turn += 2;
    const afterWait = executeAction(revived, "player", "influenceNpp", {
      targetId: target.id, influenceType: "boost_loyalty",
    });
    expect(afterWait.ok).toBe(true);
    expect(revived.nppInfluenceAttempts?.[1]?.roll).toBe(nextPreview);
  });

  it("refuses eligibility without charging AP or funds", () => {
    const { world, target } = preparedWorld();
    world.player.actions = 2;
    const before = serializeSave(world, SAVED_AT);
    const short = executeAction(world, "player", "influenceNpp", {
      targetId: target.id, influenceType: "boost_loyalty",
    });
    expect(short.ok).toBe(false);
    expect(short.ok ? "" : short.error).toMatch(/Not enough actions/);
    expect(serializeSave(world, SAVED_AT)).toBe(before);

    world.player.actions = 20;
    world.player.funds = 100;
    const brokeBefore = serializeSave(world, SAVED_AT);
    const broke = executeAction(world, "player", "influenceNpp", {
      targetId: target.id, influenceType: "boost_loyalty",
    });
    expect(broke.ok).toBe(false);
    expect(broke.ok ? "" : broke.error).toMatch(/Not enough funds/);
    expect(serializeSave(world, SAVED_AT)).toBe(brokeBefore);

    world.player.funds = 500_000;
    world.player.actions = 20;
    const npc = executeAction(world, target.id, "influenceNpp", {
      targetId: world.politicians.find((p) => p.id !== target.id)!.id,
      influenceType: "boost_loyalty",
    });
    expect(npc.ok).toBe(false);
    expect(npc.ok ? "" : npc.error).toMatch(/Only the player/);

    const other = world.politicians.find((p) => p.countryId !== "US");
    if (other) {
      const crossBefore = serializeSave(world, SAVED_AT);
      const cross = executeAction(world, "player", "influenceNpp", {
        targetId: other.id, influenceType: "boost_loyalty",
      });
      expect(cross.ok).toBe(false);
      expect(cross.ok ? "" : cross.error).toMatch(/same country/);
      expect(world.nppRelationships[playerNppRelationshipKey(other.id)]).toBeUndefined();
      expect(serializeSave(world, SAVED_AT)).toBe(crossBefore);
    }
  });

  it("refuses missing personality stubbornness without charging or inventing a stat", () => {
    const { world, target } = preparedWorld();
    delete (target as { personality?: Politician["personality"] }).personality;
    const before = serializeSave(world, SAVED_AT);
    const missing = executeAction(world, "player", "influenceNpp", {
      targetId: target.id, influenceType: "boost_loyalty",
    });
    expect(missing.ok).toBe(false);
    expect(missing.ok ? "" : missing.error).toBe(NPP_INFLUENCE_MISSING_STUBBORNNESS);
    expect(serializeSave(world, SAVED_AT)).toBe(before);

    target.personality = { loyalty: 40, ambition: 40 } as Politician["personality"];
    const partialBefore = serializeSave(world, SAVED_AT);
    const partial = executeAction(world, "player", "influenceNpp", {
      targetId: target.id, influenceType: "boost_loyalty",
    });
    expect(partial.ok).toBe(false);
    expect(partial.ok ? "" : partial.error).toBe(NPP_INFLUENCE_MISSING_STUBBORNNESS);
    expect(serializeSave(world, SAVED_AT)).toBe(partialBefore);
  });

  it("caps three attempts per turn and applies the 2-turn per-NPP cooldown without a charge", () => {
    const { world, target } = preparedWorld();
    const others = world.politicians.filter((p) => p.countryId === "US" && p.id !== target.id).slice(0, 3);
    expect(others.length).toBeGreaterThanOrEqual(3);
    for (const npp of others.slice(0, 3)) {
      expect(executeAction(world, "player", "influenceNpp", {
        targetId: npp.id, influenceType: "boost_loyalty",
      }).ok).toBe(true);
    }
    const actionsAfter = world.player.actions;
    const fundsAfter = world.player.funds;
    const fourth = executeAction(world, "player", "influenceNpp", {
      targetId: target.id, influenceType: "boost_loyalty",
    });
    expect(fourth.ok).toBe(false);
    expect(fourth.ok ? "" : fourth.error).toMatch(/already made 3 influence attempts/);
    expect(world.player.actions).toBe(actionsAfter);
    expect(world.player.funds).toBe(fundsAfter);
  });

  it("refuses unsupported influence types and missing params without a charge", () => {
    const { world, target } = preparedWorld();
    const before = serializeSave(world, SAVED_AT);
    expect(executeAction(world, "player", "influenceNpp", { targetId: target.id }).ok).toBe(false);
    expect(executeAction(world, "player", "influenceNpp", {
      targetId: target.id, influenceType: "endorse_candidate",
    }).ok).toBe(false);
    expect(serializeSave(world, SAVED_AT)).toBe(before);
  });

  it("quotes loyalty at 3 AP plus the 10000 local anchor", () => {
    const { world, target } = preparedWorld();
    const quote = quoteNppInfluence(world, { targetId: target.id, influenceType: "boost_loyalty" });
    expect(quote.ok).toBe(true);
    if (!quote.ok) throw new Error(quote.error);
    expect(quote.actionCost).toBe(3);
    expect(quote.fundCost).toBe(10000);
    expect(quote.calculation.finalChance).toBe(80);
  });

  it("refuses a v42 projection once influence progress exists", () => {
    const { world, target } = preparedWorld();
    expect(projectSaveToV42(serializeSave(world, SAVED_AT)).ok).toBe(true);
    expect(executeAction(world, "player", "influenceNpp", {
      targetId: target.id, influenceType: "boost_loyalty",
    }).ok).toBe(true);
    const projected = projectSaveToV42(serializeSave(world, SAVED_AT));
    expect(projected.ok).toBe(false);
    expect(projected.ok ? "" : projected.error).toMatch(/cannot be projected to schema 42/);
  });
});
