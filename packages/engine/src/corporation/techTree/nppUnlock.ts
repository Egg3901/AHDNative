import type { WorldState } from "../../types.js";
import type { Corporation } from "../types.js";
import { autoGrantedNodeIds, canUnlock, getTreeForType } from "./selectors.js";
import { sumStrengthGrants } from "./effects.js";
import { techNodeCashCost } from "./costs.js";
import { makeNppTechCashRecord } from "../corporateCashLedger.js";

/**
 * Run Game's deterministic NPP tech pick after this turn's production and
 * financial settlement. One node is purchased per eligible issuer per turn;
 * the newly persisted effect is consumed by the next production turn.
 */
export function unlockNppCorporationTech(
  world: WorldState,
  corp: Corporation,
  year: number,
  cashReserveLocal = 0,
  sourceDailyGrossRevenueLocal?: number,
): string | undefined {
  if (corp.suspended || corp.countryOwnerId || (corp.ceoType ?? "npp") !== "npp") return undefined;
  const rdScore = Number.isFinite(corp.rdScore) ? Math.max(0, corp.rdScore ?? 0) : 0;
  const reserve = Number.isFinite(cashReserveLocal) ? Math.max(0, cashReserveLocal) : 0;
  const cashAvailable = Number.isFinite(corp.liquidCapital) ? Math.max(0, corp.liquidCapital - reserve) : 0;
  const dailyGrossRevenueLocal = Number.isFinite(sourceDailyGrossRevenueLocal)
    ? Math.max(0, sourceDailyGrossRevenueLocal!)
    : Number.isFinite(corp.revenue) ? Math.max(0, corp.revenue / 7) : 0;
  const candidates = getTreeForType(corp.sectorType)
    .map((node) => ({ node, cashCost: techNodeCashCost(node, dailyGrossRevenueLocal) }))
    .filter(({ node, cashCost }) => canUnlock({
      type: corp.sectorType,
      unlockedTechNodeIds: corp.unlockedTechNodeIds,
      techDecadeLane: corp.techDecadeLane,
    }, node.id, year, { rdScore, cashAvailable, cashCost }).ok)
    .sort((a, b) => a.node.lane === b.node.lane
      ? b.node.cost - a.node.cost || a.node.slot - b.node.slot
      : a.node.lane === "sector" ? -1 : 1);
  const pick = candidates[0];
  if (!pick) return undefined;

  const { node, cashCost } = pick;
  const grants = sumStrengthGrants(node.effects);
  const unlocked = new Set(corp.unlockedTechNodeIds ?? []);
  unlocked.add(node.id);
  corp.unlockedTechNodeIds = [...unlocked].sort();
  corp.rdScore = Math.round((rdScore - node.cost) * 100) / 100;
  corp.liquidCapital -= cashCost;
  const cashRecord = makeNppTechCashRecord({ corp, world, node, cashCost });
  if (cashRecord) {
    const ledger = world.corporateCashLedger ??= [];
    // The source writer's once-only node guard and finance row share the same
    // successful cash mutation. Preserve that invariant in Native's in-memory
    // turn transaction and stable save continuation.
    if (!ledger.some((row) => row.id === cashRecord.id)) ledger.push(cashRecord);
  }
  corp.marketingStrength = (corp.marketingStrength ?? 0) + grants.marketingStrength;
  corp.logisticsStrength = (corp.logisticsStrength ?? 0) + grants.logisticsStrength;
  const lanes = { ...(corp.techDecadeLane ?? {}) };
  if (lanes[node.decadeId] === undefined) {
    lanes[node.decadeId] = node.lane;
    corp.techDecadeLane = lanes;
    corp.techDecadeChosenTurn = { ...(corp.techDecadeChosenTurn ?? {}), [node.decadeId]: world.meta.turn };
  }
  return node.id;
}

/** Passed decades' ordinary nodes are the source free baseline at founding. */
export function foundingTechState(sectorType: Corporation["sectorType"], year: number) {
  return { unlockedTechNodeIds: autoGrantedNodeIds(sectorType, year) };
}
