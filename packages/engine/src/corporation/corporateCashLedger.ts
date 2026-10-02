import type { WorldState } from "../types.js";
import type { Corporation } from "./types.js";

/** Source financialTxLog row for a successful NPP technology cash write. */
export interface CorporateCashLedgerRecord {
  id: string;
  type: "corp_tech_unlock";
  turn: number;
  corporationId: string;
  corporationName: string;
  /** Signed native-currency cash delta. A technology purchase is negative. */
  amount: number;
  currencyCode: string;
  meta: {
    ledgerKey: string;
    nodeId: string;
    nodeName: string;
    decadeId: string;
    lane: string;
    slot: number;
    rdCost: number;
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
    const identity = [row["corporationId"], details["nodeId"], row["turn"]];
    const expectedId = typeof identity[0] === "string" && typeof identity[1] === "string" && Number.isInteger(identity[2])
      ? corporateTechUnlockLedgerKey(identity[0], identity[1], identity[2] as number)
      : "";
    if (!expectedId || row["id"] !== expectedId || details["ledgerKey"] !== expectedId || ids.has(expectedId)) {
      throw new Error("Invalid corporate cash ledger identity");
    }
    if (row["type"] !== "corp_tech_unlock" || typeof identity[2] !== "number" || (identity[2] as number) < 0) {
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
    for (const key of ["nodeName", "decadeId", "lane"] as const) {
      if (typeof details[key] !== "string" || details[key].length === 0) throw new Error(`Invalid corporate cash ledger ${key} for ${expectedId}`);
    }
    for (const key of ["slot", "rdCost"] as const) {
      if (typeof details[key] !== "number" || !Number.isFinite(details[key]) || details[key] < 0) throw new Error(`Invalid corporate cash ledger ${key} for ${expectedId}`);
    }
    ids.add(expectedId);
  }
}
