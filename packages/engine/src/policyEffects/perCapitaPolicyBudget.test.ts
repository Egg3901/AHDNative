import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { regionalPolicySpendingDelta, rebuildPolicyBudgets } from "./budget.js";
import { jpRegions2019 } from "../../../content/src/packs/jpRegions2019.js";

describe("source per-capita policy cost consumers", () => {
  it("keeps year-aware national none-class options budget neutral through save continuation", () => {
    const world = createWorld({ seed: "jp-cost-none", playerName: "Chair", countryId: "US", era: "2019", mode: "hos" });
    const budget = world.budgets.JP;
    expect(budget).toBeDefined();
    const before = budget!.spending.total;
    world.policyLedger["fixture-jp-constitutional"] = {
      id: "fixture-jp-constitutional", legislationTypeId: "jp_constitutional_reform",
      policyOptionId: "jp_constitutional_reform_opt_0", sourcePolicyOptionId: "jp_constitutional_reform_opt_0",
      effectDirection: 1, scope: "national", countryId: "JP", enactedTurn: 0, enactedAt: world.meta.date,
    };
    rebuildPolicyBudgets(world);
    expect(budget!.spending.total).toBe(before);

    const resumed = deserializeSave(serializeSave(world, "2019-01-06T00:00:00.000Z"));
    advanceTurn(world);
    advanceTurn(resumed);
    expect(resumed.budgets.JP?.spending).toEqual(world.budgets.JP?.spending);
    expect(resumed.policyLedger).toEqual(world.policyLedger);
    expect(world.budgets.JP?.spending.total).toBe(before);
  });

  it("prices regional governance per actual regional population and re-derives after reload", () => {
    const world = createWorld({ seed: "jp-regional-cost", playerName: "Chair", countryId: "US", era: "2019", mode: "hos" });
    // JP is an economy-only country in this pack, so its source-authored 2019
    // region is explicitly supplied to the consumer fixture; this is not a
    // claim that a player can start a JP world in Native.
    const jpSeed = jpRegions2019[0]!;
    const region = { ...jpSeed, id: jpSeed.id, countryId: "JP" } as typeof world.regions[string];
    world.regions[region.id] = region;
    const population = region!.population ?? 0;
    expect(regionalPolicySpendingDelta(world, region!.id)).toBe(0);
    const expected = 8_000 * population;
    world.policyLedger["fixture-jp-regional"] = {
      id: "fixture-jp-regional", legislationTypeId: "jp_regional_governance",
      policyOptionId: "jp_regional_governance_opt_0", sourcePolicyOptionId: "jp_regional_governance_opt_0",
      effectDirection: 1, scope: "regional", regionId: region!.id, countryId: "JP", enactedTurn: 0, enactedAt: world.meta.date,
    };
    expect(regionalPolicySpendingDelta(world, region!.id)).toBeCloseTo(expected, 0);
    const resumed = deserializeSave(serializeSave(world, "2019-01-06T00:00:00.000Z"));
    expect(regionalPolicySpendingDelta(resumed, region!.id)).toBeCloseTo(expected, 0);
    expect(resumed.policyLedger["fixture-jp-regional"]).toEqual(world.policyLedger["fixture-jp-regional"]);

    resumed.policyLedger["fixture-jp-regional"].repealedAtTurn = resumed.meta.turn;
    expect(regionalPolicySpendingDelta(resumed, region!.id)).toBe(0);
    resumed.policyLedger["fixture-jp-regional-replacement"] = {
      id: "fixture-jp-regional-replacement", legislationTypeId: "jp_regional_governance",
      policyOptionId: "jp_regional_governance_opt_6", sourcePolicyOptionId: "jp_regional_governance_opt_6",
      effectDirection: -1, scope: "regional", regionId: region!.id, countryId: "JP", enactedTurn: resumed.meta.turn, enactedAt: resumed.meta.date,
    };
    expect(regionalPolicySpendingDelta(resumed, region!.id)).toBe(0);
  });
});
