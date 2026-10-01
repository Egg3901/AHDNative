import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { projectSaveToV42, serializeSave, deserializeSave } from "../save.js";
import { createWorld } from "../world.js";
import { calcRdScoreAfterTurn, rdMoraleFactor, sourcePlannedTargetRate } from "./constants.js";
import { corporationTurnPhase, runCorporationTurn, runCorporateRdInnovations, updateNppCorporationFinancialPolicy } from "./corporationTurn.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import { makeRdInnovationRng, sha256FirstUint32BE } from "./rdInnovationRng.js";

describe("corporation R&D lifecycle", () => {
  it("matches immutable Game score, decay, and morale vectors", () => {
    // Executed from AHDGame 01797b27082b098fdf3929bb498215c94c8dda24:
    // calcRdScoreAfterTurn(20, 1_000_000) = 21.53219327276578;
    // calcRdScoreAfterTurn(101, 0) = 97.97; rdMoraleFactor(1.3) = 1.15.
    expect(calcRdScoreAfterTurn(20, 1_000_000)).toBeCloseTo(21.53219327276578, 12);
    expect(calcRdScoreAfterTurn(101, 0)).toBeCloseTo(97.97, 12);
    expect(rdMoraleFactor(1.3)).toBe(1.15);
    expect(rdMoraleFactor(0.5)).toBe(0.85);
  });

  it("matches Game's SHA-256 innovation stream exactly", () => {
    // Immutable Game makeSeededRng("rdInnovation:6") first six draws.
    const native = makeRdInnovationRng(6);
    expect(Array.from({ length: 6 }, () => native())).toEqual([
      0.4947167579084635,
      0.00630476581864059,
      0.07452788739465177,
      0.4786884211935103,
      0.05493778013624251,
      0.7508453095797449,
    ]);
    expect(sha256FirstUint32BE("abc")).toBe(0xba7816bf);
  });

  it("matches Game plan gravity and runs it in the corporation turn phase", () => {
    // Direct immutable Game 01797b2 sectorGrowthPolicy.ts vectors with
    // commandEconomyEnabled=true and 1953-era GDP trends: RU manufacturing
    // target 6 -> 6.02, RU agriculture 6 -> 5.98, DD defense 2 -> 2.02.
    expect(sourcePlannedTargetRate({ countryId: "RU", sectorType: "manufacturing", year: 1953, marketizationLevel: 10, currentTargetRate: 6 })).toBe(6.02);
    expect(sourcePlannedTargetRate({ countryId: "RU", sectorType: "agriculture", year: 1953, marketizationLevel: 10, currentTargetRate: 6 })).toBe(5.98);
    expect(sourcePlannedTargetRate({ countryId: "DD", sectorType: "defense", year: 1953, marketizationLevel: 10, currentTargetRate: 2 })).toBe(2.02);
    expect(sourcePlannedTargetRate({ countryId: "RU", sectorType: "manufacturing", year: 1953, marketizationLevel: 30, currentTargetRate: 6 })).toBeUndefined();

    const world = createWorld({ era: "1953", countryId: "RU", seed: "rd-plan-gravity", playerName: "Alex" });
    const corp = world.corporations["RU-manufacturing"]!;
    world.commandEconomy.RU!.marketizationLevel = 10;
    corp.targetGrowthRate = 6;
    corp.currentGrowthRate = 6;
    corp.profitMargin = -50;
    corp.effectiveProfitMargin = -50;
    corporationTurnPhase.run(world);
    expect(corp.targetGrowthRate).toBe(6.02);
  });

  it("charges only paid R&D within the source overhead ceiling and persists its score", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "rd-paid-budget", playerName: "Alex" });
    const corp = world.corporations["US-media"]!;
    corp.revenue = 100_000;
    corp.profitMargin = 20;
    corp.effectiveProfitMargin = 20;
    corp.currentGrowthRate = 0;
    corp.targetGrowthRate = 0;
    corp.liquidCapital = 0;
    corp.rdScore = 20;
    corp.rdBudgetPerTurn = 140_000;
    corp.ceoSalaryPerTurn = 20_000;

    runCorporationTurn(corp, 0, undefined, undefined, true, { localPerAnchor: 1, avgWageLevel: 1 });

    // Source overhead ceiling is 1.5x gross less requested CEO salary:
    // min(140,000, 150,000 - 20,000) = 130,000 local/week. Source rdScore
    // accepts a daily anchor budget, so the Native week converts by /7.
    // Independently executed Game calcRdScoreAfterTurn(20, 130_000 / 7)
    // returns 20.32560373977975; Game stores two decimal places.
    expect(corp.lastRdSpendPerTurn).toBe(130_000);
    expect(corp.liquidCapital).toBe(-110_000);
    expect(corp.rdScore).toBe(20.33);
    const restored = deserializeSave(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    expect(restored.corporations[corp.id]).toMatchObject({
      rdBudgetPerTurn: 140_000,
      lastRdSpendPerTurn: 130_000,
      rdScore: corp.rdScore,
    });
  });

  it("distinguishes a corporation with no R&D spend from one that funds it", () => {
    const withoutWorld = createWorld({ era: "1953", countryId: "US", seed: "rd-none", playerName: "Alex" });
    const withWorld = createWorld({ era: "1953", countryId: "US", seed: "rd-funded", playerName: "Alex" });
    const without = withoutWorld.corporations["US-media"]!;
    const withBudget = withWorld.corporations["US-media"]!;
    for (const corp of [without, withBudget]) {
      corp.revenue = 100_000;
      corp.profitMargin = 20;
      corp.effectiveProfitMargin = 20;
      corp.currentGrowthRate = 0;
      corp.targetGrowthRate = 0;
      corp.currentGrowthCost = 0;
      corp.liquidCapital = 100_000;
      corp.rdScore = 20;
    }
    withBudget.rdBudgetPerTurn = 7_000;

    runCorporationTurn(without, 0, undefined, undefined, true, { localPerAnchor: 1, avgWageLevel: 1 });
    runCorporationTurn(withBudget, 0, undefined, undefined, true, { localPerAnchor: 1, avgWageLevel: 1 });

    expect(without.lastRdSpendPerTurn).toBe(0);
    expect(without.rdScore).toBe(19.4);
    expect(without.liquidCapital).toBe(120_000);
    expect(withBudget.lastRdSpendPerTurn).toBe(7_000);
    expect(withBudget.rdScore).toBeGreaterThan(without.rdScore!);
    expect(withBudget.liquidCapital).toBe(113_000);
  });

  it("exposes the budget through the CEO action and refuses non-CEO or over-cap changes atomically", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "rd-ceo-command", playerName: "Alex" });
    const corp = world.corporations["US-media"]!;
    corp.revenue = 100_000;
    corp.ceoId = "player";
    corp.ceoType = "player";
    corp.ceoVacant = false;
    const accepted = executeAction(world, "player", "setCorporationCompensation", {
      corpId: corp.id, salaryPerTurn: 10_000, dividendRate: 12, rdBudgetPerTurn: 100_000,
    });
    expect(accepted.ok).toBe(true);
    expect(corp).toMatchObject({ ceoSalaryPerTurn: 10_000, dividendRate: 12, rdBudgetPerTurn: 100_000 });

    const before = { ...corp };
    const overCap = executeAction(world, "player", "setCorporationCompensation", {
      corpId: corp.id, salaryPerTurn: 10_000, dividendRate: 12, rdBudgetPerTurn: 150_001,
    });
    expect(overCap.ok).toBe(false);
    expect(corp).toEqual(before);

    corp.ceoVacant = true;
    const vacantBefore = { ...corp };
    const nonCeo = executeAction(world, "player", "setCorporationCompensation", {
      corpId: corp.id, salaryPerTurn: 0, dividendRate: 0, rdBudgetPerTurn: 0,
    });
    expect(nonCeo.ok).toBe(false);
    expect(corp).toEqual(vacantBefore);
  });

  it("uses NPP archetype budget and dividend rails, and suppresses discretionary outlay in cash distress", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "rd-npp-policy", playerName: "Alex" });
    const corp = world.corporations["US-media"]!;
    corp.revenue = 1_000_000;
    corp.effectiveProfitMargin = 30;
    corp.archetype = "innovator";
    corp.liquidCapital = 1_000_000;
    updateNppCorporationFinancialPolicy(corp, "2019", 1);
    expect(corp.rdBudgetPerTurn).toBe(40_000);
    expect(corp.dividendRate).toBe(5);

    corp.liquidCapital = 1;
    updateNppCorporationFinancialPolicy(corp, "2019", 1);
    expect(corp.rdBudgetPerTurn).toBe(0);
    expect(corp.dividendRate).toBe(0);
  });

  it("applies six-turn R&D breakthroughs to persisted plant stock within the source range", () => {
    const makeWorld = () => createWorld({ era: "1953", countryId: "US", seed: "rd-breakthrough", playerName: "Alex" });
    const world = makeWorld();
    world.meta.turn = 6;
    const corp = world.corporations["US-manufacturing"]!;
    corp.rdScore = 200;
    const asset = Object.values(corporateSectorAssets(world)).find((candidate) => candidate.corporationId === corp.id)!;
    const stockBefore = asset.capitalStock!;
    runCorporateRdInnovations(world);
    const gain = corp.lastRdCapacityGain ?? 0;
    const sourceDrawMagnitude = 0.07452788739465177;
    const sourceExpectedGain = Math.round(stockBefore * (0.02 + sourceDrawMagnitude * (0.1 - 0.02)) * 100) / 100;
    expect(gain).toBe(sourceExpectedGain);
    expect(gain).toBeGreaterThanOrEqual(stockBefore * 0.02);
    expect(gain).toBeLessThanOrEqual(stockBefore * 0.1);
    expect(asset.capitalStock).toBe(stockBefore + gain);
    const restored = deserializeSave(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    expect(restored.corporateSectors?.[asset.id]?.capitalStock).toBe(asset.capitalStock);
    expect(restored.corporations[corp.id]?.lastRdCapacityGain).toBe(gain);

    const replay = makeWorld();
    replay.meta.turn = 6;
    replay.corporations[corp.id]!.rdScore = 200;
    runCorporateRdInnovations(replay);
    expect(replay.corporateSectors?.[asset.id]?.capitalStock).toBe(asset.capitalStock);
  });

  it("keeps R&D and breakthrough growth off the legacy v42 projection", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "rd-v42-refuse", playerName: "Alex" });
    world.corporations["US-media"]!.rdScore = 1;
    const projection = projectSaveToV42(serializeSave(world, "2026-10-01T00:00:00.000Z"));
    expect(projection.ok).toBe(false);
    if (!projection.ok) expect(projection.error).toMatch(/R&D state that cannot be projected to schema 42/);
  });
});
