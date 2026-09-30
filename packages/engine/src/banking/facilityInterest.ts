/** The reference pays facility interest into CB reserves, never burns it.
 * Single-writer synchronous settlement and the saved turn key make the cash,
 * liability, and income changes one transition, idempotent across reload.
 */
import type { WorldState } from "../types.js";
import { TURNS_PER_YEAR } from "./constants.js";

export function serviceFacilityInterest(world: WorldState, turn: number, facility: "cbMargin" | "discountWindow", rate: (prime: number) => number): void {
  const debtKey = facility === "cbMargin" ? "cbMarginDebt" : "discountWindowDebt";
  const arrearsKey = facility === "cbMargin" ? "cbMarginArrears" : "discountWindowArrears";
  const stamp = facility === "cbMargin" ? "lastCbMarginTurn" : "lastDiscountWindowTurn";
  for (const corp of Object.values(world.corporations)) {
    const charter = corp.bankCharter;
    const bank = world.centralBanks[corp.countryId];
    if (!charter || charter.status !== "active" || !bank || charter[stamp] === turn) continue;
    const debt = Math.max(0, charter[debtKey] ?? 0);
    if (debt <= 0) continue;
    const due = debt * (rate(bank.primeRate) / 100) / TURNS_PER_YEAR;
    const paid = Math.min(due, Math.max(0, charter.cashReserves));
    charter.cashReserves -= paid;
    bank.reserveBalance = (bank.reserveBalance ?? 0) + paid;
    charter[arrearsKey] = Math.max(0, charter[arrearsKey] ?? 0) + Math.max(0, due - paid);
    charter[stamp] = turn;
    // Reset the facility audit on the first charge in a new turn.
    if (charter.lastBankingIncomeTurn !== turn) {
      charter.lastBankingIncome = 0;
      charter.lastBankingFacilityInterest = 0;
    }
    charter.lastBankingIncome = (charter.lastBankingIncome ?? 0) - due;
    charter.lastBankingFacilityInterest = (charter.lastBankingFacilityInterest ?? 0) + due;
    charter.lastBankingIncomeTurn = turn;
  }
}
