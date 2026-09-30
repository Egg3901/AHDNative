/** Validate newly persisted banking contracts at the load boundary.
 * Optional controls/ledgers stay absent on older saves; malformed present
 * data refuses the entire load, rather than entering monetary calculations.
 */
import type { WorldState } from "../types.js";
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const turn = (value: unknown): boolean => finite(value) && Number.isInteger(value) && value >= 0;

export function validateBankingState(world: WorldState): void {
  if (world.bankPropTradingEnabled !== undefined && typeof world.bankPropTradingEnabled !== "boolean") throw new Error("Not a valid save file: invalid bank prop trading switch");
  if (world.bankingLaws !== undefined) {
    if (!record(world.bankingLaws)) throw new Error("Not a valid save file: invalid banking laws");
    for (const [countryId, law] of Object.entries(world.bankingLaws)) {
      if (!world.countries[countryId] || !record(law)) throw new Error("Not a valid save file: invalid country banking law");
      for (const key of ["depositCorridor", "lendingCorridor"] as const) {
        const corridor = law[key];
        if (corridor !== undefined && (!record(corridor) || !finite(corridor.minOffset) || !finite(corridor.maxOffset) || corridor.minOffset > corridor.maxOffset)) throw new Error("Not a valid save file: invalid bank rate corridor");
      }
    }
  }
  for (const bank of Object.values(world.centralBanks)) {
    for (const key of ["reserveBalance", "netMoneyCreatedLifetime"] as const) {
      if (bank[key] !== undefined && !finite(bank[key])) throw new Error(`Not a valid save file: invalid central bank ${key}`);
    }
  }
  for (const corp of Object.values(world.corporations)) {
    const charter = corp.bankCharter;
    if (!charter) continue;
    if (!finite(charter.cashReserves) || charter.cashReserves < 0) throw new Error("Not a valid save file: invalid bank cash reserves");
    for (const key of ["discountWindowDebt", "discountWindowArrears", "cbMarginDebt", "cbMarginArrears", "interbankDebt", "lastBankingFacilityInterest"] as const) {
      const value = charter[key];
      if (value !== undefined && (!finite(value) || value < 0)) throw new Error(`Not a valid save file: invalid bank ${key}`);
    }
    for (const key of ["lastCbMarginTurn", "lastDiscountWindowTurn"] as const) {
      const value = charter[key];
      if (value !== undefined && value !== null && !turn(value)) throw new Error(`Not a valid save file: invalid bank ${key}`);
    }
    if (charter.lastBankingIncome !== undefined && !finite(charter.lastBankingIncome)) throw new Error("Not a valid save file: invalid bank facility income");
    if (charter.lastBankingIncomeTurn !== undefined && !turn(charter.lastBankingIncomeTurn)) throw new Error("Not a valid save file: invalid bank facility income turn");
  }
}
