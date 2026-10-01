import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { nationalMetricsPhase } from "../metrics/nationalMetrics.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { openBargainingCampaignAction, answerBargainingCampaignAsEmployer } from "./actions.js";
import { labourNudgesForTurn } from "./labourRelationsTurn.js";

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
  return { world };
}

describe("#322 labor political feedback source boundary", () => {
  it("computes the dispute residual without inventing a national political baseline", () => {
    const { world } = disputeWorld();
    const revenueBefore = world.corporations["US-manufacturing"]!.revenue;

    expect(labourNudgesForTurn(world, world.meta.turn).get("US")?.get("economy.workerSecurity"))
      .toBeCloseTo(-0.75 * 0.9, 6);
    nationalMetricsPhase.run(world);

    expect(world.nationalMetrics.US?.["economy.workerSecurity"]).toBeUndefined();
    expect(world.nationalMetrics.US?.["society.civicLife"]).toBeUndefined();
    expect(world.corporations["US-manufacturing"]!.revenue).toBe(revenueBefore);

    expect(world.corporations["US-manufacturing"]!.revenue).toBe(revenueBefore);
  });
});
