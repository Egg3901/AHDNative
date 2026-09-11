import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { campaignTurnPhase } from "../campaigns/phases.js";
import { rngFromState } from "../rng.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "./execute.js";

const OPTS = { seed: "campaign-retarget", playerName: "Tester", countryId: "US", era: "1953" } as const;

function setupFiledRace() {
  const world = createWorld(OPTS);
  expect(executeAction(world, "player", "joinParty", { partyId: "US_DEM" }).ok).toBe(true);
  for (let i = 0; i < 300; i += 1) {
    const race = world.elections.find(
      (e) =>
        e.status !== "resolved" &&
        e.countryId === "US" &&
        e.electionType === "house" &&
        world.meta.turn < e.primaryEndTurn &&
        e.candidates.some((c) => c.partyId === "US_DEM") &&
        !e.candidates.some((c) => c.id === "player"),
    );
    if (race) {
      expect(executeAction(world, "player", "declareCandidacy", { electionId: race.id }).ok).toBe(true);
      return { world, race };
    }
    advanceTurn(world);
  }
  throw new Error("no open US house race within 300 turns");
}

describe("campaignRetarget", () => {
  it("persists a same-party primary target and turn-based cooldown", () => {
    const { world, race } = setupFiledRace();
    const campaign = world.campaigns[campaignKey(race.id, "player")]!;
    const target = race.candidates.find((candidate) =>
      candidate.id !== "player" && candidate.partyId === "US_DEM");
    expect(target).toBeDefined();
    campaign.oppositionResearchTree.starter = true;
    const campaignActions = campaign.actions;
    const result = executeAction(world, "player", "campaignRetarget", {
      electionId: race.id,
      oppositionTargetId: target!.id,
    });

    expect(result).toEqual({ ok: true, message: `Opposition research now targets ${target!.name}.` });
    expect(campaign.actions).toBe(campaignActions);
    expect(campaign).toMatchObject({
      oppositionTargetId: target!.id,
      oppositionTargetName: target!.name,
      oppositionResearchCooldownUntilTurn: world.meta.turn + 6,
    });

    const saved = deserializeSave(serializeSave(world, "2026-09-11T00:00:00.000Z"));
    expect(saved.campaigns[campaignKey(race.id, "player")]).toMatchObject({
      oppositionTargetId: target!.id,
      oppositionTargetName: target!.name,
      oppositionResearchCooldownUntilTurn: world.meta.turn + 6,
    });
    expect(executeAction(saved, "player", "campaignRetarget", {
      electionId: race.id,
      oppositionTargetId: target!.id,
    })).toEqual({ ok: false, error: "Opposition research is on cooldown." });
  });

  it("requires the research starter and rejects a different party during a primary", () => {
    const { world, race } = setupFiledRace();
    const campaign = world.campaigns[campaignKey(race.id, "player")]!;
    const sameParty = race.candidates.find((candidate) =>
      candidate.id !== "player" && candidate.partyId === "US_DEM");
    expect(sameParty).toBeDefined();
    const noStarter = executeAction(world, "player", "campaignRetarget", {
      electionId: race.id,
      oppositionTargetId: sameParty!.id,
    });
    expect(noStarter).toEqual({ ok: false, error: "Unlock opposition research before retargeting." });

    const otherParty = race.candidates.find((candidate) =>
      candidate.id !== "player" && candidate.partyId !== "US_DEM");
    expect(otherParty).toBeDefined();
    campaign.oppositionResearchTree.starter = true;
    expect(executeAction(world, "player", "campaignRetarget", {
      electionId: race.id,
      oppositionTargetId: otherParty!.id,
    })).toEqual({ ok: false, error: "Target must be a same-party primary opponent." });
  });

  it("applies the source starter drain to the selected candidate before tallying", () => {
    const { world, race } = setupFiledRace();
    const campaign = world.campaigns[campaignKey(race.id, "player")]!;
    const target = race.candidates.find((candidate) => candidate.id !== "player");
    expect(target).toBeDefined();
    const targetSupport = world.candidateSupports[target!.id]!;
    targetSupport.support = 50;
    campaign.funds = 100_000;
    campaign.oppositionResearchTree.starter = true;
    campaign.oppositionTargetId = target!.id;
    const rng = rngFromState(world.meta.rng);

    campaignTurnPhase.run(world, rng);

    expect(targetSupport.support).toBeCloseTo(49.5, 8);
  });
});
