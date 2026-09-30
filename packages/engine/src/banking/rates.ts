/** Rate setter/corridors from AHDGame 595a3b8, banking/rates.ts and regulationQ.ts. */
import type { WorldState } from "../types.js";
import { charterMay } from "./capabilities.js";
import type { InterbankResult } from "./interbank.js";

export interface RateCorridor { minOffset: number; maxOffset: number }
export interface BankRateCorridors { deposit: RateCorridor; lending: RateCorridor }
export type BankingLaw = Partial<{ depositCorridor: RateCorridor; lendingCorridor: RateCorridor }>;

export function bankRateCorridors(world: WorldState, countryId: string): BankRateCorridors {
  // sectorSeedEra.ts: only 1953 has an era unit scale greater than one.
  // Preset, rather than the advancing calendar, determines the unit basis.
  const historical = world.meta.era === "1953";
  const law = world.bankingLaws?.[countryId];
  return {
    deposit: law?.depositCorridor ?? { minOffset: -4, maxOffset: historical ? -0.5 : 0.5 },
    lending: law?.lendingCorridor ?? { minOffset: historical ? 0.5 : 0.25, maxOffset: historical ? 6 : 8 },
  };
}

export function setBankRates(world: WorldState, corpId: string, depositOffset: number, lendingOffset: number): InterbankResult<{ depositOffset: number; lendingOffset: number }> {
  if (!world.featureFlags.banking) return { ok: false, error: "Private banking is not enabled" };
  if (!Number.isFinite(depositOffset) || !Number.isFinite(lendingOffset)) return { ok: false, error: "Rate offsets must be finite numbers" };
  const corp = world.corporations[corpId];
  if (!corp) return { ok: false, error: "Corporation not found" };
  const charter = corp.bankCharter;
  if (!charter || !charterMay(charter, "setRates")) return { ok: false, error: "Only active retail or universal charters can set bank rates" };
  const corridors = bankRateCorridors(world, corp.countryId);
  for (const [label, offset, corridor] of [["Deposit", depositOffset, corridors.deposit], ["Lending", lendingOffset, corridors.lending]] as const) {
    if (offset < corridor.minOffset || offset > corridor.maxOffset) return { ok: false, error: `${label} offset ${offset} is outside corridor [${corridor.minOffset}, ${corridor.maxOffset}]` };
  }
  charter.depositOffset = depositOffset;
  charter.lendingOffset = lendingOffset;
  return { ok: true, value: { depositOffset, lendingOffset } };
}
