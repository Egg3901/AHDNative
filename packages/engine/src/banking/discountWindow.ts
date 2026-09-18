/**
 * Discount-window draw, repayment, and per-turn servicing — #327 port of
 * AHDGame's B8 facility at pinned revision e364c0495.
 *
 * Sources (verbatim math unless noted):
 *  - src/lib/banking/rules/discountWindow.ts (DISCOUNT_WINDOW_SPREAD_PP,
 *    DISCOUNT_WINDOW_CAP_FRACTION, DISCOUNT_WINDOW_STIGMA,
 *    discountWindowRatePercent, quoteDiscountWindow, canDraw,
 *    discountWindowStigma)
 *  - src/lib/banking/rules/decide.ts draw_discount_window / repay_discount_window
 *    branches (eligibility order, rounded move, cap re-gate, clamp repay to
 *    outstanding, insufficient-cash refusal)
 *  - src/lib/turn/bankingTurn.ts serviceInterbankAndCbMargin B8 block
 *    (interest paid to the central bank, shortfall accrued as arrears,
 *    per-turn idempotency stamp)
 *  - src/lib/banking/depositBookReturn.ts (window debt + arrears senior to
 *    depositors on failure; claims extinguished on resolution)
 *
 * Solo adaptations (cited, not silently dropped):
 *  - Charter capability: Native charters one retail-only deposit-taking type
 *    (see npcBanks.ts file doc — no investment/universal types, no charter
 *    switching), so every active charter structurally carries the window
 *    capability. The reference's "not_deposit_taking" refusal for investment
 *    charters cannot arise here and is documented rather than modelled.
 *  - Deposit base: the cap sizes against cash-backed npcDeposits only. Player
 *    savings are a pointer, not cash the bank holds (see balanceSheet.ts and
 *    banking/bankingTurn.ts file docs), and Native has no
 *    playerDepositsAreLiabilities switch, so playerDeposits never enter the
 *    cap — the reference's legacy-pointer behavior, kept.
 *  - Money creation: drawing mints (cash appears in the vault) and repayment
 *    burns (cash destroyed), exactly as the reference's mint/burn legs do.
 *    Native central banks carry no reserveBalance / netMoneyCreatedLifetime
 *    ledger (see centralBank/types.ts scope cut), so there is no creation
 *    counter to move and no CB revenue account for interest: interest paid is
 *    destroyed with the same burn semantics as a repayment. Documented
 *    residual, not a silent retune.
 *  - Rounding: the decision validates the ROUNDED move against headroom
 *    (the reference validates the unrounded amount, then re-gates debt +
 *    rounded draw <= cap inside the guarded write). Single-threaded solo has
 *    no concurrent writer to re-gate against, so the one check covers both;
 *    it is stricter than the reference by less than one money unit.
 *  - Arrears have no repayment path in the reference either (repay clamps to
 *    discountWindowDebt; arrears accrue on shortfall and are extinguished on
 *    failure) — kept verbatim. Stigma "recovery" is automatic: it scales with
 *    cap usage, so repaying principal reduces it to zero at full repayment.
 *  - RNG-free, deterministic, single-writer: failure atomicity is by
 *    validate-before-mutate (every refusal throws before touching WorldState),
 *    the same simplification bankingTurn.ts and lineOfCredit.ts establish.
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import type { Corporation } from "../corporation/types.js";
import type { BankCharter } from "./types.js";
import { TURNS_PER_YEAR, roundMoney } from "./constants.js";

/** Penalty over prime, in percentage points. Source: rules/discountWindow.ts DISCOUNT_WINDOW_SPREAD_PP. */
export const DISCOUNT_WINDOW_SPREAD_PP = 3;

/** Ceiling on outstanding window debt, as a share of the deposit base. Source: rules/discountWindow.ts DISCOUNT_WINDOW_CAP_FRACTION. */
export const DISCOUNT_WINDOW_CAP_FRACTION = 0.25;

/** Confidence subtracted per unit of the cap actually drawn. Source: rules/discountWindow.ts DISCOUNT_WINDOW_STIGMA. */
export const DISCOUNT_WINDOW_STIGMA = 0.1;

export type DiscountWindowDenial =
  | "charter_inactive"
  | "no_deposits"
  | "cap_exhausted"
  | "invalid_amount";

export interface DiscountWindowQuote {
  /** Maximum outstanding debt this bank may carry. */
  capAnchor: number;
  /** How much more it may draw right now. */
  headroomAnchor: number;
  ratePercent: number;
}

/** Rate charged on window borrowing: prime plus the penalty. Source: discountWindowRatePercent (verbatim). */
export function discountWindowRatePercent(primeRate: number): number {
  const prime = Number.isFinite(primeRate) ? primeRate : 0;
  return Math.max(0, prime + DISCOUNT_WINDOW_SPREAD_PP);
}

function nonNegative(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function quoteDiscountWindow(
  charter: Pick<BankCharter, "npcDeposits" | "discountWindowDebt">,
  primeRate: number,
): DiscountWindowQuote {
  const deposits = nonNegative(charter.npcDeposits);
  const outstanding = nonNegative(charter.discountWindowDebt);
  const capAnchor = deposits * DISCOUNT_WINDOW_CAP_FRACTION;
  return {
    capAnchor,
    headroomAnchor: Math.max(0, capAnchor - outstanding),
    ratePercent: discountWindowRatePercent(primeRate),
  };
}

/**
 * May this bank draw `amount`, and if not, why? Source: canDraw (verbatim
 * order: status, capability, amount, deposits, cap). The capability leg is
 * the solo structural answer — every Native charter is a deposit-taking
 * retail charter (see file doc), so only status is checked.
 */
export function canDraw(
  charter: Pick<BankCharter, "status" | "npcDeposits" | "discountWindowDebt"> | null | undefined,
  amount: number,
  primeRate: number,
): { ok: true; quote: DiscountWindowQuote } | { ok: false; reason: DiscountWindowDenial } {
  if (!charter || charter.status !== "active") return { ok: false, reason: "charter_inactive" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: "invalid_amount" };

  const quote = quoteDiscountWindow(charter, primeRate);
  if (quote.capAnchor <= 0) return { ok: false, reason: "no_deposits" };
  if (amount > quote.headroomAnchor) return { ok: false, reason: "cap_exhausted" };
  return { ok: true, quote };
}

/**
 * Confidence penalty for current window usage, on the 0..1 confidence scale.
 * Source: discountWindowStigma (verbatim: scales with cap usage, full penalty
 * when the cap is zero but debt is outstanding).
 */
export function discountWindowStigma(
  charter: Pick<BankCharter, "npcDeposits" | "discountWindowDebt"> | null | undefined,
): number {
  const outstanding = nonNegative(charter?.discountWindowDebt);
  if (outstanding <= 0) return 0;
  const cap = nonNegative(charter?.npcDeposits) * DISCOUNT_WINDOW_CAP_FRACTION;
  if (cap <= 0) return DISCOUNT_WINDOW_STIGMA;
  const usage = Math.min(1, outstanding / cap);
  return DISCOUNT_WINDOW_STIGMA * usage;
}

const DENIAL_MESSAGES: Record<DiscountWindowDenial, string> = {
  charter_inactive: "The bank holds no active charter.",
  no_deposits: "The window is sized against the deposit base, and this bank has none.",
  cap_exhausted:
    "This draw would take the bank past its window limit. A bank needing more than that is not illiquid, it is insolvent.",
  invalid_amount: "Amount must be a positive number.",
};

function requireBank(world: WorldState, bankCorpId: string): { corp: Corporation; charter: BankCharter } {
  const corp = world.corporations[bankCorpId];
  const charter = corp?.bankCharter;
  if (!corp || !charter || charter.status !== "active") {
    throw new Error(DENIAL_MESSAGES.charter_inactive);
  }
  return { corp, charter };
}

export interface DiscountWindowDrawResult {
  outstanding: number;
  ratePercent: number;
}

/**
 * Draw emergency liquidity. Source: decide.ts draw_discount_window.
 * Validates everything before mutating, so every refusal leaves WorldState
 * untouched. The correct central bank (the borrowing bank's own country) must
 * exist to price the draw; a missing bank refuses rather than inventing a rate.
 */
export function drawDiscountWindow(
  world: WorldState,
  bankCorpId: string,
  amount: number,
): DiscountWindowDrawResult {
  const { corp, charter } = requireBank(world, bankCorpId);
  const bank = world.centralBanks[corp.countryId];
  if (!bank) throw new Error(DENIAL_MESSAGES.charter_inactive);

  if (!Number.isFinite(amount) || amount <= 0) throw new Error(DENIAL_MESSAGES.invalid_amount);
  const quote = quoteDiscountWindow(charter, bank.primeRate);
  if (quote.capAnchor <= 0) throw new Error(DENIAL_MESSAGES.no_deposits);
  const move = Math.round(amount);
  if (move <= 0) throw new Error(DENIAL_MESSAGES.invalid_amount);
  if (move > quote.headroomAnchor) throw new Error(DENIAL_MESSAGES.cap_exhausted);

  const ratePercent = discountWindowRatePercent(bank.primeRate);
  charter.cashReserves = Math.max(0, charter.cashReserves) + move;
  charter.discountWindowDebt = nonNegative(charter.discountWindowDebt) + move;
  return { outstanding: charter.discountWindowDebt, ratePercent };
}

export interface DiscountWindowRepayResult {
  repaid: number;
  outstandingAfter: number;
}

/**
 * Repay window principal. Source: decide.ts repay_discount_window (verbatim:
 * nothing-outstanding refusal, clamp to outstanding, insufficient-cash
 * refusal, burn semantics). Arrears are not repayable here — the reference
 * has no such path either (see file doc).
 */
export function repayDiscountWindow(
  world: WorldState,
  bankCorpId: string,
  amount: number,
): DiscountWindowRepayResult {
  const { charter } = requireBank(world, bankCorpId);

  const outstanding = nonNegative(charter.discountWindowDebt);
  if (outstanding <= 0) throw new Error("Nothing is outstanding on the window.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Repayment must be positive.");
  const repay = Math.min(Math.round(amount), outstanding);
  if (repay <= 0) throw new Error("Repayment must be positive.");
  if (repay > Math.max(0, charter.cashReserves)) {
    throw new Error("Insufficient cash to repay that amount.");
  }

  charter.cashReserves = Math.max(0, charter.cashReserves) - repay;
  charter.discountWindowDebt = outstanding - repay;
  return { repaid: repay, outstandingAfter: charter.discountWindowDebt };
}

/**
 * One turn of discount-window interest. Source: bankingTurn.ts B8 block
 * (verbatim order: price at the country's prime, pay what cash covers,
 * accrue the shortfall as arrears, stamp the per-turn key).
 *
 * Runs as its own phase immediately after bankingTurn — the reference runs
 * this servicing at the end of its bankingTurn pass, before lineOfCreditTurn
 * and bankSolvencyTurn, and this registry preserves that relative order (see
 * phases/registry.ts). RNG-free and idempotent per turn via
 * lastDiscountWindowTurn.
 */
export function serviceDiscountWindowInterest(world: WorldState, turn: number): void {
  for (const corp of Object.values(world.corporations)) {
    const charter = corp.bankCharter;
    if (!charter || charter.status !== "active") continue;
    if (nonNegative(charter.discountWindowDebt) <= 0) continue;
    if (charter.lastDiscountWindowTurn === turn) continue;
    const bank = world.centralBanks[corp.countryId];
    if (!bank) continue;

    const debt = nonNegative(charter.discountWindowDebt);
    const rate = discountWindowRatePercent(bank.primeRate);
    const interestDue = roundMoney((debt * (rate / 100)) / TURNS_PER_YEAR);
    const cash = Math.max(0, charter.cashReserves);
    const paid = Math.min(interestDue, cash);
    const shortfall = Math.max(0, interestDue - paid);

    if (paid > 0) charter.cashReserves = cash - paid;
    if (shortfall > 0) {
      charter.discountWindowArrears = nonNegative(charter.discountWindowArrears) + shortfall;
    }
    charter.lastDiscountWindowTurn = turn;
  }
}

export const discountWindowTurnPhase: TurnPhase = {
  name: "discountWindowTurn",
  run(world) {
    serviceDiscountWindowInterest(world, world.meta.turn);
  },
};
