/**
 * Occupational pension scheme rules — #315.
 *
 * Ports AHDGame `src/lib/pensions/rules.ts` pure functions at pinned
 * e364c04954ed628beef73a993a8e9e156650a31e. No invented numbers: every
 * constant below is the source value with its source rationale quoted in
 * the comment. Currency collapses to home-country local units (Native
 * corporations keep a single `liquidCapital` balance with no anchor/FX
 * layer — see corporation/types.ts — so the reference's anchor conversions
 * are identity here and every amount below is local currency).
 *
 * Scheme state (PensionScheme) ports `src/lib/db/types/pensionScheme.ts`
 * collapsed to JSON-safe Native shape: string ids (`id` is the union id —
 * one scheme per union, created on first charge, exactly like the
 * reference's `ensurePensionScheme`), turn numbers instead of Dates.
 * `investedValueAnchor` is carried (absent-means-zero) so every funding
 * read goes through `pensionSchemeAssetsAnchor`; Native has no index funds
 * yet, so it stays zero and the investing pass is a documented no-op
 * (the reference itself fails closed to cash-only when funds are off —
 * see schemeInvesting.ts `isIndexFundsEnabled` guard).
 *
 * Rate carrier: the reference settles `pensionContributionRate` onto the
 * CollectiveAgreement (absent reads as zero — db/types/union.ts). Native
 * has no bargaining/agreements yet (#322), so the rate rides on the Union
 * row as optional `pensionContributionRate` (see unions/types.ts) with the
 * same absent-means-zero rule and the same 0..0.15 validity band. The
 * bargaining writer that settles it is the #322 residual; the turn charges
 * only unions already carrying a rate.
 *
 * Covered wage: the reference sums covered sectors' stored daily
 * `laborCost` and divides by TURNS_PER_DAY (pensionTurn.ts
 * `coveredWageBillPerTurn`). Native sectors record headcount, not a wage
 * bill, so the covered bill is headcount x country annual wage per worker
 * / TURNS_PER_YEAR over the union's represented assets — the same dues-row
 * population (sectorAggregation.ts) and the same payroll-per-worker the
 * budget revenue uses. Full headcount, unscaled by unionization: the
 * reference sums the whole sector labour cost, not the unionized share.
 */

import type { WorldState } from "../types.js";
import { TURNS_PER_YEAR } from "../economy/macroConstants.js";
import { currencyCodeForCountry } from "./contributions.js";

/** Employer contribution as a share of the covered wage bill. Source: rules.ts PENSION_CONTRIBUTION_RATE_MIN/MAX. */
export const PENSION_CONTRIBUTION_RATE_MIN = 0;
export const PENSION_CONTRIBUTION_RATE_MAX = 0.15;

/**
 * Liability accrued per worker per turn, as a multiple of that worker's
 * wage cost for the turn. Set BELOW the contribution ceiling on purpose:
 * a scheme contributing at the maximum rate builds a surplus, and at the
 * default rate of zero a scheme accrues liabilities it cannot fund.
 * Source: rules.ts PENSION_ACCRUAL_RATE.
 */
export const PENSION_ACCRUAL_RATE = 0.08;

/** Below this funding ratio a scheme is in deficit and the employer owes a top-up. Source: rules.ts PENSION_DEFICIT_RATIO. */
export const PENSION_DEFICIT_RATIO = 0.9;

/**
 * Share of the shortfall an employer is asked for in one turn.
 * Deliberately partial: a deficit closed in a single turn would bankrupt
 * an employer for a slow-moving accounting number.
 * Source: rules.ts PENSION_TOPUP_FRACTION.
 */
export const PENSION_TOPUP_FRACTION = 0.05;

/** Funding ratio bands, for the surface and for the bargaining argument. Source: rules.ts PensionFundingBand. */
export type PensionFundingBand = "surplus" | "funded" | "deficit" | "critical";

/** Source: rules.ts PENSION_CRITICAL_RATIO. */
export const PENSION_CRITICAL_RATIO = 0.6;

/**
 * Share of the not-yet-in-payment liability that comes into payment each
 * turn. Union membership is modelled in aggregate and a retired player
 * character is deleted outright, so benefits are a flow against the
 * covered workforce as a whole, exactly like the wage bill.
 * Source: rules.ts PENSION_RETIREMENT_RATE.
 */
export const PENSION_RETIREMENT_RATE = 0.01;

/**
 * Share of the in-payment stock paid out per turn. A scheme that stops
 * receiving contributions still owes benefits for a long time; that lag is
 * what makes underfunding a slow, visible problem.
 * Source: rules.ts PENSION_BENEFIT_DRAWDOWN_RATE.
 */
export const PENSION_BENEFIT_DRAWDOWN_RATE = 0.02;

/**
 * How many turns of benefits a scheme keeps in cash before it may invest.
 * Chosen, not derived (see source comment): long enough that an ordinary
 * run of turns never forces a cut caused purely by investing.
 * Source: rules.ts PENSION_LIQUIDITY_BUFFER_TURNS.
 */
export const PENSION_LIQUIDITY_BUFFER_TURNS = 8;

/**
 * Hard ceiling on the share of CASH that may be invested in one turn, so a
 * scheme with no pensioners yet does not go fully illiquid before its
 * first one appears. Source: rules.ts PENSION_CASH_FLOOR_FRACTION.
 */
export const PENSION_CASH_FLOOR_FRACTION = 0.1;

/** Below this, investing is not worth a fund transaction. Source: rules.ts PENSION_MIN_INVESTMENT_ANCHOR. */
export const PENSION_MIN_INVESTMENT_ANCHOR = 1000;

/**
 * One union's occupational pension scheme. JSON-safe Native collapse of
 * the reference PensionScheme (string id = union id, turn numbers).
 * Amounts are home-currency local units (see file doc).
 */
export interface PensionScheme {
  /** Union id (`${countryId}-${sectorType}`). One scheme per union. */
  id: string;
  countryId: string;
  /** Denormalized for the surface; the union row stays the source of truth. */
  unionName: string;
  /** CASH paid in by employers and not yet paid out. Real money, never minted. */
  assets: number;
  /**
   * Marked-to-market value of the scheme's index-fund units. No index
   * funds exist in Native yet, so this stays absent/zero and funding
   * reads off cash alone (reference fail-closed shape).
   */
  investedValue?: number;
  /** Claims accrued by covered workers. What the scheme has promised. */
  liabilities: number;
  /**
   * Slice of `liabilities` in payment (retired claims). Always <=
   * liabilities. A claim in payment is a call on cash THIS turn.
   */
  benefitsInPayment?: number;
  /** Running totals, so the surface can show where the assets came from. */
  totalContributions: number;
  totalTopUps: number;
  /** Benefits actually paid out, cumulative. */
  totalBenefitsPaid?: number;
  /** Benefits that fell due and could not be paid, cumulative. Never minted to cover. */
  totalBenefitsUnpaid?: number;
  createdAtTurn: number;
  lastChargedTurn?: number;
  lastBenefitTurn?: number;
  /** Benefit cut applied last turn, 0..1. 0 means paid in full. */
  lastBenefitCutFraction?: number;
}

/** Ledger entry types, mirroring the reference financialTxLog types. */
export const PENSION_CONTRIBUTION_TX_TYPE = "pension_contribution";
export const PENSION_BENEFIT_TX_TYPE = "pension_benefit";

/**
 * One pension ledger row, shaped like the reference financialTxLog entry.
 * JSON-safe: deterministic string id, turn number, local-currency amount.
 * Contribution legs mirror the reference's two legs (employer debit +
 * scheme credit); the benefit leg mirrors the reference's single
 * scheme-to-`system` (modelled pensioners) row. Deterministic id
 * `${schemeId}:${turn}:${kind}:${counterpartyId}` doubles as the
 * same-turn idempotency key.
 */
export interface PensionLedgerRecord {
  /** `${schemeId}:${turn}:${kind}:${subjectId}:${counterpartyId}`. Unique, deterministic. */
  id: string;
  /** Ledger entry type. Always `pension_contribution` or `pension_benefit`. */
  type: typeof PENSION_CONTRIBUTION_TX_TYPE | typeof PENSION_BENEFIT_TX_TYPE;
  /** Scheme id (= union id). */
  schemeId: string;
  /** Union display name (reference counterpartyName). */
  unionName: string;
  turn: number;
  /** Signed local-currency amount from the subject's side (debit negative). */
  amount: number;
  currencyCode: string;
  subjectType: "corporation" | "pension_scheme";
  subjectId: string;
  subjectName: string;
  counterpartyType: "corporation" | "pension_scheme" | "system";
  counterpartyId: string | null;
  counterpartyName: string;
}

/**
 * Deterministic ledger id. The id IS the (scheme, turn, kind, leg)
 * idempotency invariant: the employer-debit leg and the scheme-credit leg
 * of one payment name opposite subject/counterparty pairs, so the two
 * legs of a contribution and the single benefit leg each own a distinct
 * id and the same turn can never book the same leg twice.
 */
export function pensionRecordIdFor(
  schemeId: string,
  turn: number,
  kind: "contribution" | "benefit",
  subjectId: string,
  counterpartyId: string,
): string {
  return `${schemeId}:${turn}:${kind}:${subjectId}:${counterpartyId}`;
}

/**
 * What a scheme owns, all of it. Every ratio, band and top-up read goes
 * through here: with cash-only holdings this equals cash, and a future
 * fund substrate adds its mark here without touching a reader.
 * Source: rules.ts pensionSchemeAssetsAnchor.
 */
export function pensionSchemeAssets(scheme: {
  assets: number;
  investedValue?: number;
}): number {
  const cash = Number.isFinite(scheme.assets) ? Math.max(0, scheme.assets) : 0;
  const invested =
    typeof scheme.investedValue === "number" && Number.isFinite(scheme.investedValue)
      ? Math.max(0, scheme.investedValue)
      : 0;
  return cash + invested;
}

export function pensionFundingRatio(assets: number, liabilities: number): number {
  // A scheme with no liabilities is trivially funded rather than dividing
  // by zero — the state of every scheme on the turn it is created.
  if (!Number.isFinite(liabilities) || liabilities <= 0) return 1;
  if (!Number.isFinite(assets) || assets <= 0) return 0;
  return assets / liabilities;
}

export function pensionFundingBand(ratio: number): PensionFundingBand {
  if (ratio >= 1) return ratio > 1.1 ? "surplus" : "funded";
  if (ratio < PENSION_CRITICAL_RATIO) return "critical";
  if (ratio < PENSION_DEFICIT_RATIO) return "deficit";
  return "funded";
}

export function isValidContributionRate(rate: number): boolean {
  return (
    Number.isFinite(rate) &&
    rate >= PENSION_CONTRIBUTION_RATE_MIN &&
    rate <= PENSION_CONTRIBUTION_RATE_MAX
  );
}

/**
 * One employer's contribution for one turn. An absent or unusable wage
 * bill contributes NOTHING rather than guessing: inventing a wage bill
 * would charge an employer for workers the economy is not modelling.
 * Source: rules.ts pensionContributionForTurn.
 */
export function pensionContributionForTurn(params: {
  coveredWageBill: number;
  contributionRate: number;
}): number {
  const { coveredWageBill, contributionRate } = params;
  if (!Number.isFinite(coveredWageBill) || coveredWageBill <= 0) return 0;
  if (!isValidContributionRate(contributionRate) || contributionRate <= 0) return 0;
  return coveredWageBill * contributionRate;
}

/**
 * The claim covered workers accrue this turn, keyed off the same wage
 * bill as the contribution so the two can never be measured against
 * different populations. Source: rules.ts pensionAccrualForTurn.
 */
export function pensionAccrualForTurn(coveredWageBill: number): number {
  if (!Number.isFinite(coveredWageBill) || coveredWageBill <= 0) return 0;
  return coveredWageBill * PENSION_ACCRUAL_RATE;
}

/**
 * What an employer is asked to top up this turn, if anything. Returns 0
 * for a scheme in balance. The top-up is a fraction of the SHORTFALL, not
 * of the liability, so a nearly-funded scheme asks for nearly nothing.
 * Source: rules.ts pensionTopUpForTurn.
 */
export function pensionTopUpForTurn(params: {
  assets: number;
  liabilities: number;
}): number {
  const ratio = pensionFundingRatio(params.assets, params.liabilities);
  if (ratio >= PENSION_DEFICIT_RATIO) return 0;

  const target = params.liabilities * PENSION_DEFICIT_RATIO;
  const shortfall = target - Math.max(0, params.assets);
  if (shortfall <= 0) return 0;
  return shortfall * PENSION_TOPUP_FRACTION;
}

/**
 * Claims that come into payment this turn. Only the not-yet-in-payment
 * liability can retire, so the in-payment stock never exceeds the total
 * promise. Source: rules.ts pensionRetirementsForTurn.
 */
export function pensionRetirementsForTurn(params: {
  liabilities: number;
  benefitsInPayment: number;
}): number {
  const total = Number.isFinite(params.liabilities) ? Math.max(0, params.liabilities) : 0;
  const inPayment = Number.isFinite(params.benefitsInPayment)
    ? Math.max(0, params.benefitsInPayment)
    : 0;
  const notYetInPayment = total - inPayment;
  if (notYetInPayment <= 0) return 0;
  return notYetInPayment * PENSION_RETIREMENT_RATE;
}

/** What pensioners are owed this turn, before anyone checks whether it is there. Source: rules.ts pensionBenefitsDueForTurn. */
export function pensionBenefitsDueForTurn(benefitsInPayment: number): number {
  if (!Number.isFinite(benefitsInPayment) || benefitsInPayment <= 0) return 0;
  return benefitsInPayment * PENSION_BENEFIT_DRAWDOWN_RATE;
}

export interface PensionBenefitPayment {
  /** What the scheme actually pays. Never more than the cash it holds. */
  paid: number;
  /** What fell due and did not get paid. */
  unpaid: number;
  /** 0 when benefits were paid in full, up to 1 when nothing could be paid. */
  cutFraction: number;
}

/**
 * The pro-rata cut. A scheme pays benefits out of the CASH it holds: no
 * overdraft, no borrowing, no mint. When cash is short every pensioner
 * takes the same proportional cut, and the unpaid part is NOT forgiven —
 * the claim stays on the books, so the scheme still shows as underfunded
 * and the employer is still asked for a top-up next turn.
 * Source: rules.ts pensionBenefitPayment.
 */
export function pensionBenefitPayment(params: {
  benefitsDue: number;
  cash: number;
}): PensionBenefitPayment {
  const due =
    Number.isFinite(params.benefitsDue) && params.benefitsDue > 0 ? params.benefitsDue : 0;
  if (due <= 0) return { paid: 0, unpaid: 0, cutFraction: 0 };

  const cash = Number.isFinite(params.cash) && params.cash > 0 ? params.cash : 0;
  if (cash >= due) return { paid: due, unpaid: 0, cutFraction: 0 };

  return { paid: cash, unpaid: due - cash, cutFraction: (due - cash) / due };
}

/**
 * How much cash a scheme may put into index funds this turn. Two
 * constraints, tighter wins: keep PENSION_LIQUIDITY_BUFFER_TURNS turns of
 * benefits in cash, and never invest more than 1 -
 * PENSION_CASH_FLOOR_FRACTION of cash. Returns 0 below
 * PENSION_MIN_INVESTMENT_ANCHOR. Ported for the future fund substrate;
 * the turn never calls it while no funds exist.
 * Source: rules.ts pensionInvestableCashAnchor.
 */
export function pensionInvestableCash(params: {
  cash: number;
  benefitsInPayment: number;
}): number {
  const cash = Number.isFinite(params.cash) ? Math.max(0, params.cash) : 0;
  if (cash <= 0) return 0;

  const inPayment = Number.isFinite(params.benefitsInPayment)
    ? Math.max(0, params.benefitsInPayment)
    : 0;
  const buffer = pensionBenefitsDueForTurn(inPayment) * PENSION_LIQUIDITY_BUFFER_TURNS;

  const afterBuffer = cash - buffer;
  const afterFloor = cash * (1 - PENSION_CASH_FLOOR_FRACTION);
  const investable = Math.min(afterBuffer, afterFloor);
  if (!Number.isFinite(investable) || investable < PENSION_MIN_INVESTMENT_ANCHOR) return 0;
  return investable;
}

/**
 * One sentence per band, because "0.83" tells a player nothing about what
 * to do next. Source: rules.ts describeFundingBand.
 */
export function describeFundingBand(band: PensionFundingBand): string {
  switch (band) {
    case "surplus":
      return "The scheme holds more than it owes. There is room to bargain the contribution rate down, or the pension up.";
    case "funded":
      return "The scheme can cover what it has promised.";
    case "deficit":
      return "The scheme is short. The employer is being asked for a top-up every turn until it recovers.";
    case "critical":
      return "The scheme is badly short of what it owes. Top-ups alone will take a long time to close this.";
  }
}

/** Read-only funding status for one scheme: the surface and bargaining projection. */
export interface PensionFundingStatus {
  schemeId: string;
  unionName: string;
  assets: number;
  liabilities: number;
  ratio: number;
  band: PensionFundingBand;
  description: string;
  lastBenefitCutFraction: number;
}

export function pensionFundingStatus(scheme: PensionScheme): PensionFundingStatus {
  const assets = pensionSchemeAssets(scheme);
  const liabilities = Number.isFinite(scheme.liabilities) ? Math.max(0, scheme.liabilities) : 0;
  const ratio = pensionFundingRatio(assets, liabilities);
  const band = pensionFundingBand(ratio);
  return {
    schemeId: scheme.id,
    unionName: scheme.unionName,
    assets,
    liabilities,
    ratio,
    band,
    description: describeFundingBand(band),
    lastBenefitCutFraction:
      typeof scheme.lastBenefitCutFraction === "number" &&
      Number.isFinite(scheme.lastBenefitCutFraction)
        ? Math.max(0, Math.min(1, scheme.lastBenefitCutFraction))
        : 0,
  };
}

/**
 * What a pension agreement costs the EMPLOYER this turn, for the
 * employer's own books. Recomputes the same two figures from the same
 * rules the turn uses (projection, not history: "what is this agreement
 * charging me right now"). An employer too short to pay is still shown
 * what it owes, because the claim accrues either way. A union with no
 * scheme yet cannot be in deficit and asks for no top-up.
 * Source: employerPensionCosts.ts employerPensionCostForTurn.
 */
export interface EmployerPensionCostPerTurn {
  contributionPerTurn: number;
  topUpPerTurn: number;
  inDeficit: boolean;
}

export const EMPTY_EMPLOYER_PENSION_COST: EmployerPensionCostPerTurn = {
  contributionPerTurn: 0,
  topUpPerTurn: 0,
  inDeficit: false,
};

export function employerPensionCostForTurn(params: {
  coveredWageBill: number;
  contributionRate: number;
  scheme?: PensionScheme | null;
}): EmployerPensionCostPerTurn {
  const contribution = pensionContributionForTurn({
    coveredWageBill: params.coveredWageBill,
    contributionRate: params.contributionRate,
  });
  // No scheme yet means nothing owed beyond this turn's contribution: the
  // turn creates it with no liabilities, so it cannot be in deficit.
  if (!params.scheme) {
    return { contributionPerTurn: contribution, topUpPerTurn: 0, inDeficit: false };
  }
  // Same reading as the turn: total assets plus what this turn's
  // contribution is about to add, against the position before accrual.
  const topUp = pensionTopUpForTurn({
    assets: pensionSchemeAssets(params.scheme) + contribution,
    liabilities: params.scheme.liabilities,
  });
  return { contributionPerTurn: contribution, topUpPerTurn: topUp, inDeficit: topUp > 0 };
}

/** Ledger currency for a scheme's country. Source: COUNTRY_CURRENCY_MAP[...] ?? "USD" (shared with contributions.ts). */
export function pensionCurrencyForCountry(countryId: string): string {
  return currencyCodeForCountry(countryId);
}

function isValidId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Strict scheme validation. Fails closed: a present-but-invalid scheme
 * row refuses the save rather than running the turn on corrupt books.
 */
export function validatePensionScheme(world: WorldState, scheme: unknown): asserts scheme is PensionScheme {
  const row = scheme as Record<string, unknown>;
  if (!row || typeof row !== "object") throw new Error("Invalid pension scheme (not an object)");
  if (!isValidId(row["id"])) throw new Error("Invalid pension scheme id");
  const union = world.unions[row["id"] as string];
  if (!union) throw new Error(`Invalid pension scheme union reference for ${row["id"]}`);
  if (typeof row["countryId"] !== "string" || row["countryId"] !== union.countryId) {
    throw new Error(`Invalid pension scheme country for ${row["id"]}`);
  }
  if (typeof row["unionName"] !== "string" || row["unionName"].length === 0) {
    throw new Error(`Invalid pension scheme name for ${row["id"]}`);
  }
  if (!isValidMoney(row["assets"])) throw new Error(`Invalid pension scheme assets for ${row["id"]}`);
  if (row["investedValue"] !== undefined && !isValidMoney(row["investedValue"])) {
    throw new Error(`Invalid pension scheme invested value for ${row["id"]}`);
  }
  if (!isValidMoney(row["liabilities"])) {
    throw new Error(`Invalid pension scheme liabilities for ${row["id"]}`);
  }
  const inPayment = row["benefitsInPayment"] ?? 0;
  if (!isValidMoney(inPayment) || inPayment > (row["liabilities"] as number)) {
    throw new Error(`Invalid pension scheme in-payment stock for ${row["id"]}`);
  }
  if (!isValidMoney(row["totalContributions"])) {
    throw new Error(`Invalid pension scheme contribution total for ${row["id"]}`);
  }
  if (!isValidMoney(row["totalTopUps"])) {
    throw new Error(`Invalid pension scheme top-up total for ${row["id"]}`);
  }
  if (row["totalBenefitsPaid"] !== undefined && !isValidMoney(row["totalBenefitsPaid"])) {
    throw new Error(`Invalid pension scheme paid total for ${row["id"]}`);
  }
  if (row["totalBenefitsUnpaid"] !== undefined && !isValidMoney(row["totalBenefitsUnpaid"])) {
    throw new Error(`Invalid pension scheme unpaid total for ${row["id"]}`);
  }
  if (!Number.isInteger(row["createdAtTurn"]) || (row["createdAtTurn"] as number) < 0) {
    throw new Error(`Invalid pension scheme creation turn for ${row["id"]}`);
  }
  for (const field of ["lastChargedTurn", "lastBenefitTurn"] as const) {
    const value = row[field];
    if (value !== undefined && (!Number.isInteger(value) || (value as number) < 0)) {
      throw new Error(`Invalid pension scheme ${field} for ${row["id"]}`);
    }
  }
  const cut = row["lastBenefitCutFraction"];
  if (cut !== undefined && (typeof cut !== "number" || !Number.isFinite(cut) || cut < 0 || cut > 1)) {
    throw new Error(`Invalid pension scheme cut fraction for ${row["id"]}`);
  }
}

/** Strict map validation: keys must match row ids, every row fails closed. */
export function validatePensionSchemes(
  world: WorldState,
  schemes: unknown,
): asserts schemes is Record<string, PensionScheme> {
  if (!schemes || typeof schemes !== "object" || Array.isArray(schemes)) {
    throw new Error("Invalid pension schemes (not a map)");
  }
  for (const [key, scheme] of Object.entries(schemes as Record<string, unknown>)) {
    validatePensionScheme(world, scheme);
    if ((scheme as PensionScheme).id !== key) {
      throw new Error(`Invalid pension scheme key does not match id: ${key}`);
    }
  }
}

const PENSION_LEDGER_TYPES = new Set([
  PENSION_CONTRIBUTION_TX_TYPE,
  PENSION_BENEFIT_TX_TYPE,
]);

/**
 * Strict ledger validation. Ids must be the deterministic join, amounts
 * finite (signed: debits negative), turns non-negative integers.
 */
export function validatePensionLedger(world: WorldState, rows: unknown): asserts rows is PensionLedgerRecord[] {
  if (!Array.isArray(rows)) throw new Error("Invalid pension ledger (not an array)");
  const schemes = world.pensionSchemes ?? {};
  for (const row of rows) {
    const entry = row as Record<string, unknown>;
    if (!entry || typeof entry !== "object") throw new Error("Invalid pension ledger row (not an object)");
    if (!PENSION_LEDGER_TYPES.has(entry["type"] as string)) {
      throw new Error(`Invalid pension ledger type for ${String(entry["id"])}`);
    }
    if (!isValidId(entry["schemeId"])) throw new Error("Invalid pension ledger scheme reference");
    const scheme = schemes[entry["schemeId"] as string];
    if (!scheme) throw new Error(`Invalid pension ledger scheme reference for ${String(entry["id"])}`);
    if (typeof entry["unionName"] !== "string" || entry["unionName"] !== scheme.unionName) {
      throw new Error(`Invalid pension ledger union name for ${String(entry["id"])}`);
    }
    if (!Number.isInteger(entry["turn"]) || (entry["turn"] as number) < 0) {
      throw new Error(`Invalid pension ledger turn for ${String(entry["id"])}`);
    }
    if (typeof entry["amount"] !== "number" || !Number.isFinite(entry["amount"])) {
      throw new Error(`Invalid pension ledger amount for ${String(entry["id"])}`);
    }
    if (typeof entry["currencyCode"] !== "string" || entry["currencyCode"].length === 0) {
      throw new Error(`Invalid pension ledger currency for ${String(entry["id"])}`);
    }
    // Contribution rows carry two legs per counterparty (employer debit +
    // scheme credit); the benefit leg names the `system` sink. Id
    // determinism is checked from the row's own legs after this loop.
    if (!isValidId(entry["id"])) throw new Error("Invalid pension ledger id");
    if (!isValidId(entry["subjectId"]) || typeof entry["subjectName"] !== "string") {
      throw new Error(`Invalid pension ledger subject for ${String(entry["id"])}`);
    }
    if (typeof entry["counterpartyName"] !== "string") {
      throw new Error(`Invalid pension ledger counterparty for ${String(entry["id"])}`);
    }
  }
  // Id determinism: a row whose id is not the deterministic join of its
  // own legs fails closed, so the same turn can never book the same leg
  // twice and a hand-edited id cannot smuggle in a duplicate payment.
  for (const row of rows as PensionLedgerRecord[]) {
    const kind = row.type === PENSION_BENEFIT_TX_TYPE ? "benefit" : "contribution";
    if (
      row.id !==
      pensionRecordIdFor(row.schemeId, row.turn, kind, row.subjectId, row.counterpartyId ?? "")
    ) {
      throw new Error(`Invalid pension ledger id does not match legs: ${row.id}`);
    }
  }
}
