import { describe, expect, it } from "vitest";
import { advanceNppStrategy, strategyLevers, validateNppStrategyState, type StrategySituation } from "./nppCorpStrategy.js";
import { advanceNppCorporationStrategies } from "./nppStrategyTurn.js";
import { sourceCorporateStrategyStaggerEligible } from "./strategyRetooling.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { corporationTurnPhase, updateNppCorporationFinancialPolicy } from "./corporationTurn.js";
import { CEO_ARCHETYPE_MODIFIERS } from "./constants.js";
import { rngFromSeed } from "../rng.js";

const healthy: StrategySituation = {
  score: 18, debtDominant: false, chronicLowFill: false, hasHeadroom: true, isCaretaker: false,
};

describe("source NPP corporation strategy", () => {
  it("starts neutral on expand and only switches after its full capacity tenure", () => {
    const first = advanceNppStrategy({ prior: undefined, turn: 3, situation: { ...healthy, chronicLowFill: true }, eligible: true });
    expect(first).toEqual({ state: { id: "expand", adoptedTurn: 3, baselineScore: 18, scores: undefined }, changed: false });
    const beforeTenure = advanceNppStrategy({ prior: first.state, turn: 50, situation: { ...healthy, score: -1 }, eligible: true });
    expect(beforeTenure.state.id).toBe("expand");
    expect(beforeTenure.state.lastScore).toBe(-1);
    const afterTenure = advanceNppStrategy({ prior: beforeTenure.state, turn: 51, situation: { ...healthy, score: -1 }, eligible: true });
    expect(afterTenure).toMatchObject({ changed: true, state: { id: "retrench", adoptedTurn: 51, baselineScore: -1 } });
    expect(afterTenure.state.scores?.expand).toBe(-1);
  });

  it("keeps a strategy whose score still clears its adoption baseline", () => {
    const held = advanceNppStrategy({
      prior: { id: "harvest", adoptedTurn: 10, baselineScore: 12 },
      turn: 18,
      situation: { ...healthy, score: 12.5 },
      eligible: true,
    });
    expect(held).toMatchObject({ changed: false, state: { id: "harvest", adoptedTurn: 18, baselineScore: 12, lastScore: 12.5 } });
  });

  it("uses source caretaker exclusions and levers", () => {
    const caretaker = advanceNppStrategy({
      prior: { id: "pivot", adoptedTurn: 1, baselineScore: 0 },
      turn: 9,
      situation: { ...healthy, isCaretaker: true },
      eligible: true,
    });
    expect(caretaker).toMatchObject({ changed: true, state: { id: "harvest" } });
    expect(strategyLevers("retrench")).toMatchObject({ allowExpansion: false, allowGrowthCapex: false, dividendMult: 0, rdMult: 0 });
    expect(strategyLevers("pivot")).toMatchObject({ allowExpansion: true, allowGrowthCapex: true, dividendMult: 0, rdMult: 0.5 });
  });

  it("validates persisted strategy memory without fabricating absent state", () => {
    expect(() => validateNppStrategyState(undefined)).not.toThrow();
    expect(() => validateNppStrategyState({ id: "expand", adoptedTurn: 4, baselineScore: 12, scores: { expand: 14 } })).not.toThrow();
    expect(() => validateNppStrategyState({ id: "mystery", adoptedTurn: 4, baselineScore: 12 })).toThrow(/Invalid NPP corporation strategy state/);
    expect(() => validateNppStrategyState({ id: "expand", adoptedTurn: 4, baselineScore: 12, scores: { unknown: 14 } })).toThrow(/score entry/);
  });

  it("writes the NPP decision and continues the saved strategy deterministically", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-strategy-turn-save", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    const eligibleTurn = [1, 2, 3, 4, 5, 6, 7, 8].find((turn) => sourceCorporateStrategyStaggerEligible(corp.id, turn))!;
    world.meta.turn = eligibleTurn;
    corp.effectiveProfitMargin = 25;
    advanceNppCorporationStrategies(world, corp.id);
    expect(corp.nppStrategy).toMatchObject({ id: "expand", adoptedTurn: eligibleTurn });

    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(resumed.corporations[corp.id]?.nppStrategy).toEqual(corp.nppStrategy);
    world.meta.turn += 48;
    resumed.meta.turn += 48;
    corp.effectiveProfitMargin = -5;
    resumed.corporations[corp.id]!.effectiveProfitMargin = -5;
    for (const asset of Object.values(world.corporateSectors ?? {}).filter((row) => row.corporationId === corp.id)) {
      asset.effectiveProfitMargin = -5;
    }
    for (const asset of Object.values(resumed.corporateSectors ?? {}).filter((row) => row.corporationId === corp.id)) {
      asset.effectiveProfitMargin = -5;
      if (asset.plantsPnl) asset.plantsPnl.profit = -Math.max(1, asset.plantsPnl.revenue);
    }
    for (const asset of Object.values(world.corporateSectors ?? {}).filter((row) => row.corporationId === corp.id)) {
      if (asset.plantsPnl) asset.plantsPnl.profit = -Math.max(1, asset.plantsPnl.revenue);
    }
    advanceNppCorporationStrategies(world, corp.id);
    advanceNppCorporationStrategies(resumed, corp.id);
    expect(resumed.corporations[corp.id]?.nppStrategy).toEqual(corp.nppStrategy);
    expect(["expand", "harvest", "defend", "retrench", "pivot"]).toContain(corp.nppStrategy?.id);
  });

  it("consumes the saved harvest policy in R&D and dividend targets", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-strategy-financial-consumer", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    corp.revenue = 1_000_000_000;
    corp.effectiveProfitMargin = 40;
    corp.lastCeoSalaryPaid = 0;
    corp.lastRdSpendPerTurn = 0;
    corp.liquidCapital = 1_000_000_000;
    updateNppCorporationFinancialPolicy(corp, world.meta.era, 1);
    const expandRd = corp.rdBudgetPerTurn!;
    corp.nppStrategy = { id: "harvest", adoptedTurn: world.meta.turn, baselineScore: 0 };
    updateNppCorporationFinancialPolicy(corp, world.meta.era, 1);
    expect(corp.rdBudgetPerTurn).toBeCloseTo(expandRd * 0.25, 0);
    expect(corp.dividendRate).toBe(Math.min(25, Math.round(8 * CEO_ARCHETYPE_MODIFIERS[corp.archetype].dividendMult * 1.5)));
  });

  it("writes NPP strategy through the public corporation turn and resumes the next turn", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "npp-strategy-public-turn", playerName: "Alex" });
    const corp = world.corporations["US-manufacturing"]!;
    const eligibleTurn = [1, 2, 3, 4, 5, 6, 7, 8].find((turn) => sourceCorporateStrategyStaggerEligible(corp.id, turn))!;
    world.meta.turn = eligibleTurn;
    corporationTurnPhase.run(world, rngFromSeed("npp-strategy-public-turn"));
    expect(corp.nppStrategy).toBeDefined();

    const resumed = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    world.meta.turn += 1;
    resumed.meta.turn += 1;
    corporationTurnPhase.run(world, rngFromSeed("npp-strategy-continuation"));
    corporationTurnPhase.run(resumed, rngFromSeed("npp-strategy-continuation"));
    expect(resumed.corporations[corp.id]?.nppStrategy).toEqual(corp.nppStrategy);
    expect(resumed.corporateCashLedger).toEqual(world.corporateCashLedger);
    expect(resumed.corporateSectors).toEqual(world.corporateSectors);
  });
});
