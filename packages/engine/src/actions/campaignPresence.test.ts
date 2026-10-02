import { describe, expect, it } from "vitest";
import { campaignKey, ensureCampaignsForElection } from "../campaigns/lifecycle.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { executeAction } from "./execute.js";
import type { ElectionRecord } from "../elections/types.js";

describe("source presidential campaign presence", () => {
  function setup() {
    const world = createWorld({ seed: "source-presence", playerName: "Player", countryId: "US", era: "1953", homeRegionId: "IA" });
    const election: ElectionRecord = {
      id: "president:US:-:c-source-presence",
      electionType: "president",
      countryId: "US",
      cycle: 1,
      status: "active",
      startTurn: 0,
      primaryEndTurn: 20,
      endTurn: 40,
      totalSeats: 1,
      chamberKey: "president",
      candidates: [{ id: "player", name: "Player", partyId: world.player.partyId ?? "US_DEM", isNPP: false, incumbent: false }],
      tally: {},
    };
    world.elections = [election];
    ensureCampaignsForElection(world, election);
    const campaign = world.campaigns[campaignKey(election.id, "player")]!;
    campaign.actions = 10;
    campaign.funds = 1_000_000;
    return { world, election, campaign };
  }

  it("spends source campaign pools, enforces one state build per turn, and saves the level", () => {
    const { world, election, campaign } = setup();
    const playerActions = world.player.actions;
    const playerFunds = world.player.funds;

    const first = executeAction(world, "player", "buildStatePresence", { regionId: "IA" });
    expect(first.ok).toBe(true);
    expect(campaign.actions).toBe(7);
    expect(campaign.funds).toBe(750_000);
    expect(world.player.actions).toBe(playerActions);
    expect(world.player.funds).toBe(playerFunds);
    expect(world.player.primaryStateOrganizations?.IA).toMatchObject({
      level: 1,
      totalInvested: 3,
      updatedAtTurn: world.meta.turn,
      lastBuildTurn: world.meta.turn,
      lastBuildFunds: 250_000,
    });

    const beforeRetry = serializeSave(world, "2026-10-02T00:00:00Z");
    expect(executeAction(world, "player", "buildStatePresence", { regionId: "IA" }).ok).toBe(false);
    expect(serializeSave(world, "2026-10-02T00:00:00Z")).toBe(beforeRetry);

    world.meta.turn += 1;
    expect(executeAction(world, "player", "buildStatePresence", { regionId: "IA" }).ok).toBe(true);
    expect(campaign.actions).toBe(4);
    expect(campaign.funds).toBe(412_500);
    expect(world.player.primaryStateOrganizations?.IA?.level).toBe(2);

    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00Z"));
    expect(resumed.player.primaryStateOrganizations).toEqual(world.player.primaryStateOrganizations);
    expect(resumed.campaigns[campaignKey(election.id, "player")]?.funds).toBe(412_500);
  });

  it("refuses insufficient campaign funds without changing player or campaign state", () => {
    const { world, campaign } = setup();
    campaign.funds = 249_999;
    const before = serializeSave(world, "2026-10-02T00:00:00Z");

    const result = executeAction(world, "player", "buildStatePresence", { regionId: "IA" });

    expect(result.ok).toBe(false);
    expect(serializeSave(world, "2026-10-02T00:00:00Z")).toBe(before);
  });

  it("rejects malformed saved state organization IDs and turn clocks", () => {
    const { world } = setup();
    expect(executeAction(world, "player", "buildStatePresence", { regionId: "IA" }).ok).toBe(true);
    const baseline = JSON.parse(serializeSave(world, "2026-10-02T00:00:00Z")) as {
      world: { player: { primaryStateOrganizations: Record<string, Record<string, unknown>> } };
    };

    const unknownState = structuredClone(baseline);
    unknownState.world.player.primaryStateOrganizations["NOT_A_STATE"] =
      structuredClone(unknownState.world.player.primaryStateOrganizations["IA"]!);
    expect(() => deserializeSave(JSON.stringify(unknownState))).toThrow(/invalid primary state organization for NOT_A_STATE/);

    const futureTurn = structuredClone(baseline);
    futureTurn.world.player.primaryStateOrganizations["IA"]!.updatedAtTurn = world.meta.turn + 1;
    expect(() => deserializeSave(JSON.stringify(futureTurn))).toThrow(/invalid primary state organization for IA/);
  });
});
