import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { getLaw } from "./catalog.js";

const CASES = [
  {
    countryId: "RU",
    era: "1953",
    id: "ru.economy.stability.primary",
    title: "State Plan Discipline Act",
    target: "economy.stability",
    baselineLevel: 3,
    sourceDirection: 1,
    sourceCost: 0.0014,
    enactedCostDelta: 0.0007,
    budgetCategory: "other",
  },
  {
    countryId: "DD",
    era: "1953",
    id: "dd.economy.workerSecurity.primary",
    title: "Labour Code and Works Agreements Act",
    target: "economy.workerSecurity",
    baselineLevel: 3,
    sourceDirection: 1,
    sourceCost: 0.0021,
    enactedCostDelta: 0.0011,
    reformTitle: "Labour Code Liberalization Act",
    budgetCategory: "other",
  },
  {
    countryId: "US", era: "1953", id: "us.defense.diplomacy.primary",
    title: "Foreign Service and Negotiations Act", target: "defense.diplomacy",
    baselineLevel: 2, sourceDirection: 1, sourceCost: 0.0048,
    enactedCostDelta: 0.0042, budgetCategory: "defense",
  },
  {
    countryId: "US", era: "1953", id: "us.defense.armedForces.primary",
    title: "Armed Forces Establishment Act", target: "defense.armedForces",
    baselineLevel: 4, optionId: "l3", sourceDirection: 1, sourceCost: 0.0554,
    enactedCostDelta: -0.0202, budgetCategory: "defense",
  },
  {
    countryId: "US", era: "1953", id: "us.environment.conservation.primary",
    title: "Pollution Control Act", target: "environment.conservation",
    baselineLevel: 1, sourceDirection: 1, sourceCost: 0.0014,
    enactedCostDelta: 0.00182, budgetCategory: "other",
  },
  {
    countryId: "UK", era: "1953", id: "uk.defense.security.primary",
    title: "Security Services and Signals Act", target: "defense.security",
    baselineLevel: 2, sourceDirection: 1, sourceCost: 0.0073,
    enactedCostDelta: 0.0064, budgetCategory: "defense",
  },
] as const;

describe("RU/DD source-backed economy laws (#285)", () => {
  for (const law of CASES) {
    it(`${law.countryId} can enact and continue the source-authored policy level through a save`, () => {
      const world = createWorld({
        seed: `laws-285-${law.countryId}`,
        playerName: "Policy Chair",
        countryId: law.countryId,
        era: law.era,
        mode: "hos",
      });
      world.nppAutonomyLevel = "off";
      world.player.actions = 100;
      world.player.nationalInfluence = 30;
      expect(world.player.currentOffice).toMatchObject({ countryId: law.countryId });

      const catalog = getLaw(law.id);
      expect(catalog).toMatchObject({
        countryId: law.countryId,
        kind: "primary",
        title: law.title,
        status: "available",
        baselineLevel: law.baselineLevel,
        targets: [{ metricId: law.target, weight: 1 }],
      });
      if ("reformTitle" in law) expect(catalog?.reformTitle).toBe(law.reformTitle);
      expect(catalog?.levels?.[3]?.gdpCostFraction).toBe(law.sourceCost);

      const optionId = "optionId" in law ? law.optionId : "l4";
      const before = world.nationalMetrics[law.countryId]?.[law.target]?.value ?? 50;
      const result = executeAction(world, "player", "sponsorBill", {
        catalogId: law.id,
        policyOptionId: optionId,
      });
      expect(result.ok).toBe(true);
      const bill = world.bills.at(-1)!;
      expect(bill).toMatchObject({ countryId: law.countryId, status: "signed" });
      expect(bill.provisions[0]).toMatchObject({ policyOptionId: optionId, effectDirection: law.sourceDirection });
      expect(world.policyLedger[bill.id]).toMatchObject({
        legislationTypeId: law.id,
        countryId: law.countryId,
        scope: "national",
        sourcePolicyOptionId: optionId,
      });
      const budget = world.budgets[law.countryId]!;
      expect(budget.policySpendingByCategory?.[law.budgetCategory]).toBeCloseTo(
        budget.gdp * law.enactedCostDelta,
        5,
      );

      const saved = deserializeSave(serializeSave(world, "1953-01-06T00:00:00.000Z"));
      expect(saved.policyLedger[bill.id]).toEqual(world.policyLedger[bill.id]);
      advanceTurn(world);
      advanceTurn(saved);
      expect(saved.nationalMetrics[law.countryId]?.[law.target]?.value)
        .toBe(world.nationalMetrics[law.countryId]?.[law.target]?.value);
      expect(world.nationalMetrics[law.countryId]?.[law.target]?.value).not.toBe(before);
      expect(saved.bills.at(-1)?.status).toBe("signed");
    });
  }
});
