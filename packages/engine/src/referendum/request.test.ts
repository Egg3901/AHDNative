import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { CAMPAIGN_WINDOW_TURNS } from "./lifecycle.js";

const OPTS = {
  seed: "referendum-request",
  playerName: "Tester",
  countryId: "UK",
  homeRegionId: "SCO",
  era: "1953",
} as const;

describe("requestReferendum action (issue #42)", () => {
  it("writes a granted referendum that survives save/load and reaches polling at the campaign close", () => {
    const world = createWorld(OPTS);
    expect(world.referendums).toEqual([]);
    world.regions.SCO!.independenceDesire = 60;

    const result = executeAction(world, "player", "requestReferendum", { regionId: "SCO" });

    expect(result).toEqual({ ok: true, message: "SCO independence referendum granted." });
    expect(world.referendums).toHaveLength(1);
    expect(world.referendums[0]).toMatchObject({
      id: "referendum-SCO-0",
      countryId: "UK",
      regionId: "SCO",
      kind: "independence",
      targetCountryId: null,
      status: "granted",
      yesShare: 60,
      campaignBaseYesShare: 60,
      requestedTurn: 0,
      grantedTurn: 0,
      campaignOpenTurn: 0,
      campaignCloseTurn: CAMPAIGN_WINDOW_TURNS,
    });

    const revived = deserializeSave(serializeSave(world, new Date(0).toISOString()));
    expect(revived.referendums).toEqual(world.referendums);

    advanceTurn(revived);
    expect(revived.referendums[0]!.status).toBe("campaigning");
    while (revived.meta.turn < CAMPAIGN_WINDOW_TURNS) advanceTurn(revived);
    expect(revived.referendums[0]!.status).toBe("polling");
  });

  it("keeps createWorld free of invented referendum records", () => {
    const world = createWorld(OPTS);
    expect(world.referendums).toEqual([]);
  });

  it("ports the source eligibility gates without charging a rejected request", () => {
    const belowThreshold = createWorld(OPTS);
    belowThreshold.regions.SCO!.independenceDesire = 59;
    const belowThresholdActions = belowThreshold.player.actions;
    expect(executeAction(belowThreshold, "player", "requestReferendum", { regionId: "SCO" })).toEqual({
      ok: false,
      error: "Independence desire must reach 60 to request a referendum.",
    });
    expect(belowThreshold.player.actions).toBe(belowThresholdActions);
    expect(belowThreshold.referendums).toEqual([]);

    const active = createWorld(OPTS);
    active.regions.SCO!.independenceDesire = 60;
    expect(executeAction(active, "player", "requestReferendum", { regionId: "SCO" }).ok).toBe(true);
    const activeActions = active.player.actions;
    expect(executeAction(active, "player", "requestReferendum", { regionId: "SCO" })).toEqual({
      ok: false,
      error: "A referendum is already in progress for this region.",
    });
    expect(active.player.actions).toBe(activeActions);

    const cooldown = createWorld(OPTS);
    cooldown.regions.SCO!.independenceDesire = 60;
    const prior = cooldown.referendums;
    prior.push({
      id: "referendum-SCO-prior",
      countryId: "UK",
      regionId: "SCO",
      kind: "independence",
      status: "settled",
      yesShare: 45,
      requestedTurn: 0,
      grantedTurn: 0,
      cooldownReadyAtTurn: 10,
    });
    const cooldownActions = cooldown.player.actions;
    expect(executeAction(cooldown, "player", "requestReferendum", { regionId: "SCO" })).toEqual({
      ok: false,
      error: "On cooldown until turn 10.",
    });
    expect(cooldown.player.actions).toBe(cooldownActions);
    expect(cooldown.referendums).toHaveLength(1);
  });
});
