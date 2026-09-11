import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { getCampaignFamilyScalar } from "../campaigns/upgradeCosts.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { executeAction } from "./execute.js";

const OPTS = { seed: "campaign-rally-tour", playerName: "Tester", countryId: "US", era: "1953" } as const;

function setupFiledRace() {
  const world = createWorld(OPTS);
  const joined = executeAction(world, "player", "joinParty", { partyId: "US_DEM" });
  expect(joined.ok).toBe(true);
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
      const filed = executeAction(world, "player", "declareCandidacy", { electionId: race.id });
      expect(filed.ok).toBe(true);
      return { world, raceId: race.id };
    }
    advanceTurn(world);
  }
  throw new Error("no open US house race within 300 turns");
}

describe("campaignRallyTour", () => {
  it("waits for campaign actions instead of creating an unfunded tour tick", () => {
    const { world, raceId } = setupFiledRace();
    const campaign = world.campaigns[campaignKey(raceId, "player")]!;
    campaign.actions = 0;

    expect(executeAction(world, "player", "campaignRallyTour", {
      electionId: raceId,
      rallyTour: "start",
    }).ok).toBe(true);
    advanceTurn(world);

    expect(world.candidateSupports.player).toMatchObject({ support: 50, supportAccrual: [], rallyTourActive: true });
    expect(campaign.actions).toBe(4);
  });

  it("starts a persistent tour, ticks once per turn when affordable, and stops without clearing the drip", () => {
    const { world, raceId } = setupFiledRace();
    const campaign = world.campaigns[campaignKey(raceId, "player")]!;
    const scalar = getCampaignFamilyScalar("house");
    const tickCost = Math.ceil(10 * scalar);
    campaign.actions = tickCost;

    const started = executeAction(world, "player", "campaignRallyTour", {
      electionId: raceId,
      rallyTour: "start",
    });
    expect(started).toEqual({ ok: true, message: "Campaign rally tour started." });
    expect(world.candidateSupports.player).toMatchObject({ rallyTourActive: true, support: 50, supportAccrual: [] });
    expect(campaign.actions).toBe(tickCost);

    advanceTurn(world);
    expect(world.candidateSupports.player!.support).toBeCloseTo(50 + 10 * scalar * 0.6, 8);
    expect(world.candidateSupports.player!.supportAccrual).toEqual([
      { amountPerTurn: (10 * scalar * 0.4) / 4, turnsRemaining: 4 },
    ]);
    expect(campaign.actions).toBe(4);

    const saved = deserializeSave(serializeSave(world, new Date().toISOString()));
    const stopped = executeAction(saved, "player", "campaignRallyTour", {
      electionId: raceId,
      rallyTour: "stop",
    });
    expect(stopped).toEqual({ ok: true, message: "Campaign rally tour stopped." });
    expect(saved.candidateSupports.player!.rallyTourActive).toBe(false);

    advanceTurn(saved);
    expect(saved.candidateSupports.player!.supportAccrual).toEqual([
      { amountPerTurn: (10 * scalar * 0.4) / 4, turnsRemaining: 3 },
    ]);
    expect(saved.campaigns[campaignKey(raceId, "player")]!.actions).toBe(8);
  });

  it("rejects an invalid toggle without changing the campaign or support row", () => {
    const { world, raceId } = setupFiledRace();
    const campaign = world.campaigns[campaignKey(raceId, "player")]!;
    const before = JSON.stringify({ campaign, support: world.candidateSupports.player });

    expect(executeAction(world, "player", "campaignRallyTour", { electionId: raceId })).toEqual({
      ok: false,
      error: "campaignRallyTour requires rallyTour start|stop",
    });
    expect(JSON.stringify({ campaign, support: world.candidateSupports.player })).toBe(before);
  });
});
