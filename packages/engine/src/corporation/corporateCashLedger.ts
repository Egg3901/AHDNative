import type { WorldState } from "../types.js";
import type { Corporation } from "./types.js";

/** Source financialTxLog row for a successful NPP technology cash write. */
export interface CorporateCashLedgerRecord {
  id: string;
  type: "corp_tech_unlock" | "corp_capacity_build" | "corp_sector_founding";
  turn: number;
  corporationId: string;
  corporationName: string;
  /** Signed native-currency cash delta. A technology purchase is negative. */
  amount: number;
  currencyCode: string;
  meta: {
    ledgerKey: string;
    nodeId?: string;
    nodeName?: string;
    decadeId?: string;
    lane?: string;
    slot?: number;
    rdCost?: number;
    sectorId?: string;
    sectorType?: string;
    units?: number;
    costAnchor?: number;
    onlineTurn?: number;
    entryFeeAnchor?: number;
    fxSpreadAnchor?: number;
  };
}

export function makeNppCapacityCashRecord(input: {
  corp: Corporation;
  world: WorldState;
  sector: { id: string; sectorType: string };
  units: number;
  costLocal: number;
  cashDeltaLocal?: number;
  costAnchor: number;
  onlineTurn: number;
}): CorporateCashLedgerRecord | undefined {
  if (!(Number.isFinite(input.costLocal) && input.costLocal > 0 && Number.isFinite(input.costAnchor) && input.costAnchor > 0 && input.units > 0)) return undefined;
  const turn = input.world.meta.turn;
  const id = `capacity-build:${input.corp.id}:${input.sector.id}:t${turn}`;
  return {
    id, type: "corp_capacity_build", turn, corporationId: input.corp.id,
    corporationName: input.corp.name || "Corporation", amount: input.cashDeltaLocal ?? -input.costLocal,
    currencyCode: input.world.budgets?.[input.corp.countryId]?.currencyCode ?? "USD",
    meta: { ledgerKey: id, sectorId: input.sector.id, sectorType: input.sector.sectorType, units: input.units, costAnchor: input.costAnchor, onlineTurn: input.onlineTurn },
  };
}

/** Cash witness for a source-shaped greenfield NPP entry already applied. */
export function makeNppFoundingCashRecord(input: {
  corp: Corporation;
  world: WorldState;
  sector: { id: string; sectorType: string };
  units: number;
  costLocal: number;
  cashDeltaLocal: number;
  costAnchor: number;
  entryFeeAnchor: number;
  fxSpreadAnchor?: number;
  onlineTurn: number;
}): CorporateCashLedgerRecord | undefined {
  if (!(input.costLocal > 0 && Number.isFinite(input.costLocal) && input.costAnchor > 0 && Number.isFinite(input.costAnchor) && input.units > 0)) return undefined;
  const turn = input.world.meta.turn;
  const id = `sector-founding:${input.corp.id}:${input.sector.id}:t${turn}`;
  return {
    id, type: "corp_sector_founding", turn, corporationId: input.corp.id,
    corporationName: input.corp.name || "Corporation", amount: input.cashDeltaLocal,
    currencyCode: input.world.budgets?.[input.corp.countryId]?.currencyCode ?? "USD",
    meta: { ledgerKey: id, sectorId: input.sector.id, sectorType: input.sector.sectorType, units: input.units, costAnchor: input.costAnchor, entryFeeAnchor: input.entryFeeAnchor, ...(input.fxSpreadAnchor !== undefined ? { fxSpreadAnchor: input.fxSpreadAnchor } : {}), onlineTurn: input.onlineTurn },
  };
}

export function corporateTechUnlockLedgerKey(corporationId: string, nodeId: string, turn: number): string {
  return `tech-unlock:${corporationId}:${nodeId}:t${turn}`;
}

/** Build the source-shaped finance row for a cash debit already applied. */
export function makeNppTechCashRecord(input: {
  corp: Corporation;
  world: WorldState;
  node: { id: string; name: string; decadeId: string; lane: string; slot: number; cost: number };
  cashCost: number;
}): CorporateCashLedgerRecord | undefined {
  if (!(Number.isFinite(input.cashCost) && input.cashCost > 0)) return undefined;
  const turn = input.world.meta.turn;
  const id = corporateTechUnlockLedgerKey(input.corp.id, input.node.id, turn);
  return {
    id,
    type: "corp_tech_unlock",
    turn,
    corporationId: input.corp.id,
    corporationName: input.corp.name || "Corporation",
    amount: -input.cashCost,
    currencyCode: input.world.budgets?.[input.corp.countryId]?.currencyCode ?? "USD",
    meta: {
      ledgerKey: id,
      nodeId: input.node.id,
      nodeName: input.node.name,
      decadeId: input.node.decadeId,
      lane: input.node.lane,
      slot: input.node.slot,
      rdCost: input.node.cost,
    },
  };
}

/** Strict validation at the save boundary; absent history remains absent. */
export function validateCorporateCashLedger(value: unknown): void {
  if (!Array.isArray(value)) throw new Error("Invalid corporate cash ledger");
  const ids = new Set<string>();
  for (const raw of value) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid corporate cash ledger row");
    const row = raw as Record<string, unknown>;
    const meta = row["meta"];
    if (meta === null || typeof meta !== "object" || Array.isArray(meta)) throw new Error("Invalid corporate cash ledger metadata");
    const details = meta as Record<string, unknown>;
    const isCapacity = row["type"] === "corp_capacity_build";
    const isFounding = row["type"] === "corp_sector_founding";
    const isAssetCash = isCapacity || isFounding;
    const identity = [row["corporationId"], isAssetCash ? details["sectorId"] : details["nodeId"], row["turn"]];
    const expectedId = typeof identity[0] === "string" && typeof identity[1] === "string" && Number.isInteger(identity[2])
      ? isCapacity ? `capacity-build:${identity[0]}:${identity[1]}:t${identity[2]}` : isFounding ? `sector-founding:${identity[0]}:${identity[1]}:t${identity[2]}` : corporateTechUnlockLedgerKey(identity[0], identity[1], identity[2] as number)
      : "";
    if (!expectedId || row["id"] !== expectedId || details["ledgerKey"] !== expectedId || ids.has(expectedId)) {
      throw new Error("Invalid corporate cash ledger identity");
    }
    if ((row["type"] !== "corp_tech_unlock" && !isAssetCash) || typeof identity[2] !== "number" || (identity[2] as number) < 0) {
      throw new Error(`Invalid corporate cash ledger type or turn for ${expectedId}`);
    }
    if (typeof row["amount"] !== "number" || !Number.isFinite(row["amount"]) || row["amount"] >= 0) {
      throw new Error(`Invalid corporate cash ledger amount for ${expectedId}`);
    }
    if (typeof row["currencyCode"] !== "string" || row["currencyCode"].length === 0) {
      throw new Error(`Invalid corporate cash ledger currency for ${expectedId}`);
    }
    for (const key of ["corporationName"] as const) {
      if (typeof row[key] !== "string" || row[key].length === 0) throw new Error(`Invalid corporate cash ledger ${key} for ${expectedId}`);
    }
    for (const key of (isAssetCash ? ["sectorType"] : ["nodeName", "decadeId", "lane"]) as string[]) {
      if (typeof details[key] !== "string" || details[key].length === 0) throw new Error(`Invalid corporate cash ledger ${key} for ${expectedId}`);
    }
    for (const key of (isAssetCash ? ["units", "costAnchor", "onlineTurn"] : ["slot", "rdCost"]) as string[]) {
      if (typeof details[key] !== "number" || !Number.isFinite(details[key]) || details[key] < 0) throw new Error(`Invalid corporate cash ledger ${key} for ${expectedId}`);
    }
    if (isFounding && (typeof details["entryFeeAnchor"] !== "number" || !Number.isFinite(details["entryFeeAnchor"]) || details["entryFeeAnchor"] < 0)) throw new Error(`Invalid corporate cash ledger entryFeeAnchor for ${expectedId}`);
    if (details["fxSpreadAnchor"] !== undefined && (typeof details["fxSpreadAnchor"] !== "number" || !Number.isFinite(details["fxSpreadAnchor"]) || details["fxSpreadAnchor"] < 0)) throw new Error(`Invalid corporate cash ledger fxSpreadAnchor for ${expectedId}`);
    ids.add(expectedId);
  }
}
