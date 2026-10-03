import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { rngFromSeed } from "../rng.js";
import { realAccumulate } from "../elections/tallyAdapter.js";
import { createWorld } from "../world.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { deserializeSave, projectSaveToV42, serializeSave } from "../save.js";
import { executeAction } from "./execute.js";
import { adExposure } from "../campaigns/targetedAds.js";
import { quoteTargetedAds } from "./campaignTargetedAd.js";

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

function quoteParams(world: ReturnType<typeof createWorld>, count = 1) {
  const quote = quoteTargetedAds(world, count)!;
  return { count, expectedRevision: quote.revision, expectedTurn: quote.turn, expectedCost: quote.cost };
}

describe("campaignTargetedAd", () => {
  it("quotes the source frozen world base rate, not the market rate, and uses the forex-off anchor price", () => {
    const world = createWorld(OPTS);
    world.player.countryId = "UK";
    world.exchangeRates.UK!.baseRate = 0.357;
    world.exchangeRates.UK!.rate = 0.5;

    const quote = quoteTargetedAds(world, 3)!;
    expect(quote).toMatchObject({ turn: world.meta.turn, revision: 0, count: 3, cost: 107.1 });
    expect(quote.unitCost).toBeCloseTo(35.7, 12);
    expect(quoteTargetedAds(world, 51)).toBeNull();
    world.featureFlags.foreignExchange = false;
    expect(quoteTargetedAds(world, 3)?.cost).toBe(300);
  });

  it("fails closed when the enabled forex quote has no valid world base rate", () => {
    const world = createWorld(OPTS);
    world.exchangeRates.US!.baseRate = Number.NaN;
    expect(quoteTargetedAds(world)).toBeNull();
  });

  it("charges multiple quoted ad actions atomically into one source exposure flight", () => {
    const { world, race } = setupFiledRace();
    const target = firstTarget(world, race.state!);
    world.player.actions = 30;
    world.player.funds = 3_000;
    const result = executeAction(world, "player", "campaignTargetedAd", {
      electionId: race.id, regionId: race.state!, demographicCategory: target.category._id,
      demographicGroup: target.group.id, ...quoteParams(world, 5),
    });

    expect(result).toMatchObject({ ok: true, changes: { actions: -5, funds: -500 } });
    expect(world.player.targetedAds).toHaveLength(1);
    expect(world.player.targetedAds![0]).toMatchObject({ bonus: 0.05, lastPurchaseTurn: world.meta.turn });
    expect(world.player.targetedAdsRevision).toBe(1);
  });

  it("rejects stale turn and stale-cost quotes without changing the world or purse", () => {
    for (const stale of ["turn", "cost", "count"] as const) {
      const { world, race } = setupFiledRace();
      const target = firstTarget(world, race.state!);
      world.player.actions = 30;
      world.player.funds = 3_000;
      const quote = quoteParams(world, 2);
      if (stale === "turn") world.meta.turn += 1;
      else if (stale === "cost") world.exchangeRates.US!.baseRate += 0.01;
      const submittedQuote = stale === "count" ? { ...quote, count: 3 } : quote;
      const before = serializeSave(world, "2026-10-03T00:00:00.000Z");

      expect(executeAction(world, "player", "campaignTargetedAd", {
        electionId: race.id, regionId: race.state!, demographicCategory: target.category._id,
        demographicGroup: target.group.id, ...submittedQuote,
      })).toEqual({ ok: false, error: "The ad quote changed. Refresh before buying." });
      expect(serializeSave(world, "2026-10-03T00:00:00.000Z")).toBe(before);
    }
  });

  it("rejects a batch above the target cap without changing the saved world", () => {
    const { world, race } = setupFiledRace();
    const target = firstTarget(world, race.state!);
    world.player.actions = 30;
    world.player.funds = 3_000;
    const before = serializeSave(world, "2026-10-03T00:00:00.000Z");

    expect(executeAction(world, "player", "campaignTargetedAd", {
      electionId: race.id,
      regionId: race.state!,
      demographicCategory: target.category._id,
      demographicGroup: target.group.id,
      ...quoteParams(world, 26),
    })).toEqual({ ok: false, error: "Invalid target or action count" });
    expect(serializeSave(world, "2026-10-03T00:00:00.000Z")).toBe(before);
  });

  it("spends one quoted action and source-local funds, persists the capped bonus, and decays it", () => {
    const { world, race } = setupFiledRace();
    const target = firstTarget(world, race.state!);
    world.player.actions = 30;
    world.player.funds = 3_000;

    expect(executeAction(world, "player", "campaignTargetedAd", {
      electionId: race.id,
      regionId: race.state!,
      demographicCategory: target.category._id,
      demographicGroup: target.group.id,
      ...quoteParams(world),
    })).toEqual({ ok: true, message: `Bought 1 targeted ad action for ${target.group.name} voters in ${world.regions[race.state!]!.name}.`, changes: { actions: -1, funds: -100 } });
    expect(world.player.actions).toBe(29);
    expect(world.player.funds).toBe(2_900);
    expect(world.player.targetedAds).toEqual([{
      stateId: race.state!,
      dimension: target.category._id,
      bucket: target.group.id,
      bonus: 0.01,
      lastPurchaseTurn: world.meta.turn,
    }]);
    expect(world.player.targetedAdsRevision).toBe(1);

    const saved = deserializeSave(serializeSave(world, "2026-09-11T00:00:00.000Z"));
    expect(saved.player).toMatchObject({
      targetedAds: [{ stateId: race.state, dimension: target.category._id, bucket: target.group.id, bonus: 0.01, lastPurchaseTurn: world.meta.turn }],
      targetedAdsRevision: 1,
    });
    expect(projectSaveToV42(serializeSave(world, "2026-09-11T00:00:00.000Z"))).toEqual({
      ok: false,
      error: "Standing targeted-ad exposure cannot be continued by the schema 42 turn reader; keep this Native save.",
    });
    const beforeDecay = adExposure(world.player.targetedAds![0]!, world.meta.turn);
    advanceTurn(world);
    expect(adExposure(world.player.targetedAds![0]!, world.meta.turn)).toBeLessThan(beforeDecay);
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
    for (let i = 0; i < 25; i += 1) expect(executeAction(world, "player", "campaignTargetedAd", { ...params, ...quoteParams(world) }).ok).toBe(true);
    expect(world.player.targetedAds?.[0]?.bonus).toBeCloseTo(0.25, 10);
    const before = { actions: world.player.actions, funds: world.player.funds };
    expect(executeAction(world, "player", "campaignTargetedAd", { ...params, ...quoteParams(world) })).toEqual({
      ok: false,
      error: "Invalid target or action count",
    });
    expect(world.player.actions).toBe(before.actions);
    expect(world.player.funds).toBe(before.funds);
  });

  it("routes a live presidential campaign purchase through the selected domestic standing-ad region", () => {
    const { world, race } = setupFiledRace();
    race.electionType = "president";
    race.state = undefined;
    const regionId = Object.values(world.regions).find((region) => region.countryId === "US" && region.id !== world.player.homeRegionId)!.id;
    const target = firstTarget(world, regionId);
    world.player.actions = 5;
    world.player.funds = 500;

    expect(executeAction(world, "player", "campaignTargetedAd", {
      electionId: race.id,
      regionId,
      demographicCategory: target.category._id,
      demographicGroup: target.group.id,
      ...quoteParams(world),
    }).ok).toBe(true);
    expect(world.player.targetedAds?.[0]).toMatchObject({
      stateId: regionId, dimension: target.category._id, bucket: target.group.id, bonus: 0.01,
    });
  });

  it("keeps standing ads out of the normal regional general tally", () => {
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
    for (let i = 0; i < 25; i += 1) expect(executeAction(world, "player", "campaignTargetedAd", { ...params, ...quoteParams(world) }).ok).toBe(true);

    const baselineWorld = deserializeSave(serializeSave(world, "2026-09-11T00:00:00.000Z"));
    delete baselineWorld.player.targetedAds;
    const baselineRace = baselineWorld.elections.find((e) => e.id === race.id)!;
    let baselinePlayerBonuses: Record<string, number> | undefined;
    let treatedPlayerBonuses: Record<string, number> | undefined;
    expect(realAccumulate(baselineWorld, rngFromSeed("campaign-targeted-ad-tally"), baselineRace, undefined, (snapshot) => {
      baselinePlayerBonuses = snapshot.candidates.find((candidate) => candidate.candidateId === "player")?.targetedAdBonuses;
    })).toBe(true);
    expect(realAccumulate(world, rngFromSeed("campaign-targeted-ad-tally"), race, undefined, (snapshot) => {
      treatedPlayerBonuses = snapshot.candidates.find((candidate) => candidate.candidateId === "player")?.targetedAdBonuses;
    })).toBe(true);
    expect(baselinePlayerBonuses).toBeUndefined();
    expect(treatedPlayerBonuses).toBeUndefined();
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
      ...quoteParams(world),
    })).toEqual({ ok: false, error: "Choose a recorded demographic target in this region." });
    expect(world.player.actions).toBe(before.actions);
    expect(world.player.funds).toBe(before.funds);
  });

  it("migrates legacy campaign bonuses without inventing standing-ad history", () => {
    const { world, race } = setupFiledRace();
    world.campaigns[campaignKey(race.id, "player")]!.targetedAdModifiers = { "voterGroups:young_renters": 0.12 };
    const envelope = JSON.parse(serializeSave(world, "2026-10-03T00:00:00.000Z")) as {
      schemaVersion: number;
      world: { meta: { schemaVersion: number }; player: { targetedAds?: unknown; targetedAdsRevision?: number } };
    };
    envelope.schemaVersion = 68;
    envelope.world.meta.schemaVersion = 68;
    delete envelope.world.player.targetedAds;
    delete envelope.world.player.targetedAdsRevision;

    const migrated = deserializeSave(JSON.stringify(envelope));
    expect(migrated.meta.schemaVersion).toBe(69);
    expect(migrated.campaigns[campaignKey(race.id, "player")]!.targetedAdModifiers).toEqual({ "voterGroups:young_renters": 0.12 });
    expect(migrated.player.targetedAds).toBeUndefined();
    expect(migrated.player.targetedAdsRevision).toBeUndefined();
  });
});
