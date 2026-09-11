import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { rngFromSeed } from "../rng.js";
import { realAccumulate } from "../elections/tallyAdapter.js";
import { createWorld } from "../world.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { deserializeSave, serializeSave } from "../save.js";
import { executeAction } from "./execute.js";

const OPTS = { seed: "campaign-targeted-ad", playerName: "Tester", countryId: "US", era: "1953" } as const;

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

function firstTarget(world: ReturnType<typeof createWorld>, regionId: string) {
  const category = world.demographicCategories.US!.find((candidateCategory) =>
    candidateCategory.groups.some((group) => world.stateDemographics[regionId]!.groups[group.id]),
  );
  const group = category!.groups.find((candidateGroup) => world.stateDemographics[regionId]!.groups[candidateGroup.id]);
  return { category: category!, group: group! };
}

describe("campaignTargetedAd", () => {
  it("spends one action and 100 funds, persists the capped bonus, and decays it", () => {
    const { world, race } = setupFiledRace();
    const campaign = world.campaigns[campaignKey(race.id, "player")]!;
    const target = firstTarget(world, race.state!);
    world.player.actions = 30;
    world.player.funds = 3_000;

    expect(executeAction(world, "player", "campaignTargetedAd", {
      electionId: race.id,
      regionId: race.state!,
      demographicCategory: target.category._id,
      demographicGroup: target.group.id,
    })).toEqual({ ok: true, message: `Bought targeted ads for ${target.group.name} voters in ${race.state}.` });
    expect(world.player.actions).toBe(29);
    expect(world.player.funds).toBe(2_900);
    expect(campaign.targetedAdModifiers?.[`${target.category._id}:${target.group.id}`]).toBeCloseTo(0.01, 10);

    const saved = deserializeSave(serializeSave(world, "2026-09-11T00:00:00.000Z"));
    expect(saved.campaigns[campaignKey(race.id, "player")]).toMatchObject({
      targetedAdModifiers: { [`${target.category._id}:${target.group.id}`]: 0.01 },
    });
    const beforeDecay = campaign.targetedAdModifiers![`${target.category._id}:${target.group.id}`]!;
    advanceTurn(world);
    expect(campaign.targetedAdModifiers![`${target.category._id}:${target.group.id}`]).toBeLessThan(beforeDecay);
  });

  it("caps repeated purchases at the source 25% bonus and rejects the next one", () => {
    const { world, race } = setupFiledRace();
    const target = firstTarget(world, race.state!);
    world.player.actions = 30;
    world.player.funds = 3_000;
    const params = {
      electionId: race.id,
      regionId: race.state!,
      demographicCategory: target.category._id,
      demographicGroup: target.group.id,
    };
    for (let i = 0; i < 25; i += 1) expect(executeAction(world, "player", "campaignTargetedAd", params).ok).toBe(true);
    expect(world.campaigns[campaignKey(race.id, "player")]!.targetedAdModifiers?.[`${target.category._id}:${target.group.id}`]).toBeCloseTo(0.25, 10);
    const before = { actions: world.player.actions, funds: world.player.funds };
    expect(executeAction(world, "player", "campaignTargetedAd", params)).toEqual({
      ok: false,
      error: "This demographic target is already at the ad bonus cap.",
    });
    expect(world.player.actions).toBe(before.actions);
    expect(world.player.funds).toBe(before.funds);
  });

  it("feeds the candidate's targeted ad bonus into the race tally", () => {
    const { world, race } = setupFiledRace();
    const baseline = deserializeSave(serializeSave(world, "2026-09-11T00:00:00.000Z"));
    const target = firstTarget(world, race.state!);
    world.player.actions = 30;
    world.player.funds = 3_000;
    const params = {
      electionId: race.id,
      regionId: race.state!,
      demographicCategory: target.category._id,
      demographicGroup: target.group.id,
    };
    for (let i = 0; i < 25; i += 1) expect(executeAction(world, "player", "campaignTargetedAd", params).ok).toBe(true);

    const baselineRace = baseline.elections.find((e) => e.id === race.id)!;
    expect(realAccumulate(baseline, rngFromSeed("campaign-targeted-ad-tally"), baselineRace)).toBe(true);
    expect(realAccumulate(world, rngFromSeed("campaign-targeted-ad-tally"), race)).toBe(true);
    expect(race.tally.player ?? 0).toBeGreaterThan(baselineRace.tally.player ?? 0);
  });

  it("rejects an invalid demographic target without charging resources", () => {
    const { world, race } = setupFiledRace();
    world.player.actions = 10;
    world.player.funds = 1_000;
    const before = { actions: world.player.actions, funds: world.player.funds };

    expect(executeAction(world, "player", "campaignTargetedAd", {
      electionId: race.id,
      regionId: race.state!,
      demographicCategory: "missing",
      demographicGroup: "missing",
    })).toEqual({ ok: false, error: "Unknown campaign demographic target." });
    expect(world.player.actions).toBe(before.actions);
    expect(world.player.funds).toBe(before.funds);
  });
});
