/**
 * Source plant labor and idle-capacity upkeep calculations, ported from the
 * pinned AHDGame laborCost.ts and sectorTurn/idleUpkeep.ts component chains.
 * Inputs/outputs here are Native local currency per seven-day turn.
 */
import type { CorporationType } from "./types.js";
import type { WorldState } from "../types.js";
import { softCapEffectiveMargin } from "./constants.js";

const LABOR_INTENSITY: Readonly<Record<CorporationType, number>> = {
  technology: 0.3, healthcare: 0.3, media: 0.28, entertainment: 0.28,
  construction: 0.28, financial: 0.25, defense: 0.24, retail: 0.22,
  telecommunications: 0.2, manufacturing: 0.18, logistics: 0.18,
  agriculture: 0.16, automobiles: 0.16, chemical_industries: 0.15,
  energy: 0.12, extraction: 0.12, real_estate: 0.1,
};

/** Exact source sectorIntensity × eraLaborMultiplier table. */
export function sourceSectorLaborShare(type: CorporationType, year: number): number {
  const era = year >= 2007 ? 1 : year >= 1991 ? 1.1 : year >= 1953 ? 1.25 : 1.35;
  return (LABOR_INTENSITY[type] ?? 0.2) * era;
}

/** Source computeSectorLaborCost + sectorLabour.ts wage multiplier. */
export function sourceSectorLaborCost(input: {
  revenue: number;
  marginPct: number;
  type: CorporationType;
  year: number;
  wageLevel: number;
  negotiatedWageFloor?: number;
  unionization: number;
  techLaborCostMultiplier: number;
}): number {
  const grossMaintenance = input.revenue * (1 - input.marginPct / 100);
  const baseline = Math.max(0, Math.min(grossMaintenance, sourceSectorLaborShare(input.type, input.year) * input.revenue));
  const wage = Number.isFinite(input.wageLevel) ? Math.max(0.8, Math.min(1.5, input.wageLevel)) : 1;
  const agreementFloor = Number.isFinite(input.negotiatedWageFloor)
    ? Math.max(0.8, Math.min(1.5, input.negotiatedWageFloor!))
    : 0.8;
  const density = Number.isFinite(input.unionization) ? Math.max(0, Math.min(100, input.unionization)) : 0;
  const laborTech = Number.isFinite(input.techLaborCostMultiplier)
    ? Math.max(0.7, Math.min(1, input.techLaborCostMultiplier))
    : 1;
  const multiplier = Math.max(wage, agreementFloor) * laborTech * (1 + (density / 100) * 0.15);
  return baseline * multiplier;
}

/** Active source crisis decay penalties, expanded by Native's authored scope. */
export function sourceCrisisMarginPenalty(world: Pick<WorldState, "crises">, countryId: string, turn: number): number {
  let penalty = 0;
  for (const crisis of world.crises ?? []) {
    if (crisis.status !== "active" || crisis.durationTurns == null || crisis.durationTurns <= 0) continue;
    if (crisis.scope !== "global" && !crisis.countryIds.includes(countryId)) continue;
    const remaining = crisis.startTurn + crisis.durationTurns - turn;
    if (remaining <= 0) continue;
    for (const effect of crisis.effects) {
      if (effect.type !== "profitMargin" || effect.effectType !== "decay") continue;
      penalty += effect.value * (Math.min(remaining, crisis.durationTurns) / crisis.durationTurns);
    }
  }
  return Number.isFinite(penalty) ? penalty : 0;
}

/** Source computeFinancialLegs: only negative disaster margin points become cash cost. */
export function sourcePlantFinancialLeg(revenue: number, disasterMarginPenaltyPp: number): number {
  if (!Number.isFinite(revenue) || revenue <= 0 || !Number.isFinite(disasterMarginPenaltyPp) || disasterMarginPenaltyPp >= 0) return 0;
  return revenue * (-disasterMarginPenaltyPp / 100);
}

/** Source sectorCosts policy credit, based on this asset's base margin. */
export function sourcePlantPolicyCredit(revenue: number, baseMarginPct: number, modifierPp: number): number {
  if (!Number.isFinite(revenue) || !Number.isFinite(baseMarginPct) || !Number.isFinite(modifierPp)) return 0;
  return revenue * (softCapEffectiveMargin(baseMarginPct + modifierPp) - softCapEffectiveMargin(baseMarginPct)) / 100;
}

/** Game sectorCosts dominance compliance line, based on source revenue shares. */
export function sourceDominanceComplianceRate(input: {
  localSharePct: number;
  nationalSharePct: number;
  dominanceShield: number;
  plantsRampLambda: number;
  stateOwned: boolean;
}): number {
  if (input.stateOwned) return 0;
  const additive = (share: number, threshold: number) => {
    const bounded = Number.isFinite(share) ? Math.max(0, Math.min(100, share)) : 0;
    if (bounded <= threshold) return 0;
    return 0.05 * ((bounded - threshold) / (100 - threshold));
  };
  const ramp = Number.isFinite(input.plantsRampLambda) ? Math.max(0, Math.min(1, input.plantsRampLambda)) : 0;
  const shield = Number.isFinite(input.dominanceShield) ? Math.max(0, Math.min(0.6, input.dominanceShield)) : 0;
  return Math.max(additive(input.localSharePct, 50), additive(input.nationalSharePct, 30)) * (1 - shield) * (1 - ramp);
}

/** Source ownerIdleUnits: exclude known involuntary output throttles. */
export function sourceOwnerIdleUnits(capacity: number, producedUnits: number, involuntaryThrottle: number): number {
  if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(involuntaryThrottle) || involuntaryThrottle <= 0) return 0;
  const throttle = Math.min(1, involuntaryThrottle);
  const produced = Number.isFinite(producedUnits) ? Math.max(0, producedUnits) : 0;
  return Math.max(0, capacity - Math.min(capacity, produced / throttle));
}

/** Source capacityUpkeepUnits with full active capacity and source ramp. */
export function sourcePlantsUpkeep(input: {
  mixPrice: number;
  capacity: number;
  producedUnits: number;
  involuntaryThrottle: number;
  effectiveMarginPct: number;
  marginBasisAnchor?: number;
  plantsStartTurn: number;
  turn: number;
  localPerAnchor: number;
}): { cost: number; marginBasis: number; ramp: number } {
  const marginBasis = Math.max(0, 1 - input.effectiveMarginPct / 100);
  const rawBasis = Number.isFinite(input.marginBasisAnchor) ? input.marginBasisAnchor! : marginBasis;
  const anchoredBasis = Math.max(0, Math.min(0.65, rawBasis)); // 1 − 35% default sector margin
  const ramp = Math.max(0, Math.min(1, (input.turn - input.plantsStartTurn) / 240));
  const ownerIdle = sourceOwnerIdleUnits(input.capacity, input.producedUnits, input.involuntaryThrottle);
  // Game unit price is mixPrice / source turns-per-day (4). Native values are
  // per day, so convert the source hourly bill back to daily, then to its week.
  const cost = (input.mixPrice / 4) * anchoredBasis * ownerIdle * 0.3 * ramp * 4 * 7 * input.localPerAnchor;
  return { cost: Number.isFinite(cost) ? Math.max(0, cost) : 0, marginBasis, ramp };
}

/** Source assemblePhysicalPnl policy-credit and negative-otherOpex bounds. */
export function assembleSourcePlantPnl(input: {
  revenue: number;
  inputs: number;
  labour: number;
  upkeep: number;
  compliance: number;
  financialLegs: number;
  growth: number;
  otherOpex: number;
  requestedPolicyCredit: number;
}) {
  const billsForCredit = input.inputs + input.labour + input.financialLegs
    + Math.max(0, input.otherOpex) + input.upkeep + input.compliance + input.growth;
  const policyCredit = input.requestedPolicyCredit > 0
    ? Math.min(input.requestedPolicyCredit, Math.max(0, billsForCredit))
    : input.requestedPolicyCredit;
  const namedBills = Math.max(0, input.inputs) + Math.max(0, input.labour)
    + Math.max(0, input.financialLegs) + Math.max(0, input.upkeep)
    + Math.max(0, input.compliance) + Math.max(0, input.growth)
    - Math.max(0, policyCredit);
  const boundedOtherOpex = input.otherOpex < 0
    ? Math.max(input.otherOpex, -(namedBills > 0 ? namedBills : 0))
    : input.otherOpex;
  const otherOpex = Object.is(boundedOtherOpex, -0) ? 0 : boundedOtherOpex;
  const operatingCost = input.inputs + input.labour + otherOpex + input.financialLegs - policyCredit;
  const totalCost = operatingCost + input.upkeep + input.compliance + input.growth;
  return {
    otherOpex,
    otherOpexUncapped: input.otherOpex,
    otherOpexCreditCapped: otherOpex !== input.otherOpex,
    policyCredit,
    operatingCost,
    totalCost,
    profit: input.revenue - totalCost,
  };
}
