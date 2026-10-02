import type { WorldState } from "../types.js";
import { isCorpStateOwned } from "../bonds/corporateBonds.js";
import { completePendingWholeTaking } from "./nationalization.js";

export type NationalizationTrigger = "npc" | "unowned" | "distress" | "strategic" | "monopoly" | "supermajority";

/** Source pendingNationalizations document, using deterministic turn clocks. */
export interface PendingNationalization {
  id: string;
  countryId: string;
  targetCorporationId: string;
  tier: "fair" | "discounted" | "seizure";
  method: "executive" | "legislative" | "supermajority";
  triggers: NationalizationTrigger[];
  governingPartyId: string | null;
  postedAtTurn: number;
  noticeDeadlineTurn: number;
  status: "pending" | "completed" | "cancelled";
  resolvedAtTurn?: number;
}

/** Passed bills complete regardless of whether their political framing cleared.
 * Automatic takings require the separate strategic/monopoly cure path. */
export function resolvePendingLegislativeNationalizations(world: WorldState): void {
  for (const pending of world.pendingNationalizations ?? []) {
    if (pending.status !== "pending" || pending.method !== "legislative" || pending.noticeDeadlineTurn > world.meta.turn) continue;
    const donor = world.corporations[pending.targetCorporationId];
    if (!donor || isCorpStateOwned(donor)) {
      pending.status = "cancelled";
      pending.resolvedAtTurn = world.meta.turn;
      continue;
    }
    try {
      const result = completePendingWholeTaking(world, pending);
      if (result.ok) {
        pending.status = "completed";
        pending.resolvedAtTurn = world.meta.turn;
      }
    } catch {
      // Source isolates each failure and retains the notice for a later retry.
    }
  }
}

/** Do not fabricate notice history for legacy worlds. */
export function validatePendingNationalizations(world: WorldState): void {
  const rows: unknown = world.pendingNationalizations;
  if (rows === undefined) return;
  if (!Array.isArray(rows)) throw new Error("Invalid pending nationalizations");
  const ids = new Set<string>();
  const triggers = new Set(["npc", "unowned", "distress", "strategic", "monopoly", "supermajority"]);
  const validClock = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  for (const raw of rows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid pending nationalization record");
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id || ids.has(row.id)
      || typeof row.countryId !== "string" || !world.countries[row.countryId]
      || typeof row.targetCorporationId !== "string" || !row.targetCorporationId
      || typeof row.method !== "string" || !["executive", "legislative", "supermajority"].includes(row.method)
      || typeof row.tier !== "string" || !["fair", "discounted", "seizure"].includes(row.tier)
      || (row.method === "legislative" && row.tier !== "fair")
      || !Array.isArray(row.triggers) || row.triggers.length === 0 || !row.triggers.every((value: unknown) => typeof value === "string" && triggers.has(value))
      || new Set(row.triggers).size !== row.triggers.length
      || (row.governingPartyId !== null && (typeof row.governingPartyId !== "string" || !row.governingPartyId))
      || !validClock(row.postedAtTurn) || row.postedAtTurn > world.meta.turn
      || !validClock(row.noticeDeadlineTurn) || row.noticeDeadlineTurn < row.postedAtTurn
      || typeof row.status !== "string" || !["pending", "completed", "cancelled"].includes(row.status)
      || (row.status === "pending" ? row.resolvedAtTurn !== undefined : !validClock(row.resolvedAtTurn) || row.resolvedAtTurn < row.postedAtTurn || row.resolvedAtTurn > world.meta.turn)) {
      throw new Error("Invalid pending nationalization record");
    }
    ids.add(row.id);
  }
}
