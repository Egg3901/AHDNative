import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { executeAction } from "./execute.js";
import { deserializeSave, serializeSave } from "../save.js";
import { campaignKey } from "../campaigns/lifecycle.js";
import { calculateCampaignIncome } from "../campaigns/income.js";

/**
 * #67: player campaign upgrade purchases through the public
 * createWorld / executeAction / advanceTurn / serializeSave boundary.
 *
 * Authority (AHDGame d4baf899, read-only): upgradeCampaign in
 * src/lib/campaigns/commands/campaignCommands.ts — starter before
 * branches, exact upgrade table with the 1.5x general-phase surcharge,
 * campaign-treasury (not player) funds/actions deducted, spend accrues
 * to spendThisTurn (folded into spendStock by the reset sweep, never
 * written directly).
 */

const OPTS = { seed: "campaign-upgrade", playerName: "Tester", countryId: "US", era: "1953" } as const;

function setupFiledRace() {
  const world = createWorld(OPTS);
  const joined = executeAction(world, "player", "joinParty", { partyId: "US_DEM" });
  expect(joined.ok).toBe(true);
  for (let i = 0; i < 300; i++) {
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

describe("campaignUpgrade", () => {
  it("rejects branch purchases before the starter and unknown lanes", () => {
    const { world, raceId } = setupFiledRace();
    expect(
      executeAction(world, "player", "campaignUpgrade", { electionId: raceId, category: "fundraising", branch: "a" }),
    ).toMatchObject({ ok: false });
    expect(
      executeAction(world, "player", "campaignUpgrade", { electionId: raceId, category: "nope" }),
    ).toMatchObject({ ok: false });
    expect(
      executeAction(world, "player", "campaignUpgrade", { electionId: "missing", category: "fundraising" }),
    ).toMatchObject({ ok: false });
  });

  it("rejects the starter while the campaign treasury cannot cover it", () => {
    const { world, raceId } = setupFiledRace();
    const res = executeAction(world, "player", "campaignUpgrade", { electionId: raceId, category: "fundraising" });
    expect(res.ok).toBe(false);
  });

  it("buys the starter from campaign pools, accrues spend, persists across save/reload and raises income", () => {
    const { world, raceId } = setupFiledRace();
    const key = campaignKey(raceId, "player");
    // Accrue campaign funds/actions through real turns (bounded).
    let bought = executeAction(world, "player", "campaignUpgrade", { electionId: raceId, category: "fundraising" });
    for (let i = 0; i < 12 && !bought.ok; i++) {
      advanceTurn(world);
      bought = executeAction(world, "player", "campaignUpgrade", { electionId: raceId, category: "fundraising" });
    }
    expect(bought.ok).toBe(true);
    const campaign = world.campaigns[key]!;
    expect(campaign.fundraisingTree.starter).toBe(true);
    expect(campaign.spendThisTurn).toBeGreaterThan(0);
    expect(campaign.totalFundsSpent).toBeGreaterThan(0);
    expect(campaign.activityHistory).toEqual([
      expect.objectContaining({
        type: "upgrade",
        category: "fundraising",
        newLevel: 1,
        costFunds: campaign.totalFundsSpent,
        costActions: 10,
        turnNumber: world.meta.turn,
      }),
    ]);
    // Fundraising starter raises the exact-table income above the unstarted base.
    const income = calculateCampaignIncome(campaign, "house");
    expect(income).toBeGreaterThan(Math.round(20_000 * 0.3));

    const reloaded = deserializeSave(serializeSave(world, new Date().toISOString()));
    expect(reloaded.campaigns[key]!.fundraisingTree.starter).toBe(true);
    expect(reloaded.campaigns[key]!.funds).toBe(campaign.funds);
    expect(reloaded.campaigns[key]!.activityHistory).toEqual(campaign.activityHistory);

    const legacySave = JSON.parse(serializeSave(world, new Date().toISOString())) as {
      world: { campaigns: Record<string, Record<string, unknown>> };
    };
    delete legacySave.world.campaigns[key]!.activityHistory;
    const legacyReloaded = deserializeSave(JSON.stringify(legacySave));
    expect(legacyReloaded.campaigns[key]!.activityHistory).toEqual([]);

    // One more real turn: income lands in the treasury (net of upkeep).
    const before = reloaded.campaigns[key]!.funds;
    advanceTurn(reloaded);
    expect(reloaded.campaigns[key]!.funds).toBeGreaterThan(before);
  });

  it("buys a branch after the starter and reports max level", () => {
    const { world, raceId } = setupFiledRace();
    const key = campaignKey(raceId, "player");
    for (let i = 0; i < 40; i++) {
      advanceTurn(world);
      const campaign = world.campaigns[key]!;
      if (campaign.status !== "active") break;
      if (!campaign.fundraisingTree.starter) {
        executeAction(world, "player", "campaignUpgrade", { electionId: raceId, category: "fundraising" });
      } else if (campaign.fundraisingTree.a < 1) {
        const res = executeAction(world, "player", "campaignUpgrade", {
          electionId: raceId, category: "fundraising", branch: "a",
        });
        if (res.ok) break;
      }
    }
    expect(world.campaigns[key]!.fundraisingTree.a).toBe(1);
  });
});
