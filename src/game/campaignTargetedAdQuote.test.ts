import { describe, expect, it } from "vitest";
import { GameSession } from "./session.js";

const GOVERNOR_RACE = "governor:US:WY:c1";

describe("public campaign targeted-ad quote", () => {
  it("confirms the exact projected quote from an eligible filed governor campaign and preserves the purchase on reload", () => {
    const session = new GameSession();
    session.create({
      era: "1953",
      countryId: "US",
      seed: "public-campaign-ad-quote-wy",
      playerName: "Alex",
      homeRegionId: "WY",
      creation: {
        name: "Alex",
        homeRegionId: "WY",
        partyId: null,
        stats: { charisma: 8, debate: 3, energy: 3, fundraising: 3, businessAcumen: 3, statecraft: 3, intellect: 5 },
        policies: { economic: 3, social: 2 },
        demographics: { race: "white", gender: "male", education: "college", wealth: "middle" },
      },
    });
    expect(session.act("joinParty", { partyId: "US_REP" }).ok).toBe(true);
    const active = session.advance();
    expect(active.elections.find((race) => race.id === GOVERNOR_RACE)).toMatchObject({ status: "active", phase: "primary" });
    expect(session.act("declareCandidacy", { electionId: GOVERNOR_RACE }).ok).toBe(true);

    const campaign = session.politics().elections.find((race) => race.id === GOVERNOR_RACE)?.playerCampaign;
    const projection = campaign?.targetedAds;
    expect(projection?.action.available).toBe(true);
    expect(projection?.quoteTurn).toBe(active.turn);
    expect(projection?.quoteUnitCost).toBeGreaterThan(0);
    const target = projection?.targets.find((entry) => entry.regionId === "WY" && !entry.maxed);
    expect(target).toBeDefined();
    const revision = projection!.revision;
    const result = session.act("campaignTargetedAd", {
      electionId: GOVERNOR_RACE,
      regionId: "WY",
      demographicCategory: target!.category,
      demographicGroup: target!.group,
      expectedRevision: revision,
      expectedTurn: projection!.quoteTurn!,
      expectedCost: projection!.quoteUnitCost!,
      count: 1,
    });
    expect(result.ok).toBe(true);

    const save = session.serialize("2026-10-03T00:00:00.000Z");
    const stored = JSON.parse(save) as {
      world: { player: { targetedAdsRevision?: number; targetedAds?: Array<{ stateId: string; dimension: string; bucket: string; bonus: number; lastPurchaseTurn: number }> } };
    };
    expect(stored.world.player.targetedAdsRevision).toBe(revision + 1);
    expect(stored.world.player.targetedAds).toContainEqual(expect.objectContaining({
      stateId: "WY", dimension: target!.category, bucket: target!.group, bonus: 0.01,
    }));
    const loaded = new GameSession();
    loaded.load(save);
    const resumed = loaded.politics().elections.find((race) => race.id === GOVERNOR_RACE)?.playerCampaign?.targetedAds;
    expect(resumed?.revision).toBe(revision + 1);
    expect(resumed?.targets.find((entry) => entry.regionId === "WY" && entry.category === target!.category && entry.group === target!.group)?.bonus).toBe(0.01);
  });
});
