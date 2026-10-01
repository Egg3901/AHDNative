/** Charter permissions from AHDGame 595a3b8, banking/rules/capabilities.ts.
 * Missing types in older Native saves remain retail; existing debt still services.
 */
import type { BankCharter, BankCharterType } from "./types.js";
import type { WorldState } from "../types.js";
import type { Corporation } from "../corporation/types.js";

/** Native bank vaults use their country's budget denomination. */
export function bankCurrency(world: WorldState, corp: Corporation): string | undefined {
  return world.budgets[corp.countryId]?.currencyCode ?? world.exchangeRates[corp.countryId]?.currencyCode;
}

export type BankCapability = "acceptPlayerDeposits" | "acceptNpcFunding" | "householdLending"
  | "namedCorporationLending" | "namedCharacterLending" | "interbankLending"
  | "interbankBorrowing" | "proprietaryTrading" | "discountWindow"
  | "centralBankMargin" | "serviceLoanBook" | "setRates" | "branchNetwork";

const RETAIL = new Set<BankCapability>(["acceptPlayerDeposits", "acceptNpcFunding", "householdLending",
  "namedCorporationLending", "namedCharacterLending", "interbankLending", "discountWindow",
  "serviceLoanBook", "setRates", "branchNetwork"]);
const INVESTMENT = new Set<BankCapability>(["namedCorporationLending", "interbankBorrowing",
  "proprietaryTrading", "centralBankMargin", "serviceLoanBook"]);

export function charterTypeOf(charter: Pick<BankCharter, "charterType"> | undefined): BankCharterType {
  return charter?.charterType ?? "retail";
}

export function charterMay(charter: Pick<BankCharter, "charterType" | "status"> | undefined, capability: BankCapability): boolean {
  if (!charter || charter.status !== "active") return false;
  const type = charterTypeOf(charter);
  return type === "universal" || (type === "investment" ? INVESTMENT : RETAIL).has(capability);
}
