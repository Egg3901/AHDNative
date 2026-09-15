/**
 * Canonical pure accounting for bank borrowings and shareholder capital.
 * Ports AHDGame `src/lib/banking/rules/balanceSheet.ts` at pinned revision
 * e364c04954ed628beef73a993a8e9e156650a31e.
 */

export interface BankBorrowings {
  discountWindowDebt?: number;
  discountWindowArrears?: number;
  cbMarginDebt?: number;
  cbMarginArrears?: number;
  interbankDebt?: number;
}

export interface BankBalanceSheetInput extends BankBorrowings {
  cashReserves?: number;
  totalLoans?: number;
  npcDeposits?: number;
  propBookMarkValue?: number;
}

function nonNegative(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Everything the bank owes outside its deposit and shareholder claims. */
export function totalBorrowings(borrowings: BankBorrowings): number {
  return (
    nonNegative(borrowings.discountWindowDebt) +
    nonNegative(borrowings.discountWindowArrears) +
    nonNegative(borrowings.cbMarginDebt) +
    nonNegative(borrowings.cbMarginArrears) +
    nonNegative(borrowings.interbankDebt)
  );
}

/** Shareholder claim after cash-backed deposits and all borrowings are paid. */
export function bankEquity(charter: BankBalanceSheetInput): number {
  const assets = nonNegative(charter.cashReserves) + nonNegative(charter.totalLoans);
  const liabilities = nonNegative(charter.npcDeposits) + totalBorrowings(charter);
  return assets - liabilities;
}

/** Loss-absorbing cash after every borrowed central-bank/interbank claim. */
export function regulatoryCapital(charter: BankBalanceSheetInput): number {
  return nonNegative(charter.cashReserves) - totalBorrowings(charter);
}
