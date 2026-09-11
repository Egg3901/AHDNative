import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { deserializeSave, serializeSave } from "../save.js";
import { rngFromSeed } from "../rng.js";
import { realAccumulate } from "../elections/tallyAdapter.js";
import { executeAction } from "./execute.js";

const OPTS = { seed: "campaign-canvass", playerName: "Tester", countryId: "US", era: "1953" } as const;

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

describe("campaignCanvass", () => {
  it("spends one action and 100 funds on a targeted demographic boost", () => {
    const { world, race } = setupFiledRace();
    const campaign = world.campaigns[campaignKey(race.id, "player")]!;
    const category = world.demographicCategories.US!.find((candidateCategory) =>
      candidateCategory.groups.some((group) => world.stateDemographics[race.state!]!.groups[group.id]),
    );
    expect(category).toBeDefined();
    const group = category!.groups.find((candidateGroup) =>
      world.stateDemographics[race.state!]!.groups[candidateGroup.id],
    );
    expect(group).toBeDefined();
    const regionId = race.state!;
    world.player.actions = 10;
    world.player.funds = 1_000;
    const beforeActions = world.player.actions;
    const beforeFunds = world.player.funds;

    expect(executeAction(world, "player", "campaignCanvass", {
      electionId: race.id,
      regionId,
      demographicCategory: category!._id,
      demographicGroup: group!.id,
    })).toEqual({ ok: true, message: `Canvassed ${group!.name} voters in ${regionId}.` });
    expect(world.player.actions).toBe(beforeActions - 1);
    expect(world.player.funds).toBe(beforeFunds - 100);
    expect(campaign.canvassModifiers?.[`${category!._id}:${group!.id}`]).toBeGreaterThan(0);

    const saved = deserializeSave(serializeSave(world, "2026-09-11T00:00:00.000Z"));
    expect(saved.campaigns[campaignKey(race.id, "player")]).toMatchObject({
      canvassModifiers: { [`${category!._id}:${group!.id}`]: campaign.canvassModifiers![`${category!._id}:${group!.id}`] },
    });
    const beforeDecay = campaign.canvassModifiers![`${category!._id}:${group!.id}`]!;
    advanceTurn(world);
    expect(campaign.canvassModifiers![`${category!._id}:${group!.id}`]).toBeLessThan(beforeDecay);
  });

  it("feeds the targeted turnout modifier into the race tally", () => {
    const { world, race } = setupFiledRace();
    const baseline = deserializeSave(serializeSave(world, "2026-09-11T00:00:00.000Z"));
    world.player.actions = 10;
    world.player.funds = 1_000;
    const category = world.demographicCategories.US!.find((candidateCategory) =>
      candidateCategory.groups.some((group) => world.stateDemographics[race.state!]!.groups[group.id]),
    );
    const group = category!.groups.find((candidateGroup) =>
      world.stateDemographics[race.state!]!.groups[candidateGroup.id],
    );
    expect(executeAction(world, "player", "campaignCanvass", {
      electionId: race.id,
      regionId: race.state!,
      demographicCategory: category!._id,
      demographicGroup: group!.id,
    }).ok).toBe(true);

    expect(realAccumulate(baseline, rngFromSeed("campaign-canvass-tally"), baseline.elections[0]!)).toBe(true);
    expect(realAccumulate(world, rngFromSeed("campaign-canvass-tally"), race)).toBe(true);
    const baselineVotes = Object.values(baseline.elections[0]!.tally).reduce((sum, votes) => sum + votes, 0);
    const canvassedVotes = Object.values(race.tally).reduce((sum, votes) => sum + votes, 0);
    expect(canvassedVotes).toBeGreaterThan(baselineVotes);
  });

  it("rejects an invalid demographic target without charging resources", () => {
    const { world, race } = setupFiledRace();
    world.player.actions = 10;
    world.player.funds = 1_000;
    const before = { actions: world.player.actions, funds: world.player.funds };

    expect(executeAction(world, "player", "campaignCanvass", {
      electionId: race.id,
      regionId: race.state!,
      demographicCategory: "missing",
      demographicGroup: "missing",
    })).toEqual({ ok: false, error: "Unknown campaign demographic target." });
    expect(world.player.actions).toBe(before.actions);
    expect(world.player.funds).toBe(before.funds);
  });
});
