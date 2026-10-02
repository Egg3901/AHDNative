import { describe, expect, it } from "vitest";
import { assembleSourcePlantPnl, sourcePlantsUpkeep, sourceSectorLaborCost, sourceSectorLaborShare } from "./physicalPlantCosts.js";

describe("pinned source physical plant costs", () => {
  it("uses the source era/industry labor share and wage, union, agreement, and tech multipliers", () => {
    expect(sourceSectorLaborShare("energy", 1953)).toBe(0.15);
    // Source computeSectorLaborCost: min(800 gross maintenance, 150 labor slice)
    // × (1.2 wage × 0.9 tech × 1.12 union premium).
    expect(sourceSectorLaborCost({
      revenue: 1_000,
      marginPct: 20,
      type: "energy",
      year: 1953,
      wageLevel: 1.2,
      negotiatedWageFloor: 1.1,
      unionization: 80,
      techLaborCostMultiplier: 0.9,
    })).toBeCloseTo(181.44, 10);
  });

  it("prices owner-idle upkeep at the saved basis and fades it in over the source ramp", () => {
    const first = sourcePlantsUpkeep({
      mixPrice: 480,
      capacity: 1_000,
      producedUnits: 500,
      involuntaryThrottle: 1,
      effectiveMarginPct: 20,
      plantsStartTurn: 0,
      turn: 0,
      localPerAnchor: 1,
    });
    expect(first.cost).toBe(0);
    expect(first.marginBasis).toBeCloseTo(0.8, 10);
    const full = sourcePlantsUpkeep({
      mixPrice: 480,
      capacity: 1_000,
      producedUnits: 500,
      involuntaryThrottle: 1,
      effectiveMarginPct: 20,
      marginBasisAnchor: 0.3,
      plantsStartTurn: 0,
      turn: 240,
      localPerAnchor: 1,
    });
    expect(full.cost).toBe(151_200);
    const involuntarilyThrottled = sourcePlantsUpkeep({
      mixPrice: 480,
      capacity: 1_000,
      producedUnits: 500,
      involuntaryThrottle: 0.5,
      effectiveMarginPct: 20,
      marginBasisAnchor: 0.3,
      plantsStartTurn: 0,
      turn: 240,
      localPerAnchor: 1,
    });
    expect(involuntarilyThrottled.cost).toBe(0);
  });

  it("caps policy credits against the complete named bill and clamps residual credits", () => {
    const result = assembleSourcePlantPnl({
      revenue: 100, inputs: 10, labour: 20, upkeep: 3, compliance: 4,
      financialLegs: 2, growth: 5, otherOpex: -100, requestedPolicyCredit: 100,
    });
    expect(result.policyCredit).toBe(44);
    expect(result.otherOpex).toBe(0);
    expect(result.totalCost).toBe(0);
    expect(result.profit).toBe(100);
  });
});
