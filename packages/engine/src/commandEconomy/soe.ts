import type { CorporationType, SoeState } from "../corporation/types.js";

/** Source constants/economy/soe.ts. */
export const SOE_PERF_BASELINE = 1;
export const SOE_CAPACITY_HEADROOM = 1.1;
export const MAX_PLAN_FULFILLMENT = 2;
export const CREDIT_INTENSITY = 0.15;
export const CAPACITY_PER_CREDIT = 1;
export const OUTPUT_PER_CREDIT = 0.5;
export const CREDIT_ALLOCATION_FLOOR = 0.15;
export const TURNS_PER_YEAR = 48;

const clamp = (value: number, min: number, max: number) =>
  !Number.isFinite(value) ? min : Math.min(max, Math.max(min, value));

/** Source `makeSeedSoeState`: starts on-plan with 10% capacity headroom. */
export function makeSeedSoeState(sector: CorporationType, revenue: number): SoeState {
  const target = Number.isFinite(revenue) && revenue > 0 ? revenue : 0;
  return {
    sector,
    capacity: Math.round(target * SOE_CAPACITY_HEADROOM),
    output: target,
    planTarget: target,
    efficiency: 1,
    cumulativeLosses: 0,
    directorId: null,
  };
}

/** Source makeAdoptedSoeState: attach a new plan to actual operating sectors. */
export function makeAdoptedSoeState(sector: CorporationType, sectors: ReadonlyArray<{ revenue?: number | null; realizedRevenue?: number | null; capitalStock?: number | null }>): SoeState {
  let capacityValue = 0;
  let realized = 0;
  for (const asset of sectors) {
    const nominal = typeof asset.revenue === "number" && Number.isFinite(asset.revenue) ? asset.revenue : 0;
    const stock = typeof asset.capitalStock === "number" && Number.isFinite(asset.capitalStock) ? asset.capitalStock : 0;
    if (stock > 0) capacityValue += stock * (nominal / stock);
    realized += typeof asset.realizedRevenue === "number" && Number.isFinite(asset.realizedRevenue) ? asset.realizedRevenue : nominal;
  }
  const output = Math.round(realized > 0 ? realized : 0);
  return { sector, capacity: capacityValue > 0 ? Math.round(capacityValue) : Math.round(output * SOE_CAPACITY_HEADROOM), output, planTarget: output, efficiency: 1, cumulativeLosses: 0, directorId: null };
}

/** Source `planFulfillment`: bounded output/target score; no target means neutral. */
export function planFulfillment(soe: Pick<SoeState, "output" | "planTarget">): number {
  if (!Number.isFinite(soe.planTarget) || soe.planTarget <= 0) return SOE_PERF_BASELINE;
  return clamp((Number.isFinite(soe.output) ? soe.output : 0) / soe.planTarget, 0, MAX_PLAN_FULFILLMENT);
}

/** Source aggregatePlanFulfillment: goods-availability signal after credit. */
export function aggregatePlanFulfillment(
  soes: ReadonlyArray<Pick<SoeState, "output" | "planTarget">>,
): number {
  return soes.length ? soes.reduce((sum, soe) => sum + planFulfillment(soe), 0) / soes.length : SOE_PERF_BASELINE;
}

/** Source `directedCreditBudget`: annual programme spread over 48 turns. */
export function directedCreditBudget(aggregatePlanTarget: number, aggressiveness: number): number {
  const target = Number.isFinite(aggregatePlanTarget) && aggregatePlanTarget > 0 ? aggregatePlanTarget : 0;
  return (CREDIT_INTENSITY * clamp(aggressiveness, 0, 1) * target) / TURNS_PER_YEAR;
}

/** Source `resolveCreditAllocation`: explicit sector weights or under-plan weights. */
export function resolveCreditAllocation(
  soes: ReadonlyArray<Pick<SoeState, "sector" | "output" | "planTarget">>,
  totalCredit: number,
  sectorCredit?: Record<string, number> | null,
): Map<CorporationType, number> {
  const credit = Number.isFinite(totalCredit) && totalCredit > 0 ? totalCredit : 0;
  const allocations = new Map<CorporationType, number>();
  if (!soes.length || credit === 0) {
    for (const soe of soes) allocations.set(soe.sector, 0);
    return allocations;
  }
  if (sectorCredit && Object.keys(sectorCredit).length) {
    const weights = soes.map((soe) => {
      const weight = sectorCredit[soe.sector];
      return Number.isFinite(weight) && weight > 0 ? weight : 0;
    });
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    soes.forEach((soe, index) => allocations.set(soe.sector, totalWeight > 0 ? credit * weights[index]! / totalWeight : 0));
    return allocations;
  }
  const weights = soes.map((soe) => {
    const target = Number.isFinite(soe.planTarget) && soe.planTarget > 0 ? soe.planTarget : 0;
    const shortfall = Math.max(0, SOE_PERF_BASELINE - planFulfillment(soe));
    return Math.max(0, target * (CREDIT_ALLOCATION_FLOOR + shortfall));
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  soes.forEach((soe, index) => allocations.set(soe.sector, credit * (totalWeight > 0 ? weights[index]! / totalWeight : 1 / soes.length)));
  return allocations;
}

/** Source `applyDirectedCreditToSoe` before the plants tier: capacity plus half-credit output. */
export function applyDirectedCreditToSoe(soe: SoeState, amount: number): SoeState {
  const credit = Number.isFinite(amount) && amount > 0 ? amount : 0;
  if (credit === 0) return soe;
  const capacity = Math.max(0, (Number.isFinite(soe.capacity) ? soe.capacity : 0) + credit * CAPACITY_PER_CREDIT);
  const output = clamp((Number.isFinite(soe.output) ? soe.output : 0) + credit * OUTPUT_PER_CREDIT, 0, capacity);
  return { ...soe, capacity: Math.round(capacity), output: Math.round(output) };
}

/** Source `capacityUtilisation`: physical output/capacity drives marketization, not writable plan targets. */
export function capacityUtilisation(soe: Pick<SoeState, "output" | "capacity">): number {
  if (!Number.isFinite(soe.capacity) || soe.capacity <= 0) return SOE_PERF_BASELINE;
  return clamp((Number.isFinite(soe.output) ? soe.output : 0) / soe.capacity, 0, MAX_PLAN_FULFILLMENT);
}

export function aggregateCapacityUtilisation(soes: ReadonlyArray<Pick<SoeState, "output" | "capacity">>): number {
  return soes.length ? soes.reduce((sum, soe) => sum + capacityUtilisation(soe), 0) / soes.length : SOE_PERF_BASELINE;
}
