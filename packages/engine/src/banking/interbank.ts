/**
 * Atomic interbank commands and interest-only servicing. Original #326 port
 * from AHDGame e364c0495; #109 refreshes capability, currency, and policy gates
 * against 595a3b8. Retail/universal lend; investment/universal borrow. The
 * shared Native bank denomination is the country's budget currency.
 *
 * Synchronous validate-before-mutate settlement replaces Mongo's journal;
 * GameSession commits a clone only on success. Existing retail borrower debts
 * from older Native saves remain repayable and serviced without upgrading
 * their charter. New retail borrowing is refused. Failed-borrower claims
 * settle through the source creditor waterfall; failed-lender loans write off.
 * See docs/BANKING-LIFECYCLE.md for proof and remaining parent requirements.
 */

import type { WorldState } from "../types.js";
import type { Corporation } from "../corporation/types.js";
import { ARREARS_DEFAULT_TURNS, RESERVE_REQUIREMENT, TURNS_PER_YEAR } from "./constants.js";
import { bankCurrency, charterMay } from "./capabilities.js";
import { worldBankDeposits } from "./worldDeposits.js";

/** Max share of lendable headroom one lender may place on interbank. Source: rules/decide.ts INTERBANK_MAX_SHARE_OF_LENDABLE. */
export const INTERBANK_MAX_SHARE_OF_LENDABLE = 0.5;

/**
 * One bank-to-bank cash loan. Source: db/types/bank.ts InterbankLoan
 * (verbatim fields; ObjectIds become corp-id strings in solo).
 */
export interface InterbankLoan {
  id: string;
  lenderCorpId: string;
  borrowerCorpId: string;
  principal: number;
  outstanding: number;
  ratePercent: number;
  originatedTurn: number;
  status: "current" | "defaulted" | "repaid";
  arrearsTurns: number;
  lastProcessedTurn: number | null;
}

export type InterbankResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface InterbankQuote {
  /** Headroom-derived cap minus the lender's live interbank exposure. */
  maxByShare: number;
  lenderCash: number;
  /** min(maxByShare, lenderCash): the largest principal quotable now. */
  max: number;
}

function activeCharter(corp: Corporation | undefined): corp is Corporation & { bankCharter: NonNullable<Corporation["bankCharter"]> } {
  return !!corp?.bankCharter && corp.bankCharter.status === "active";
}

/**
 * Cash a deposit-taking bank may put behind NEW lending: the lendable share
 * of its deposit base after reserves and the book already out.
 * Source: rules/loans.ts namedLoanHeadroom via rules/reserves.ts
 * getLendableHeadroom. An authoritative player balance adds to the book only
 * when its domestic holder pointer and saved currency read cohort agree.
 */
export function interbankHeadroom(
  charter: NonNullable<Corporation["bankCharter"]>,
  cashBackedDeposits = Math.max(0, charter.npcDeposits),
): number {
  return Math.max(0, Math.max(0, cashBackedDeposits) * (1 - RESERVE_REQUIREMENT) - Math.max(0, charter.totalLoans));
}

/** Live (status current) exposure this lender has placed on the market. Source: interbank.ts sumLenderInterbankOutstanding. */
export function lenderInterbankOutstanding(world: WorldState, lenderCorpId: string): number {
  let total = 0;
  for (const loan of world.interbankLoans) {
    if (loan.lenderCorpId === lenderCorpId && loan.status === "current") total += Math.max(0, loan.outstanding);
  }
  return total;
}

/**
 * Largest principal this lender may quote now: the headroom-share cap less
 * live exposure, bounded by vault cash. Source: decide.ts lend_interbank
 * cap check (the client-safe quote the hub form would read).
 */
export function quoteInterbankMax(world: WorldState, lenderCorpId: string): InterbankQuote {
  const lender = world.corporations[lenderCorpId];
  if (!world.featureFlags.banking || world.bankPropTradingEnabled === false || !activeCharter(lender) || !charterMay(lender.bankCharter, "interbankLending")) return { maxByShare: 0, lenderCash: 0, max: 0 };
  const headroom = interbankHeadroom(lender.bankCharter, worldBankDeposits(world, lender).cashBackedDeposits);
  const maxByShare = Math.max(0, INTERBANK_MAX_SHARE_OF_LENDABLE * headroom - lenderInterbankOutstanding(world, lenderCorpId));
  const lenderCash = Math.max(0, lender.bankCharter.cashReserves);
  return { maxByShare, lenderCash, max: Math.min(maxByShare, lenderCash) };
}

/** Per-turn simple interest on a balance at an annual percent rate. Source: rules/loans.ts perTurnInterestOn. */
export function interbankInterestDue(outstanding: number, ratePercent: number): number {
  if (!(outstanding > 0) || !(ratePercent > 0)) return 0;
  return (outstanding * (ratePercent / 100)) / TURNS_PER_YEAR;
}

function positiveAmount(amount: unknown): number | null {
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0 ? amount : null;
}

/**
 * Originate an interbank loan: lender vault debit, borrower vault credit,
 * the loan record, and the borrower's interbank debt — one atomic step.
 * Source: interbank.ts lendInterbank + decide.ts lend_interbank.
 */
export function lendInterbank(
  world: WorldState,
  lenderCorpId: string,
  borrowerCorpId: string,
  amount: number,
  ratePercent: number,
): InterbankResult<InterbankLoan> {
  if (!world.featureFlags.banking || world.bankPropTradingEnabled === false) return { ok: false, error: "Interbank lending is not enabled" };
  const lender = world.corporations[lenderCorpId];
  if (!lender) return { ok: false, error: "Lender corporation not found" };
  const borrower = world.corporations[borrowerCorpId];
  if (!borrower) return { ok: false, error: "Borrower corporation not found" };
  if (!activeCharter(lender)) return { ok: false, error: "Only active chartered banks may lend on the interbank market" };
  if (!activeCharter(borrower)) return { ok: false, error: "Borrower must have an active bank charter" };
  if (lenderCorpId === borrowerCorpId) return { ok: false, error: "A bank cannot lend to itself on the interbank market" };
  if (!charterMay(lender.bankCharter, "interbankLending")) return { ok: false, error: "This charter cannot lend on the interbank market" };
  if (!charterMay(borrower.bankCharter, "interbankBorrowing")) return { ok: false, error: "This charter cannot borrow on the interbank market" };
  const lenderCurrency = bankCurrency(world, lender);
  const borrowerCurrency = bankCurrency(world, borrower);
  if (!lenderCurrency || lenderCurrency !== borrowerCurrency) return { ok: false, error: "Lender and borrower must have the same currency" };
  const principal = positiveAmount(amount);
  if (principal === null) return { ok: false, error: "Amount must be a positive number" };
  if (!Number.isFinite(ratePercent) || ratePercent < 0) return { ok: false, error: "Rate must be a non-negative number" };

  const headroom = interbankHeadroom(lender.bankCharter, worldBankDeposits(world, lender).cashBackedDeposits);
  const maxByShare = INTERBANK_MAX_SHARE_OF_LENDABLE * headroom;
  const outstanding = lenderInterbankOutstanding(world, lenderCorpId);
  if (principal > maxByShare + 1e-9 || outstanding + principal > maxByShare + 1e-9) {
    return { ok: false, error: "Amount exceeds interbank share of lendable headroom" };
  }
  if (principal > Math.max(0, lender.bankCharter.cashReserves) + 1e-9) {
    return { ok: false, error: "Lender has insufficient liquid capital" };
  }

  const turn = world.meta.turn;
  const pairCount = world.interbankLoans.filter((l) => l.lenderCorpId === lenderCorpId && l.borrowerCorpId === borrowerCorpId).length;
  const loan: InterbankLoan = {
    id: `ib-${lenderCorpId}-${borrowerCorpId}-${turn}-${pairCount}`,
    lenderCorpId,
    borrowerCorpId,
    principal,
    outstanding: principal,
    ratePercent,
    originatedTurn: turn,
    status: "current",
    arrearsTurns: 0,
    lastProcessedTurn: null,
  };
  lender.bankCharter.cashReserves = Math.max(0, lender.bankCharter.cashReserves - principal);
  borrower.bankCharter.cashReserves = Math.max(0, borrower.bankCharter.cashReserves + principal);
  borrower.bankCharter.interbankDebt = Math.max(0, borrower.bankCharter.interbankDebt ?? 0) + principal;
  world.interbankLoans.push(loan);
  return { ok: true, value: loan };
}

/**
 * Borrower returns principal: borrower vault debit, lender vault credit,
 * debt and record shrink together. Source: interbank.ts repayInterbank +
 * decide.ts repay_interbank (repay = min(amount, outstanding), success
 * resets arrearsTurns).
 */
export function repayInterbank(world: WorldState, loanId: string, amount: number): InterbankResult<{ repaid: number; outstanding: number }> {
  if (!world.featureFlags.banking || world.bankPropTradingEnabled === false) return { ok: false, error: "Interbank lending is not enabled" };
  const loan = world.interbankLoans.find((l) => l.id === loanId);
  if (!loan || loan.status !== "current") return { ok: false, error: "Interbank loan not found or not current" };
  const borrower = world.corporations[loan.borrowerCorpId];
  const lender = world.corporations[loan.lenderCorpId];
  if (!borrower || !lender) return { ok: false, error: "Interbank loan not found or not current" };
  // Source: repay_interbank opens with requireCapability(interbankBorrowing)
  // on the borrower's snapshot — a failed borrower's recorded debt settles
  // through returnDepositBook (#329), never through an out-of-band repay.
  if (!activeCharter(borrower)) return { ok: false, error: "Borrower must have an active bank charter" };
  const repay = Math.min(positiveAmount(amount) ?? 0, Math.max(0, loan.outstanding));
  if (!(repay > 0)) return { ok: false, error: "Nothing to repay" };
  if (repay > Math.max(0, borrower.bankCharter?.cashReserves ?? 0) + 1e-9) {
    return { ok: false, error: "Borrower has insufficient liquid capital" };
  }

  borrower.bankCharter!.cashReserves = Math.max(0, borrower.bankCharter!.cashReserves - repay);
  if (lender.bankCharter) lender.bankCharter.cashReserves = Math.max(0, lender.bankCharter.cashReserves + repay);
  if (borrower.bankCharter!.interbankDebt !== undefined) {
    borrower.bankCharter!.interbankDebt = Math.max(0, borrower.bankCharter!.interbankDebt - repay);
  }
  loan.outstanding = Math.max(0, loan.outstanding - repay);
  loan.status = loan.outstanding <= 0 ? "repaid" : "current";
  loan.arrearsTurns = 0;
  return { ok: true, value: { repaid: repay, outstanding: loan.outstanding } };
}

export interface InterbankServiceSummary {
  loansServiced: number;
  interestPaid: number;
  writtenOff: number;
  defaults: number;
}

/**
 * One turn of interest on every live interbank loan, borrower vault to
 * lender vault. Interest-only: principal returns through repayInterbank. A
 * shortfall counts an arrears turn; the ARREARS_DEFAULT_TURNS-th shortfall
 * defaults the loan, clearing the borrower's debt with no cash moving.
 * Idempotent per loan per turn via lastProcessedTurn.
 * Source: rules/interbankServicing.ts decideInterbankService (+ the
 * per-loan-per-turn key) and turn/bankingTurn.ts serviceOneInterbankLoan.
 */
export function serviceInterbankLoans(world: WorldState, turn: number): InterbankServiceSummary {
  const summary: InterbankServiceSummary = { loansServiced: 0, interestPaid: 0, writtenOff: 0, defaults: 0 };
  if (!world.featureFlags.banking || world.bankPropTradingEnabled === false) return summary;
  for (const loan of world.interbankLoans) {
    if (loan.status !== "current" || loan.lastProcessedTurn === turn) continue;
    const outstanding = Math.max(0, loan.outstanding);
    if (outstanding <= 0) {
      loan.status = "repaid";
      loan.outstanding = 0;
      loan.arrearsTurns = 0;
      loan.lastProcessedTurn = turn;
      summary.loansServiced += 1;
      continue;
    }
    const borrower = world.corporations[loan.borrowerCorpId];
    const lender = world.corporations[loan.lenderCorpId];
    const available = Math.max(0, borrower?.bankCharter?.cashReserves ?? 0);
    const due = interbankInterestDue(outstanding, loan.ratePercent);
    const paid = Math.min(due, available);
    if (paid > 0) {
      borrower!.bankCharter!.cashReserves = Math.max(0, borrower!.bankCharter!.cashReserves - paid);
      if (lender?.bankCharter) lender.bankCharter.cashReserves = Math.max(0, lender.bankCharter.cashReserves + paid);
      summary.interestPaid += paid;
    }
    if (paid < due - 1e-9) {
      loan.arrearsTurns += 1;
      if (loan.arrearsTurns >= ARREARS_DEFAULT_TURNS) {
        if (borrower?.bankCharter?.interbankDebt !== undefined) {
          borrower.bankCharter.interbankDebt = Math.max(0, borrower.bankCharter.interbankDebt - outstanding);
        }
        loan.status = "defaulted";
        loan.lastProcessedTurn = turn;
        summary.writtenOff += outstanding;
        summary.defaults += 1;
      } else {
        loan.lastProcessedTurn = turn;
      }
    } else {
      loan.arrearsTurns = 0;
      loan.lastProcessedTurn = turn;
    }
    summary.loansServiced += 1;
  }
  return summary;
}

/**
 * Lender-side defaults booked this turn, for the solvency confidence input.
 * Source: turn/bankSolvencyTurn.ts sumInterbankDefaultsLastTurn (the
 * interbank half of `defaultsLastTurn = retail + interbank`).
 */
export function sumInterbankDefaultsLastTurn(world: WorldState, lenderCorpId: string, turn: number): number {
  let total = 0;
  for (const loan of world.interbankLoans) {
    if (loan.lenderCorpId !== lenderCorpId || loan.status !== "defaulted" || loan.lastProcessedTurn !== turn) continue;
    total += Math.max(0, loan.outstanding);
  }
  return total;
}

/**
 * On failure, loans this bank made AS A LENDER die with it: borrowers keep
 * the cash, the asset is written off. Source: turn/bankSolvencyTurn.ts
 * writeOffLenderSideInterbankOnFailure (verbatim: status current becomes
 * defaulted; claims against the failed bank are deliberately untouched).
 */
export function writeOffLenderSideInterbankOnFailure(world: WorldState, failedCorpId: string, turn: number): number {
  let writtenOff = 0;
  for (const loan of world.interbankLoans) {
    if (loan.lenderCorpId !== failedCorpId || loan.status !== "current") continue;
    loan.status = "defaulted";
    loan.lastProcessedTurn = turn;
    writtenOff += 1;
  }
  return writtenOff;
}
