/**
 * Atomic interbank lending and servicing — issue #326.
 *
 * Ports AHDGame `src/lib/banking/interbank.ts` (lend/repay entry points),
 * `src/lib/banking/rules/decide.ts` (`lend_interbank` / `repay_interbank`
 * cases), `src/lib/banking/rules/interbankServicing.ts` (interest-only
 * servicing, arrears, default/write-off), and the lender-side halves of
 * `src/lib/turn/bankSolvencyTurn.ts` (interbank defaults feed confidence;
 * a failed lender's live loans die with it), all at pinned revision
 * e364c04954ed628beef73a993a8e9e156650a31e.
 *
 * Lifecycle (source-verbatim): a lender moves vault cash to a borrower,
 * booking an interest-only loan record plus the borrower's `interbankDebt`.
 * Principal returns only through explicit repayment. Each turn the borrower
 * owes one turn of simple interest; a shortfall counts an arrears turn and
 * the ARREARS_DEFAULT_TURNS-th consecutive shortfall defaults the loan,
 * clearing the borrower's debt with no cash moving. Interbank loans are NOT
 * part of retail `totalLoans`.
 *
 * Solo adaptations (cited, not silently dropped):
 * - No charter types are ported (see banking/types.ts file doc: every solo
 *   bank is retail-like). Source gates lending on retail/universal and
 *   borrowing on investment/universal; here both sides need an *active*
 *   charter. The type distinction is a residual, not a silent pass.
 * - No currency system is ported (see banking/constants.ts file doc), so
 *   source's lender/borrower currency-match rule is enforced as same-country.
 * - No settlement journal / DB ceremony: solo mutates WorldState
 *   synchronously with no concurrent writers (same simplification as
 *   bankingTurn.ts serviceNamedLoan). Every command validates fully before
 *   mutating, so a refusal leaves state byte-identical.
 * - Source interbank loans carry no term/maturity (interest-only with
 *   principal via repay); there is no maturity behavior to port. The issue's
 *   "maturities" acceptance is satisfied by documenting this, not inventing
 *   one.
 * - Discount-window servicing does not exist natively yet (issue #327 owns
 *   it), so there is no shared facility pass to order against. Relative
 *   order actually wired here: interbank interest settles inside
 *   bankingTurnPhase after every bank's deposit/interest/premium/named/NPC
 *   pass and before bankSolvencyTurnPhase evaluates confidence — matching
 *   source's bankingTurn (incl. interbank) before solvency order.
 * - No feature-flag gate is ported: source refuses lend/repay with
 *   "Interbank lending is not enabled" unless the policy enables both
 *   privateBanking and propTrading. Native declares privateBankingEnabled
 *   (featureFlags.ts) but nothing reads it — native banking is always on,
 *   so an active charter is the whole enablement check. Gating only
 *   interbank on an otherwise unread flag would invent a kill switch solo
 *   never had.
 * - Borrower-side claims against a failed bank are settled by
 *   bankSolvencyTurn's resolution sweep in source priority order
 *   (depositBookReturn.ts tier 3, issue #329): live loans against the failed
 *   borrower recover pro rata from the estate cash left after the
 *   central-bank facilities and depositors, the unpaid remainder is recorded
 *   as a lender loss, and the borrower's `interbankDebt` is extinguished
 *   with the estate.
 */

import type { WorldState } from "../types.js";
import type { Corporation } from "../corporation/types.js";
import { ARREARS_DEFAULT_TURNS, RESERVE_REQUIREMENT, TURNS_PER_YEAR } from "./constants.js";

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
 * getLendableHeadroom. Solo charters carry no playerDeposits field (player
 * savings are a pointer balance, never bank cash), so npcDeposits are the
 * whole cash-backed base — cited here, not silently equated.
 */
export function interbankHeadroom(charter: NonNullable<Corporation["bankCharter"]>): number {
  return Math.max(0, Math.max(0, charter.npcDeposits) * (1 - RESERVE_REQUIREMENT) - Math.max(0, charter.totalLoans));
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
  if (!activeCharter(lender)) return { maxByShare: 0, lenderCash: 0, max: 0 };
  const headroom = interbankHeadroom(lender.bankCharter);
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
  const lender = world.corporations[lenderCorpId];
  if (!lender) return { ok: false, error: "Lender corporation not found" };
  const borrower = world.corporations[borrowerCorpId];
  if (!borrower) return { ok: false, error: "Borrower corporation not found" };
  if (!activeCharter(lender)) return { ok: false, error: "Only active chartered banks may lend on the interbank market" };
  if (!activeCharter(borrower)) return { ok: false, error: "Borrower must have an active bank charter" };
  if (lenderCorpId === borrowerCorpId) return { ok: false, error: "A bank cannot lend to itself on the interbank market" };
  if (borrower.countryId !== lender.countryId) return { ok: false, error: "Lender and borrower must be chartered in the same country" };
  const principal = positiveAmount(amount);
  if (principal === null) return { ok: false, error: "Amount must be a positive number" };
  if (!Number.isFinite(ratePercent) || ratePercent < 0) return { ok: false, error: "Rate must be a non-negative number" };

  const headroom = interbankHeadroom(lender.bankCharter);
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
