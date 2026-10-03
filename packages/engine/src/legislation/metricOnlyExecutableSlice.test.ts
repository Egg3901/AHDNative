import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { getLaw, policyOptionIntensity } from "./catalog.js";
import { computeMetricTarget } from "../policyEffects/phases.js";

const CASES = [
  {
    id: "de_government_ethics",
    countryId: "DE",
    target: "governance.openness",
    targets: [
      { metricId: "governance.openness", weight: 1 },
      { metricId: "governance.integrity", weight: 0.4 },
      { metricId: "governance.participation", weight: 0.2 },
    ],
    sourceTargets: [51.046413989277035, 50.41856559571082, 50.20928279785541],
  },
  {
    id: "ie_electoral_reform",
    countryId: "IE",
    target: "governance.participation",
    targets: [
      { metricId: "governance.participation", weight: 0.6 },
      { metricId: "society.civicLife", weight: 0.5 },
      { metricId: "governance.integrity", weight: 0.4 },
      { metricId: "governance.openness", weight: 0.3 },
    ],
    sourceTargets: [50.62784839356622, 50.523206994638514, 50.41856559571082, 50.31392419678311],
  },
  {
    id: "ie_gender_equality",
    countryId: "IE",
    target: "society.womensOpportunity",
    targets: [
      { metricId: "society.womensOpportunity", weight: 1 },
      { metricId: "society.socialMobility", weight: 0.4 },
      { metricId: "society.civicLife", weight: 0.3 },
      { metricId: "society.integration", weight: 0.3 },
    ],
    sourceTargets: [51.046413989277035, 50.41856559571082, 50.31392419678311, 50.31392419678311],
  },
  {
    id: "ie_government_ethics",
    countryId: "IE",
    target: "governance.openness",
    targets: [
      { metricId: "governance.openness", weight: 1 },
      { metricId: "governance.integrity", weight: 0.5 },
      { metricId: "society.civicLife", weight: 0.3 },
    ],
    sourceTargets: [51.046413989277035, 50.523206994638514, 50.31392419678311],
  },
] as const;

describe("metric-only source law rows (#285)", () => {
  for (const row of CASES) {
    it(`${row.id} keeps source targets and option ladder through a public action, turn, and save`, () => {
      const world = createWorld({
        seed: `law-285-${row.id}`,
        playerName: "Policy Chair",
        countryId: row.countryId,
        era: "2019",
        mode: "hos",
      });
      world.nppAutonomyLevel = "off";
      world.player.actions = 100;
      world.player.nationalInfluence = 30;

      const law = getLaw(row.id);
      expect(law).toMatchObject({
        countryId: row.countryId,
        kind: "primary",
        status: "available",
        allowedScope: "national",
        baselineLevel: 3,
        optionEffectDirections: [1, 1, 1, 0, -1, -1, -1],
        targets: row.targets,
        levels: expect.arrayContaining([expect.objectContaining({ name: expect.any(String), description: expect.any(String) })]),
      });
      expect(law?.levels).toHaveLength(7);
      expect(policyOptionIntensity(law!, "l2", 1)).toBeCloseTo(1 / 3, 12);
      for (const [index, target] of row.targets.entries()) {
        const actual = computeMetricTarget(
          50,
          [{ effectDirection: 1, effectIntensity: 1 / 3, countryId: row.countryId, scope: "national", weight: target.weight }],
          true,
          { min: 0, max: 100 },
          1,
        );
        expect(actual, `${row.id}/${target.metricId} source policyEffects replay`).toBeCloseTo(row.sourceTargets[index]!, 10);
      }
      const before = world.nationalMetrics[row.countryId]?.[row.target]?.value;
      const result = executeAction(world, "player", "sponsorBill", {
        catalogId: row.id,
        policyOptionId: "l2",
      });
      expect(result.ok).toBe(true);
      const bill = world.bills.at(-1)!;
      expect(bill).toMatchObject({ countryId: row.countryId, status: "signed" });
      expect(bill.provisions[0]).toMatchObject({ legislationTypeId: row.id, policyOptionId: "l2", effectDirection: 1 });
      expect(world.policyLedger[bill.id]).toMatchObject({
        legislationTypeId: row.id,
        countryId: row.countryId,
        scope: "national",
        sourcePolicyOptionId: "l2",
      });

      const resumed = deserializeSave(serializeSave(world, "2019-01-06T00:00:00.000Z"));
      expect(resumed.policyLedger[bill.id]).toEqual(world.policyLedger[bill.id]);
      advanceTurn(world);
      advanceTurn(resumed);
      expect(resumed.nationalMetrics[row.countryId]?.[row.target])
        .toEqual(world.nationalMetrics[row.countryId]?.[row.target]);
      expect(world.nationalMetrics[row.countryId]?.[row.target]?.value).toBeDefined();
      expect(world.nationalMetrics[row.countryId]?.[row.target]?.value).not.toBe(before);
    });
  }
});
