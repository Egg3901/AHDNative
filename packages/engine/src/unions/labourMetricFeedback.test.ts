import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { nationalMetricsPhase } from "../metrics/nationalMetrics.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import {
  openBargainingCampaignAction,
  answerBargainingCampaignAsEmployer,
  settleBargainingCampaignDirect,
} from "./actions.js";

const OPTIONS = { seed: "union-political-feedback", playerName: "Tester", countryId: "US", era: "1953" } as const;
const TERMS = { wageLevel: 1.1, agreementDurationTurns: 48, noStrikeTurns: 24 };

function disputeWorld() {
  const world = createWorld(OPTIONS);
  const union = world.unions["US-manufacturing"]!;
  union.unionization = 70;
  const asset = Object.values(corporateSectorAssets(world)).find((row) => row.corporationId === "US-manufacturing")!;
  asset.unionization = 70;
  const opened = openBargainingCampaignAction(world, {
    unionId: union.id,
    employerCorporationId: "US-manufacturing",
    terms: TERMS,
    turn: 0,
  });
  answerBargainingCampaignAsEmployer(world, { campaignId: opened.id, action: "reject", turn: 1 });
  world.meta.turn = 2;
  return { world, campaignId: opened.id };
}

describe("#322 labor political feedback consumer", () => {
  it("applies dispute and settlement nudges to national metrics without charging economic damage twice", () => {
    const { world, campaignId } = disputeWorld();
    const revenueBefore = world.corporations["US-manufacturing"]!.revenue;

    nationalMetricsPhase.run(world);

    expect(world.nationalMetrics.US?.["economy.workerSecurity"]?.value).toBe(50 - 0.75 * 0.9);
    expect(world.nationalMetrics.US?.["society.civicLife"]?.value).toBe(50 - 0.4 * 0.9);
    expect(world.corporations["US-manufacturing"]!.revenue).toBe(revenueBefore);

    answerBargainingCampaignAsEmployer(world, {
      campaignId,
      action: "counter",
      terms: { ...TERMS, wageLevel: 1.05 },
      turn: 2,
    });
    settleBargainingCampaignDirect(world, campaignId, "union", 3);
    world.meta.turn = 3;
    nationalMetricsPhase.run(world);

    expect(world.nationalMetrics.US?.["economy.workerSecurity"]?.value).toBeGreaterThan(50);
    expect(world.nationalMetrics.US?.["society.civicLife"]?.value).toBeGreaterThan(50);
    expect(world.corporations["US-manufacturing"]!.revenue).toBe(revenueBefore);
  });
});
