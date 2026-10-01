/**
 * Native banking state. The original retail cluster and #325-329 supply
 * deposit/loan/insurance books, borrowings, interbank and equity prop books.
 * #109 at AHDGame 595a3b8 adds margin servicing/turn keys, facility accounting,
 * rate corridors and shared charter permissions. Optional new fields keep
 * older Native saves unchanged until the corresponding facility is used.
 *
 * Parent gaps remain: charter issuance/switch/revocation, player bank console,
 * bond/index/forex prop assets, blacklist and loan approvals, supervisory
 * capital standing/stress, and complete deposit settlement/audit integration.
 * See docs/BANKING-LIFECYCLE.md. Seeded banks remain retail.
 */

/** Revocation/estate stages beyond active and failed remain a parent gap. */
export type BankCharterStatus = "active" | "failed";

/**
 * Charter business model. Source: db/types/bank.ts BankCharterType
 * (verbatim). Seeded solo banks are all "retail"; investment/universal
 * charters exist only where a test (or a future charter wave) sets them —
 * they are what carry the proprietary-trading capability (#328).
 * Absent means "retail" (pre-#328 saves carry no type).
 */
export type BankCharterType = "retail" | "investment" | "universal";

/**
 * One proprietary-trading position. Source: db/types/bank.ts PropPosition
 * (equity subset — bond/indexUnit/forex refs have no solo pricing
 * substrate; see banking/propTrading.ts file doc).
 */
export interface PropPosition {
  asset: "equity";
  /** Corporation id of the held equity. */
  ref: string;
  units: number;
  costBasis: number;
  markValue?: number;
}

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
  /**
   * Charter business model (#328). Absent means "retail" — see
   * propTrading.charterTypeOf. Only investment/universal charters may run
   * a proprietary book (source: src/lib/banking/rules/capabilities.ts
   * BY_TYPE). Persisted as `charterType`; the source names this field
   * `type`.
   */
  charterType?: BankCharterType;
  /**
   * Proprietary-trading book (#328, investment/universal only). Marked each
   * bankSolvencyTurn; cash legs settle against the market counterparty.
   * Source: BankCharter.propBook.
   */
  propBook?: PropPosition[];
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
  /**
   * Cached sum of prop-book mark values (#328); refreshed every
   * bankSolvencyTurn, not distributable equity (see balanceSheet.ts).
   * Source: BankCharter.propBookMarkValue.
   */
  propBookMarkValue?: number;
  /** Offsets against prime; the session rate setter validates both before writing. Source: BankCharter.depositOffset/lendingOffset. */
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
  lastCbMarginTurn?: number | null;
  /** Saved original facility charge and income attribution, including unpaid interest. */
  lastBankingIncome?: number;
  lastBankingFacilityInterest?: number;
  lastBankingIncomeTurn?: number;
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
