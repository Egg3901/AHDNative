import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { cumulativeCampaignEffect, effLean, referendumYesShare } from "./cohort.js";
import { CAMPAIGN_PS_COST_PER_UNIT } from "./campaign.js";
import { GROUND_GAME_PRESETS, findGroundGamePreset } from "./groundGame.js";
import type { ReferendumRecord } from "./types.js";

const OPTS = {
  seed: "referendum-campaign-writer",
  playerName: "Tester",
  countryId: "UK",
  homeRegionId: "SCO",
  era: "1953",
} as const;

/** Create a UK world with an open, campaigning SCO referendum (baseline live). */
function openCampaign(options: { desire?: number } = {}): { world: ReturnType<typeof createWorld>; record: ReferendumRecord } {
  const world = createWorld(OPTS);
  world.regions.SCO!.independenceDesire = options.desire ?? 60;
  const requested = executeAction(world, "player", "requestReferendum", { regionId: "SCO" });
  expect(requested.ok).toBe(true);
  // granted -> campaigning snapshots the cohort baseline.
  advanceTurn(world);
  const record = world.referendums[0]!;
  expect(record.status).toBe("campaigning");
  expect(record.cohortBaseline!.length).toBeGreaterThan(1);
  return { world, record };
}

describe("referendum campaign spend writer (#70)", () => {
  it("ports the reference cost constant verbatim", () => {
    expect(CAMPAIGN_PS_COST_PER_UNIT).toBe(1);
  });

  it("writes campaignSpendUnits and folds it into the canonical yes share", () => {
    const { world, record } = openCampaign();
    world.player.partyId = "UK_SNP"; // SCO's pro-independence party (Yes side)
    world.parties.UK_SNP!.politicalStrength = 100;
    const baselineShare = record.yesShare;

    const res = executeAction(world, "player", "referendumCampaignSpend", {
      referendumId: record.id,
      referendumSide: "yes",
      units: 10,
    });
    expect(res.ok).toBe(true);
    expect(record.campaignSpendUnits).toEqual({ yes: 10, no: 0 });
    expect(world.parties.UK_SNP!.politicalStrength).toBe(100 - 10 * CAMPAIGN_PS_COST_PER_UNIT);
    // The canonical share is recomputed from the cohort baseline + the uniform
    // lean shift `leanFromUnits` derives from the spend counters (linear, not
    // saturated — the saturating cap only applies to ground-game cohort mods).
    expect(record.yesShare).toBeCloseTo(referendumYesShare(record), 10);
    expect(record.yesShare).toBeCloseTo(baselineShare + cumulativeCampaignEffect(10), 8);
    expect(record.yesShare).toBeGreaterThan(baselineShare);
  });

  it("rejects the wrong side for the player party without charging PS", () => {
    const { world, record } = openCampaign();
    world.player.partyId = "UK_LAB"; // not the pro-indy party -> mapped to No
    world.parties.UK_LAB!.politicalStrength = 100;

    const res = executeAction(world, "player", "referendumCampaignSpend", {
      referendumId: record.id,
      referendumSide: "yes",
      units: 5,
    });
    expect(res).toEqual({ ok: false, error: "This party campaigns for the No side." });
    expect(world.parties.UK_LAB!.politicalStrength).toBe(100);
    expect(record.campaignSpendUnits ?? { yes: 0, no: 0 }).toEqual({ yes: 0, no: 0 });
  });

  it("rejects insufficient Political Strength atomically", () => {
    const { world, record } = openCampaign();
    world.player.partyId = "UK_SNP";
    world.parties.UK_SNP!.politicalStrength = 3;

    const res = executeAction(world, "player", "referendumCampaignSpend", {
      referendumId: record.id,
      referendumSide: "yes",
      units: 5,
    });
    expect(res).toEqual({ ok: false, error: "Insufficient Political Strength (need 5, have 3)." });
    expect(world.parties.UK_SNP!.politicalStrength).toBe(3);
    expect(record.campaignSpendUnits ?? { yes: 0, no: 0 }).toEqual({ yes: 0, no: 0 });
  });

  it("refuses spend while the campaign is not open", () => {
    const world = createWorld(OPTS);
    world.regions.SCO!.independenceDesire = 60;
    executeAction(world, "player", "requestReferendum", { regionId: "SCO" });
    // Still "granted" — the campaign window has not opened.
    const record = world.referendums[0]!;
    world.player.partyId = "UK_SNP";
    world.parties.UK_SNP!.politicalStrength = 100;
    const res = executeAction(world, "player", "referendumCampaignSpend", {
      referendumId: record.id,
      referendumSide: "yes",
      units: 1,
    });
    expect(res).toEqual({ ok: false, error: "No active campaign for this referendum." });
    expect(world.parties.UK_SNP!.politicalStrength).toBe(100);
  });
});

describe("referendum ground-game writer (#70)", () => {
  it("accumulates cohortModifiers, writes the audit ledger and refreshes yesShare", () => {
    const { world, record } = openCampaign();
    world.player.funds = 1_000_000;
    world.player.actions = 25;
    const preset = findGroundGamePreset("broadcast_ads")!;
    const baselineShare = record.yesShare;

    const res = executeAction(world, "player", "referendumGroundGame", {
      referendumId: record.id,
      referendumSide: "yes",
      presetId: "broadcast_ads",
      cohortGroupId: "",
    });
    expect(res.ok).toBe(true);
    expect(world.player.funds).toBe(1_000_000 - preset.funds);
    expect(world.player.actions).toBe(25 - preset.actions);
    // Whole-electorate persuade adds a uniform lean shift == leanSwing, read
    // through the per-cohort soft cap (effLean) at aggregate time.
    expect(record.yesShare).toBeCloseTo(baselineShare + effLean(preset.leanSwing ?? 0), 8);
    expect(record.groundGameUnits).toEqual([
      { groupId: "_whole", mobilizeUnits: 0, persuadeYes: preset.leanSwing ?? 0, persuadeNo: 0 },
    ]);
    const young = record.cohortModifiers!.find((m) => m.groupId === "age:young")!;
    expect(young.leanMod).toBeCloseTo(preset.leanSwing ?? 0, 10);
  });

  it("concentrates a targeted persuade onto one real cohort", () => {
    const { world, record } = openCampaign();
    world.player.funds = 1_000_000;
    world.player.actions = 25;
    const cohortId = record.cohortBaseline![0]!.groupId;

    const res = executeAction(world, "player", "referendumGroundGame", {
      referendumId: record.id,
      referendumSide: "yes",
      presetId: "broadcast_ads",
      cohortGroupId: cohortId,
    });
    expect(res.ok).toBe(true);
    const only = record.cohortModifiers!;
    expect(only).toHaveLength(1);
    expect(only[0]!.groupId).toBe(cohortId);
    expect(only[0]!.leanMod).toBeGreaterThan(0);
  });

  it("rejects an unknown preset, unknown cohort and inactive campaign without debiting", () => {
    const { world, record } = openCampaign();
    world.player.funds = 1_000_000;
    world.player.actions = 25;

    expect(executeAction(world, "player", "referendumGroundGame", {
      referendumId: record.id, referendumSide: "yes", presetId: "nope",
    })).toEqual({ ok: false, error: "Unknown campaign action." });

    expect(executeAction(world, "player", "referendumGroundGame", {
      referendumId: record.id, referendumSide: "yes", presetId: "broadcast_ads", cohortGroupId: "no:such",
    })).toEqual({ ok: false, error: "Unknown target cohort." });

    // A side that is not yes/no is rejected before any debit.
    expect(executeAction(world, "player", "referendumGroundGame", {
      referendumId: record.id, presetId: "broadcast_ads",
    })).toEqual({ ok: false, error: "Choose a valid campaign side." });

    expect(world.player.funds).toBe(1_000_000);
    expect(world.player.actions).toBe(25);
    expect(record.cohortModifiers ?? []).toEqual([]);
  });

  it("rejects insufficient Actions or Campaign Funds atomically", () => {
    const { world, record } = openCampaign();
    world.player.funds = 0;
    world.player.actions = 25;

    expect(executeAction(world, "player", "referendumGroundGame", {
      referendumId: record.id, referendumSide: "yes", presetId: "broadcast_ads",
    })).toEqual({ ok: false, error: "Not enough Actions or Campaign Funds." });
    expect(record.cohortModifiers ?? []).toEqual([]);
    expect(world.player.actions).toBe(25);
  });
});

describe("referendum campaign spend reaches the resolved vote (#70)", () => {
  it("a Yes ground-game push raises the resolved final share versus an identical no-spend control", () => {
    const control = openCampaign().world;
    const spent = openCampaign().world;
    spent.player.funds = 1_000_000;
    spent.player.actions = 25;

    const preset = findGroundGamePreset("broadcast_ads")!;
    expect(executeAction(spent, "player", "referendumGroundGame", {
      referendumId: spent.referendums[0]!.id,
      referendumSide: "yes",
      presetId: "broadcast_ads",
    }).ok).toBe(true);

    // Campaign is 48 turns; run both worlds to resolution.
    while (control.referendums[0]!.status !== "settled" && control.referendums[0]!.status !== "actuating") {
      advanceTurn(control);
    }
    while (spent.referendums[0]!.status !== "settled" && spent.referendums[0]!.status !== "actuating") {
      advanceTurn(spent);
    }

    const c = control.referendums[0]!;
    const s = spent.referendums[0]!;
    // Same seed/turn/id => same seeded variance roll, so the resolved shares
    // differ by exactly the spend's canonical shift.
    expect(s.finalYesShare).toBeCloseTo(c.finalYesShare! + effLean(preset.leanSwing ?? 0), 5);
    expect(s.yesShare).toBeGreaterThan(c.yesShare);
  });

  it("replays the contributed campaign identically through save/reload to resolution", () => {
    const world = openCampaign().world;
    world.player.funds = 1_000_000;
    world.player.actions = 25;
    expect(executeAction(world, "player", "referendumGroundGame", {
      referendumId: world.referendums[0]!.id,
      referendumSide: "yes",
      presetId: "broadcast_ads",
    }).ok).toBe(true);
    world.player.partyId = "UK_SNP";
    world.parties.UK_SNP!.politicalStrength = 100;
    expect(executeAction(world, "player", "referendumCampaignSpend", {
      referendumId: world.referendums[0]!.id,
      referendumSide: "yes",
      units: 6,
    }).ok).toBe(true);

    const revived = deserializeSave(serializeSave(world, new Date(0).toISOString()));
    expect(revived.referendums).toEqual(world.referendums);

    let guard = 0;
    while (
      (world.referendums[0]!.status === "campaigning" || world.referendums[0]!.status === "polling") &&
      guard < 80
    ) {
      advanceTurn(world);
      advanceTurn(revived);
      expect(serializeSave(revived, new Date(0).toISOString())).toBe(
        serializeSave(world, new Date(0).toISOString()),
      );
      guard += 1;
    }
    expect(revived.referendums[0]!.status).not.toBe("campaigning");
    expect(revived.referendums[0]!.finalYesShare).toBe(world.referendums[0]!.finalYesShare);
  });
});

describe("ground-game preset catalog (#70)", () => {
  it("ports the reference presets verbatim", () => {
    expect(GROUND_GAME_PRESETS.map((p) => p.id)).toEqual([
      "press_conference", "doorstep_canvass", "gotv_drive", "broadcast_ads", "mass_rally",
    ]);
    expect(findGroundGamePreset("mass_rally")).toMatchObject({ effect: "mobilize", turnoutPush: 13, funds: 620_000, actions: 3 });
  });
});
