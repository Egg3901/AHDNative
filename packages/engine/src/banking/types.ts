/**
 * Private banking types — W12 port of mainline's chartered-bank subdocument
 * and its satellite collections.
 *
 * Source: <mainline-checkout>/src/lib/db/types/bank.ts (BankCharter,
 * BankLoan, DepositInsuranceFund — fields kept are the subset this wave's
 * scope actually reads/writes; see banking/bankingTurn.ts and
 * banking/bankSolvencyTurn.ts file docs for the full scope-cut rationale).
 *
 * Scope cut (cited, not silently dropped): mainline's BankCharter also
 * carries investment/universal charter capabilities, proprietary positions,
 * InterbankLoan rows, the central-bank margin facility, and their idempotency
 * fields. #325 adds the optional aggregate debts and proprietary mark needed
 * for canonical accounting; #327 ports the discount-window lifecycle
 * (discountWindow.ts); interbank and proprietary lifecycles remain #326/#328.
 * Regulation Q rate corridors, charter-switch cooldowns, a blacklist, opt-in
 * loan approval, and B7 supervisory capital-adequacy stress testing
 * (capitalStanding, appliedStressLossFraction, undercapitalizedSinceTurn).
 * All of that sits behind mainline's SEPARATE `bankPropTradingEnabled` kill
 * switch (src/lib/banking/featureFlag.ts isBankPropTradingEnabled) or is
 * player-console UX with no origination action ported yet in AHDClient (no
 * "request a bank loan" / "open an investment charter" action exists). W12
 * ports the retail/deposit-taking core only: one bank per playable country
 * (see npcBanks.ts), NPC household deposits + interest, the NPC household
 * bulk loan book, deposit insurance, and solvency/failure. Prop transactions,
 * the margin facility, charter switching, Regulation Q,
 * supervision and loan approval are out of scope for this wave — flagged for
 * operator review, not silently ported partial. Interbank lend/repay/interest
 * servicing used to sit in that list; #326 ports it (see banking/interbank.ts).
 */

/** Solo charters only the deposit-taking type; see file doc for the cut. */
export type BankCharterStatus = "active" | "failed";

/**
 * Household credit rating bands, best credit first.
 * Source: src/lib/banking/creditBands.ts CREDIT_BAND_IDS (verbatim order).
 */
export const CREDIT_BAND_IDS = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC"] as const;
export type CreditBandId = (typeof CREDIT_BAND_IDS)[number];

/** Source: creditBands.ts LENDING_PROFILE_IDS (verbatim). */
export const LENDING_PROFILE_IDS = ["conservative", "balanced", "aggressive"] as const;
export type LendingProfileId = (typeof LENDING_PROFILE_IDS)[number];

/** Source: src/lib/banking/confidence.ts ConfidenceBand (verbatim). */
export type ConfidenceBand = "green" | "amber" | "red";

/**
 * Sub-document on Corporation. Source: db/types/bank.ts BankCharter (retail
 * subset — see file doc).
 */
export interface BankCharter {
  status: BankCharterStatus;
  charteredTurn: number;
  /** Capital posted at charter; absorbs losses before depositors do. Source: BankCharter.postedCapital. */
  postedCapital: number;
  /** The bank's own ring-fenced cash. Source: BankCharter.cashReserves (banking/bankCash.ts). */
  cashReserves: number;
  /** Captured NPC household deposits (cash-backed). Source: BankCharter.npcDeposits. */
  npcDeposits: number;
  /** Cached deposit aggregate (player pointer + npcDeposits), recomputed each bankingTurn. Source: BankCharter.totalDeposits. */
  totalDeposits: number;
  totalLoans: number;
  /** Principal owed to the central bank discount window. */
  discountWindowDebt?: number;
  /** Unpaid discount-window interest. */
  discountWindowArrears?: number;
  /** Principal owed on the central-bank margin facility. */
  cbMarginDebt?: number;
  /** Unpaid central-bank margin interest. */
  cbMarginArrears?: number;
  /** Outstanding principal borrowed from other banks. */
  interbankDebt?: number;
  /** Latest marked value of the proprietary book, not distributable equity. */
  propBookMarkValue?: number;
  /** CEO-set offsets against prime; solo has no rate-console action, so these stay at their charter default (0). Source: BankCharter.depositOffset/lendingOffset. */
  depositOffset: number;
  lendingOffset: number;
  /** Which credit bands the bank originates household loans into. Source: BankCharter.lendingProfile. */
  lendingProfile: LendingProfileId;
  /** Cached deposit ceiling from the capital-scale proxy (see constants.ts). Source: BankCharter.depositCeiling. */
  depositCeiling: number;
  /** 0..1 solvency/liquidity confidence, recomputed each bankSolvencyTurn. Source: BankCharter.confidence. */
  confidence: number;
  warningBand: ConfidenceBand;
  /** Contagion panic remaining; counts down by 1 each bankSolvencyTurn (floor 0). Source: BankCharter.panicTurns. */
  panicTurns: number;
  /** Idempotency key for bankingTurn. Source: BankCharter.lastBankingTurn. */
  lastBankingTurn: number | null;
  /**
   * Idempotency key for discount-window interest servicing (#327).
   * Source: BankCharter.lastDiscountWindowTurn. Optional so pre-#327 saves
   * load unchanged (absent reads as never-serviced).
   */
  lastDiscountWindowTurn?: number | null;
  /** Idempotency key for bankSolvencyTurn. Source: BankCharter.lastSolvencyTurn. */
  lastSolvencyTurn: number | null;
  failedTurn: number | null;
  /** Idempotency key for depositor resolution after failure. Source: BankCharter.depositorsResolvedTurn. */
  depositorsResolvedTurn: number | null;
}

/**
 * One named loan or one NPC household credit-band tranche.
 * Source: db/types/bank.ts BankLoan (subset: `pending`/`rejected` loan-approval
 * states dropped — no opt-in approval console ported; see file doc).
 */
export interface BankLoan {
  id: string;
  bankCorpId: string;
  /**
   * "player" is AHDClient's single named character (WorldState.player);
   * "corporation" is a Corporation.id. Neither has an origination action
   * yet (see file doc) — this array is empty at runtime absent a future
   * wave's "request a bank loan" action, and is exercised by tests with
   * synthetic loan records. "npcBulk" is the only kind ever created by the
   * engine itself, by bankingTurn's household book.
   */
  borrowerType: "player" | "corporation" | "npcBulk";
  borrowerId: string | null;
  /** Credit band, for `npcBulk` tranches only. Source: BankLoan.creditBand. */
  creditBand?: CreditBandId;
  principal: number;
  outstanding: number;
  ratePercent: number;
  originatedTurn: number;
  termTurns: number;
  status: "current" | "arrears" | "defaulted" | "repaid";
  arrearsTurns: number;
  lastProcessedTurn: number | null;
}

/**
 * One per country (solo has no multi-currency FX system wired into
 * WorldState — see banking/constants.ts file doc). Source: db/types/bank.ts
 * DepositInsuranceFund, keyed by countryId instead of CurrencyCode.
 */
export interface DepositInsuranceFund {
  countryId: string;
  balance: number;
  insuredCap: number;
  premiumsCollectedLifetime: number;
  payoutsLifetime: number;
}
