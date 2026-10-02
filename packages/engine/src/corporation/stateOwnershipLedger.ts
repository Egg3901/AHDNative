import type { WorldState } from "../types.js";
import { localToAnchor } from "../forex/conversion.js";
import type { NationalizationTrigger } from "./pendingNationalizations.js";

/** Source nationalizationLedger acquisition record; amounts use anchor units. */
export interface StateOwnershipEntry {
  id: string;
  countryId: string;
  nationalCorporationId: string;
  kind: "nationalize_whole";
  method: "executive" | "legislative" | "supermajority";
  triggers: NationalizationTrigger[];
  governingPartyId?: string | null;
  tier: "fair" | "discounted" | "seizure";
  formerCorpName: string;
  sectorTypes: string[];
  compensationAnchor: number;
  debtAnchor: number;
  shareholdersSettled: number;
  /** Older acquisition records retain their original absence. */
  confidenceBefore?: number;
  confidenceAfter?: number;
  turn: number;
}

/** Source ownershipTransition filters unmatured bonds, then sums principal in anchor. */
export function assumedDebtAnchor(world: WorldState, corporationId: string): number {
  return Object.values(world.bonds)
    .filter(bond => bond.issuerType === "corporation" && bond.corporationId === corporationId && !bond.matured)
    .reduce((total, bond) => {
      const exchange = Object.values(world.exchangeRates).find(row => row.currencyCode === bond.currencyCode);
      return total + localToAnchor(bond.totalIssued, exchange?.rate ?? 1);
    }, 0);
}

/** Historical absence remains absent; malformed recorded history fails closed. */
export function validateStateOwnershipLedger(world: WorldState): void {
  const ledger: unknown = world.stateOwnershipLedger;
  if (ledger === undefined) return;
  if (!Array.isArray(ledger)) throw new Error("Invalid state ownership ledger");
  const ids = new Set<string>();
  for (const raw of ledger) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid state ownership record");
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id || ids.has(row.id)
      || typeof row.countryId !== "string" || !world.countries[row.countryId]
      || typeof row.nationalCorporationId !== "string" || !row.nationalCorporationId
      || row.kind !== "nationalize_whole" || (row.method !== "executive" && row.method !== "legislative" && row.method !== "supermajority") || (row.tier !== "seizure" && row.tier !== "discounted" && row.tier !== "fair")
      || !Array.isArray(row.triggers) || row.triggers.length === 0 || !row.triggers.every(value => typeof value === "string" && ["npc", "unowned", "distress", "strategic", "monopoly", "supermajority"].includes(value)) || new Set(row.triggers).size !== row.triggers.length
      || (Object.hasOwn(row, "governingPartyId") && row.governingPartyId !== null && (typeof row.governingPartyId !== "string" || !row.governingPartyId))
      || typeof row.formerCorpName !== "string" || !row.formerCorpName
      || !Array.isArray(row.sectorTypes) || row.sectorTypes.length === 0 || !row.sectorTypes.every(value => typeof value === "string" && value.length > 0)
      || typeof row.compensationAnchor !== "number" || !Number.isFinite(row.compensationAnchor) || row.compensationAnchor < 0
      || (row.tier === "seizure" && row.compensationAnchor !== 0)
      || typeof row.debtAnchor !== "number" || !Number.isFinite(row.debtAnchor) || row.debtAnchor < 0
      || !Number.isInteger(row.shareholdersSettled) || (row.shareholdersSettled as number) < 0
      || !Number.isInteger(row.turn) || (row.turn as number) < 0 || (row.turn as number) > world.meta.turn) {
      throw new Error("Invalid state ownership record");
    }
    for (const key of ["confidenceBefore", "confidenceAfter"]) {
      if (Object.hasOwn(row, key) && (typeof row[key] !== "number" || !Number.isFinite(row[key]) || (row[key] as number) < 0 || (row[key] as number) > 100)) {
        throw new Error("Invalid state ownership confidence record");
      }
    }
    if (Object.hasOwn(row, "confidenceBefore") !== Object.hasOwn(row, "confidenceAfter")) throw new Error("Invalid state ownership confidence record");
    ids.add(row.id);
  }
}
