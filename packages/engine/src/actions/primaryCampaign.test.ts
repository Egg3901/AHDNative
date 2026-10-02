import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import type { ElectionRecord } from "../elections/types.js";
import { executeAction } from "./execute.js";
import { deserializeSave, serializeSave } from "../save.js";
import { PRIMARY_CAMPAIGN_TICK_CAP } from "../electionEngine/constants.js";
import { advanceTurn } from "../engine.js";

describe("source presidential primary campaign state", () => {
  function fixture() {
    const world = createWorld({ seed: "source-primary-campaign", playerName: "Player", countryId: "US", era: "1953", homeRegionId: "IA" });
    const party = world.parties.US_DEM!;
    world.player.partyId = party.id;
    world.player.actions = 10;
    const candidate = { id: "player", name: "Player", partyId: party.id, isNPP: false, incumbent: false };
    const opponent = world.politicians.find((row) => row.countryId === "US")!;
    opponent.partyId = party.id;
    const election: ElectionRecord = {
      id: "president:US:-:c-source-primary-campaign",
      electionType: "president",
      countryId: "US",
      cycle: 1,
      status: "active",
      startTurn: 0,
      primaryEndTurn: 20,
      endTurn: 40,
      totalSeats: 1,
      chamberKey: "president",
      candidates: [candidate],
      tally: {},
    };
    world.elections = [election];
    return { world, election };
  }

  it("charges the source electoral-vote travel price and resets only on a valid state change", () => {
    const { world, election } = fixture();
    const actionsBefore = world.player.actions;

    const first = executeAction(world, "player", "setPrimaryCampaignState", { electionId: election.id, regionId: "CA" });

    expect(first.ok).toBe(true);
    expect(world.player.actions).toBe(actionsBefore - 10);
    expect(election.candidates[0]).toMatchObject({ primaryCampaignState: "CA", primaryCampaignTicks: 0 });
    election.candidates[0]!.primaryCampaignTicks = 3;
    const retry = executeAction(world, "player", "setPrimaryCampaignState", { electionId: election.id, regionId: "CA" });
    expect(retry.ok).toBe(false);
    expect(election.candidates[0]!.primaryCampaignTicks).toBe(3);

    world.player.actions = 10;
    const move = executeAction(world, "player", "setPrimaryCampaignState", { electionId: election.id, regionId: "IA" });
    expect(move.ok).toBe(true);
    expect(world.player.actions).toBe(5);
    expect(election.candidates[0]).toMatchObject({ primaryCampaignState: "IA", primaryCampaignTicks: 0 });
  });

  it("ticks on a normal turn, caps at the source limit, and persists the candidate record", () => {
    const { world, election } = fixture();
    const candidate = election.candidates[0]!;
    candidate.primaryCampaignState = "IA";
    candidate.primaryCampaignTicks = PRIMARY_CAMPAIGN_TICK_CAP - 1;

    advanceTurn(world);

    expect(candidate.primaryCampaignTicks).toBe(PRIMARY_CAMPAIGN_TICK_CAP);
    expect(deserializeSave(serializeSave(world, "2026-10-02T00:00:00Z")).elections[0]?.candidates[0])
      .toMatchObject({ primaryCampaignState: "IA", primaryCampaignTicks: PRIMARY_CAMPAIGN_TICK_CAP });
  });

  it("charges the one-time source home-state surge and persists its authored rate", () => {
    const { world, election } = fixture();
    world.player.actions = 4;
    world.player.funds = 100_000;

    const first = executeAction(world, "player", "usePrimaryHomeStateSurge", { electionId: election.id });

    expect(first.ok).toBe(true);
    expect(world.player.actions).toBe(1);
    expect(world.player.funds).toBe(75_000);
    expect(election.candidates[0]).toMatchObject({ primarySurgeUsed: true, primarySurgeBoost: 15 });
    const beforeRetry = serializeSave(world, "2026-10-02T00:00:00Z");
    expect(executeAction(world, "player", "usePrimaryHomeStateSurge", { electionId: election.id }).ok).toBe(false);
    expect(serializeSave(world, "2026-10-02T00:00:00Z")).toBe(beforeRetry);

    const resumed = deserializeSave(beforeRetry);
    expect(resumed.elections[0]?.candidates[0]).toMatchObject({ primarySurgeUsed: true, primarySurgeBoost: 15 });
  });
});
