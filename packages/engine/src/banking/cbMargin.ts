/** Collateral facility: AHDGame 595a3b8 rules/decide.ts and facilityInterest.ts. */
import type { WorldState } from "../types.js";
import { charterMay } from "./capabilities.js";
import { serviceFacilityInterest } from "./facilityInterest.js";
import type { InterbankResult } from "./interbank.js";

export const CB_MARGIN_SPREAD_PP = 1.5;
export const CB_MARGIN_COLLATERAL_FRACTION = 0.5;
export function cbMarginRatePercent(primeRate: number): number {
  return Math.max(0, (Number.isFinite(primeRate) ? primeRate : 0) + CB_MARGIN_SPREAD_PP);
}

export function drawCbMargin(world: WorldState, corpId: string, amount: number): InterbankResult<{ outstanding: number; ratePercent: number }> {
  if (!world.featureFlags.banking || world.bankPropTradingEnabled === false) return { ok: false, error: "CB margin line is not enabled" };
  const corp = world.corporations[corpId];
  const charter = corp?.bankCharter;
  if (!corp || !charter || !charterMay(charter, "centralBankMargin")) return { ok: false, error: "Only active investment or universal charters may draw CB margin" };
  const bank = world.centralBanks[corp.countryId];
  if (!bank) return { ok: false, error: "The borrowing bank's central bank is missing" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Amount must be a positive number" };
  const debt = Math.max(0, charter.cbMarginDebt ?? 0);
  const occupied = debt + Math.max(0, charter.cbMarginArrears ?? 0);
  if (occupied + amount > CB_MARGIN_COLLATERAL_FRACTION * Math.max(0, charter.propBookMarkValue ?? 0) + 1e-9) return { ok: false, error: "Draw would exceed CB margin collateral cap" };
  charter.cashReserves += amount;
  charter.cbMarginDebt = debt + amount;
  bank.netMoneyCreatedLifetime = (bank.netMoneyCreatedLifetime ?? 0) + amount;
  return { ok: true, value: { outstanding: charter.cbMarginDebt, ratePercent: cbMarginRatePercent(bank.primeRate) } };
}

export function repayCbMargin(world: WorldState, corpId: string, amount: number): InterbankResult<{ repaid: number; outstanding: number }> {
  if (!world.featureFlags.banking || world.bankPropTradingEnabled === false) return { ok: false, error: "CB margin line is not enabled" };
  const corp = world.corporations[corpId];
  const charter = corp?.bankCharter;
  if (!corp || !charter || !charterMay(charter, "centralBankMargin")) return { ok: false, error: "Only active investment or universal charters may repay CB margin" };
  const bank = world.centralBanks[corp.countryId];
  if (!bank) return { ok: false, error: "The borrowing bank's central bank is missing" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Amount must be a positive number" };
  const debt = Math.max(0, charter.cbMarginDebt ?? 0);
  const repaid = Math.min(amount, debt, Math.max(0, charter.cashReserves));
  if (!(repaid > 0)) return { ok: false, error: "Nothing to repay or insufficient liquid capital" };
  charter.cashReserves -= repaid;
  charter.cbMarginDebt = debt - repaid;
  bank.netMoneyCreatedLifetime = (bank.netMoneyCreatedLifetime ?? 0) - repaid;
  return { ok: true, value: { repaid, outstanding: charter.cbMarginDebt } };
}

export function serviceCbMarginInterest(world: WorldState, turn: number): void {
  if (!world.featureFlags.banking || world.bankPropTradingEnabled === false) return;
  serviceFacilityInterest(world, turn, "cbMargin", cbMarginRatePercent);
}
