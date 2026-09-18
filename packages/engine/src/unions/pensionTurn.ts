/**
 * Pension contribution and benefit turn pass — #315.
 *
 * Ports AHDGame `src/lib/pensions/pensionTurn.ts` `runPensionTurn` (+
 * `pensionBenefits.ts` `runPensionBenefitsTurn`, with the investing leg as
 * a documented no-op) at pinned e364c04954ed628beef73a993a8e9e156650a31e,
 * as one RNG-free TurnPhase registered at the tail after `unionsTurnPhase`.
 *
 * Native adaptations (cited, not invented):
 * - Agreement scope collapses to the union: Native seeds one corporation
 *   and one union per (country, sectorType) pair, so the reference's
 *   (union x employer x sectors) agreement reads as one union row carrying
 *   `pensionContributionRate` (absent-means-zero, same as the reference
 *   agreement field) over its represented sector assets. The bargaining
 *   writer that settles the rate is the #322 residual.
 * - Covered wage collapses to headcount x pay: Native sectors record
 *   workers, not a daily `laborCost`, so the per-turn bill is full
 *   represented headcount x country annual wage / TURNS_PER_YEAR — the
 *   same dues-row population (sectorAggregation.ts) and the same payroll
 *   the budget revenue uses. Unscaled by unionization, exactly like the
 *   reference sums whole-sector labour cost. One figure drives BOTH the
 *   contribution and the accrual, so the two never measure different
 *   populations (the pensionTurn.ts file-doc invariant).
 * - Money is single-currency local: Native corporations keep one
 *   `liquidCapital` balance with no anchor/FX layer, so the reference's
 *   anchor conversions are identity and employer debits land in the same
 *   local units the wage bill is priced in.
 * - Employer identity: each represented asset names its operating
 *   corporation (`corporationId`); the covered bill groups by employer so
 *   a union spanning several operators charges each for its own shops.
 *   In the seeded single-operator case this is one employer, matching the
 *   reference agreement shape.
 * - Suspension freeze: a union-banned (suspended) union skips the
 *   charge/accrue/top-up sweep — frozen labor relations cannot originate
 *   new employer charges — but its schemes still pay benefits already owed
 *   (the reference's post-contribution passes run even with no live
 *   agreement; a closed workplace's pensioners still draw).
 * - Investing is a no-op returning zeros: Native has no index funds, and
 *   the reference itself fails closed to cash-only when funds are off
 *   (schemeInvesting.ts `isIndexFundsEnabled` guard). The pure
 *   `pensionInvestableCash` rule is ported and tested, ready for the fund
 *   substrate; funding reads already go through `pensionSchemeAssets`.
 *
 * Order (reference order preserved): per (union, employer) charge, then
 * top-up on the pre-accrual position (accruing first would bill the
 * employer for the same turn's accrual before its contribution counted),
 * then accrual always — even when the employer could not pay (the promise
 * stands and the assets do not arrive: the shape of an underfunded
 * scheme). Benefits retire claims BEFORE computing the drawdown, so first
 * pensioners draw the turn they retire; the benefit payment never exceeds
 * cash (guarded by the pure function, so no negative assets — never a
 * mint in disguise).
 *
 * Atomicity: each scheme's charge and each scheme's benefit payment is
 * planned and fully validated before anything mutates; a failed plan
 * throws without touching state, and an unexpected mid-apply throw
 * restores the snapshot (same pattern as contributions.ts #321).
 * Same-turn re-runs are idempotent via `lastChargedTurn`/`lastBenefitTurn`
 * stamps plus deterministic ledger ids that refuse a duplicate leg.
 *
 * Determinism: unions iterate in sorted id order, employers in sorted
 * corp id order. No RNG is consumed.
 *
 * Source: <mainline-checkout>/src/lib/pensions/pensionTurn.ts
 *         <mainline-checkout>/src/lib/pensions/pensionBenefits.ts
 *         <mainline-checkout>/src/lib/pensions/schemeInvesting.ts
 */

import type { TurnPhase } from "../phases/types.js";
import type { WorldState } from "../types.js";
import { TURNS_PER_YEAR } from "../economy/macroConstants.js";
import { corporateSectorAssets } from "../corporation/corporateSectorAssets.js";
import { annualWageForCountry, totalLaborForceForCountry } from "./sectorAggregation.js";
import {
  isValidContributionRate,
  pensionAccrualForTurn,
  pensionBenefitPayment,
  pensionBenefitsDueForTurn,
  pensionContributionForTurn,
  pensionCurrencyForCountry,
  pensionRecordIdFor,
  pensionRetirementsForTurn,
  pensionSchemeAssets,
  pensionTopUpForTurn,
  PENSION_BENEFIT_TX_TYPE,
  PENSION_CONTRIBUTION_TX_TYPE,
  type PensionLedgerRecord,
  type PensionScheme,
} from "./pension.js";

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export interface PensionBenefitsTurnResult {
  schemesPaying: number;
  retirements: number;
  benefitsPaid: number;
  benefitsUnpaid: number;
  schemesCutting: number;
}

export interface PensionInvestingTurnResult {
  schemesInvesting: number;
  invested: number;
}

export interface PensionTurnResult {
  schemesCharged: number;
  contributions: number;
  topUps: number;
  accruals: number;
  /** Employers that could not pay in full. The claim still accrues. */
  shortfalls: number;
  benefits: PensionBenefitsTurnResult;
  investing: PensionInvestingTurnResult;
  errors: string[];
}

function emptyBenefits(): PensionBenefitsTurnResult {
  return { schemesPaying: 0, retirements: 0, benefitsPaid: 0, benefitsUnpaid: 0, schemesCutting: 0 };
}

function emptyResult(): PensionTurnResult {
  return {
    schemesCharged: 0,
    contributions: 0,
    topUps: 0,
    accruals: 0,
    shortfalls: 0,
    benefits: emptyBenefits(),
    investing: { schemesInvesting: 0, invested: 0 },
    errors: [],
  };
}

/** Covered per-turn wage bill grouped by operating employer, in asset-id order folded into sorted corp order. */
export function coveredWageByEmployer(
  world: WorldState,
  unionId: string,
  countryId: string,
): Map<string, number> {
  const byEmployer = new Map<string, number>();
  const totalLF = totalLaborForceForCountry(world, countryId);
  const annualWage = annualWageForCountry(world, countryId, totalLF);
  if (!(totalLF > 0) || !(annualWage > 0)) return byEmployer;
  const perWorkerPerTurn = annualWage / TURNS_PER_YEAR;
  if (!(perWorkerPerTurn > 0)) return byEmployer;
  const assets = Object.values(corporateSectorAssets(world))
    .filter((asset) => asset.representingUnionId === unionId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const asset of assets) {
    if (!asset.corporationId || !world.corporations[asset.corporationId]) continue;
    if (typeof asset.workers !== "number" || !Number.isFinite(asset.workers) || asset.workers <= 0) {
      continue;
    }
    const wage = asset.workers * perWorkerPerTurn;
    if (!(wage > 0)) continue;
    byEmployer.set(asset.corporationId, (byEmployer.get(asset.corporationId) ?? 0) + wage);
  }
  return byEmployer;
}

/** The scheme for a union, created on first charge with nothing owed. Absence is the honest record that the union never won one. */
export function ensurePensionScheme(
  world: WorldState,
  unionId: string,
  countryId: string,
  unionName: string,
  currentTurn: number,
): PensionScheme {
  const schemes = world.pensionSchemes ?? (world.pensionSchemes = {});
  const existing = schemes[unionId];
  if (existing) return existing;
  const scheme: PensionScheme = {
    id: unionId,
    countryId,
    unionName,
    assets: 0,
    liabilities: 0,
    totalContributions: 0,
    totalTopUps: 0,
    createdAtTurn: currentTurn,
  };
  schemes[unionId] = scheme;
  return scheme;
}

function ledgerHas(world: WorldState, id: string): boolean {
  return (world.pensionLedger ?? []).some((row) => row.id === id);
}

function schemeDisplayName(world: WorldState, unionId: string): string {
  const union = world.unions[unionId];
  return `${union?.name ?? "Unknown"} pension scheme`;
}

/**
 * Run the full pension pass over a world. Exported for focused tests;
 * the registered phase below is the turn's entry point.
 */
export function runPensionTurn(world: WorldState, currentTurn: number): PensionTurnResult {
  const result = emptyResult();
  const unionIds = Object.keys(world.unions ?? {}).sort();

  // ── Charge / accrue / top-up sweep ──────────────────────────────────
  for (const unionId of unionIds) {
    try {
      const union = world.unions[unionId]!;
      // Frozen labor relations originate no new employer charges, but
      // benefits already owed still pay below.
      if (union.suspended) continue;
      const rate = union.pensionContributionRate ?? 0;
      if (!isValidContributionRate(rate) || rate <= 0) continue;

      const wageByEmployer = coveredWageByEmployer(world, unionId, union.countryId);
      let wageTotal = 0;
      for (const wage of wageByEmployer.values()) wageTotal += wage;
      // No measured wages, no pension charge — the labour system can be
      // off entirely, and inventing a bill would charge for workers the
      // economy is not modelling.
      if (!(wageTotal > 0)) continue;

      // Plan against the pre-existing position WITHOUT creating the scheme:
      // a refused plan must leave no trace, not even an empty scheme row.
      // The scheme is created only after the plan fully validates, below.
      const prior = world.pensionSchemes?.[unionId];
      if (prior?.lastChargedTurn === currentTurn) continue;
      const priorAssets = prior ? pensionSchemeAssets(prior) : 0;
      const priorLiabilities = prior?.liabilities ?? 0;

      // 1. Contribution per employer, rounded to cents at the debit
      // boundary so debit == credit == ledger exactly.
      const employerIds = [...wageByEmployer.keys()].sort();
      const paidByEmployer = new Map<string, number>();
      let paidTotal = 0;
      for (const employerId of employerIds) {
        const share = pensionContributionForTurn({
          coveredWageBill: wageByEmployer.get(employerId) ?? 0,
          contributionRate: rate,
        });
        const rounded = roundMoney(share);
        if (!(rounded > 0)) {
          paidByEmployer.set(employerId, 0);
          continue;
        }
        const corp = world.corporations[employerId]!;
        if (!Number.isFinite(corp.liquidCapital) || corp.liquidCapital < rounded) {
          // An employer that cannot pay does NOT get the claim forgiven.
          result.shortfalls += 1;
          paidByEmployer.set(employerId, 0);
          continue;
        }
        paidByEmployer.set(employerId, rounded);
        paidTotal = roundMoney(paidTotal + rounded);
      }

      // 2. Top-up on the position BEFORE this turn's accrual, split by
      // covered-wage share with the leftover absorbed by the last
      // employer so the shares sum exactly.
      const assetsAfterContribution = priorAssets + paidTotal;
      const topUpTotal = roundMoney(
        pensionTopUpForTurn({ assets: assetsAfterContribution, liabilities: priorLiabilities }),
      );
      const topUpByEmployer = new Map<string, number>();
      let topUpCharged = 0;
      if (topUpTotal > 0) {
        let assigned = 0;
        employerIds.forEach((employerId, index) => {
          const wage = wageByEmployer.get(employerId) ?? 0;
          const share =
            index === employerIds.length - 1
              ? roundMoney(topUpTotal - assigned)
              : roundMoney((topUpTotal * wage) / wageTotal);
          assigned = roundMoney(assigned + share);
          topUpByEmployer.set(employerId, Math.max(0, share));
        });
        for (const employerId of employerIds) {
          const share = topUpByEmployer.get(employerId) ?? 0;
          if (!(share > 0)) {
            topUpByEmployer.set(employerId, 0);
            continue;
          }
          const corp = world.corporations[employerId]!;
          // Against the post-contribution balance: the contribution above
          // debits first (reference order), so approving both against the
          // same pre-debit balance could drive cash negative. A top-up that
          // no longer fits is refused and counted, exactly like a failed
          // reference atomic debit.
          const committed = paidByEmployer.get(employerId) ?? 0;
          if (!Number.isFinite(corp.liquidCapital) || corp.liquidCapital - committed < share) {
            result.shortfalls += 1;
            topUpByEmployer.set(employerId, 0);
            continue;
          }
          topUpCharged = roundMoney(topUpCharged + share);
        }
      }

      // 3. Accrual, always, whether or not the employer could pay.
      const accrual = pensionAccrualForTurn(wageTotal);

      // Validate the whole plan before mutating anything.
      const movedByEmployer = new Map<string, number>();
      for (const employerId of employerIds) {
        movedByEmployer.set(
          employerId,
          roundMoney((paidByEmployer.get(employerId) ?? 0) + (topUpByEmployer.get(employerId) ?? 0)),
        );
      }
      // No world writes yet: the ledger array itself is created at apply
      // time, so a refused plan leaves no trace, not even an empty row.
      const newRows: PensionLedgerRecord[] = [];
      // Same static union-country currency as the union contribution ledger
      // (contributions.ts), not the mutable budget/forex rows.
      const currencyCode = pensionCurrencyForCountry(union.countryId);
      for (const employerId of employerIds) {
        const moved = movedByEmployer.get(employerId) ?? 0;
        if (!(moved > 0)) continue;
        const corp = world.corporations[employerId]!;
        const schemeName = schemeDisplayName(world, unionId);
        const debitId = pensionRecordIdFor(unionId, currentTurn, "contribution", employerId, unionId);
        const creditId = pensionRecordIdFor(unionId, currentTurn, "contribution", unionId, employerId);
        if (ledgerHas(world, debitId) || ledgerHas(world, creditId)) {
          throw new Error(`Scheme ${unionId} already booked its contribution legs for turn ${currentTurn}`);
        }
        newRows.push({
          id: debitId,
          type: PENSION_CONTRIBUTION_TX_TYPE,
          schemeId: unionId,
          unionName: union.name,
          turn: currentTurn,
          amount: -moved,
          currencyCode,
          subjectType: "corporation",
          subjectId: employerId,
          subjectName: corp.tickerSymbol ?? employerId,
          counterpartyType: "pension_scheme",
          counterpartyId: unionId,
          counterpartyName: schemeName,
        });
        newRows.push({
          id: creditId,
          type: PENSION_CONTRIBUTION_TX_TYPE,
          schemeId: unionId,
          unionName: union.name,
          turn: currentTurn,
          amount: moved,
          currencyCode,
          subjectType: "pension_scheme",
          subjectId: unionId,
          subjectName: schemeName,
          counterpartyType: "corporation",
          counterpartyId: employerId,
          counterpartyName: corp.tickerSymbol ?? employerId,
        });
      }

      // The plan validated without touching state; only now does the scheme
      // come into existence (absence stays the record of never-charged).
      const scheme = ensurePensionScheme(world, unionId, union.countryId, union.name, currentTurn);

      // Apply with snapshot restore if a write unexpectedly throws.
      const snapshot = structuredClone({
        corporations: employerIds.map((id) => [id, world.corporations[id]!.liquidCapital] as const),
        scheme: { ...scheme },
        ledgerLength: world.pensionLedger?.length ?? 0,
        hadLedger: world.pensionLedger !== undefined,
      });
      try {
        for (const employerId of employerIds) {
          const moved = movedByEmployer.get(employerId) ?? 0;
          if (moved > 0) {
            world.corporations[employerId]!.liquidCapital = roundMoney(
              world.corporations[employerId]!.liquidCapital - moved,
            );
          }
        }
        scheme.assets = roundMoney(scheme.assets + paidTotal + topUpCharged);
        scheme.liabilities = scheme.liabilities + accrual;
        scheme.totalContributions = roundMoney(scheme.totalContributions + paidTotal);
        scheme.totalTopUps = roundMoney(scheme.totalTopUps + topUpCharged);
        scheme.lastChargedTurn = currentTurn;
        if (newRows.length > 0) {
          const ledger = world.pensionLedger ?? (world.pensionLedger = []);
          ledger.push(...newRows);
        }
      } catch (err) {
        for (const [id, liquidCapital] of snapshot.corporations) {
          world.corporations[id]!.liquidCapital = liquidCapital;
        }
        Object.assign(scheme, snapshot.scheme);
        if (!snapshot.hadLedger) {
          delete world.pensionLedger;
        } else {
          world.pensionLedger!.length = snapshot.ledgerLength;
        }
        throw err;
      }

      result.schemesCharged += 1;
      result.contributions = roundMoney(result.contributions + paidTotal);
      result.topUps = roundMoney(result.topUps + topUpCharged);
      result.accruals += accrual;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Union ${unionId}: ${message}`);
    }
  }

  // ── Benefits: retire, then pay ──────────────────────────────────────
  // Runs even when the charge sweep above had nothing to do: a scheme
  // with liabilities and no live rate is the ordinary end state of a
  // workplace that closed, and its pensioners still draw.
  const benefitOutcome = runPensionBenefitsTurn(world, currentTurn);
  result.benefits = benefitOutcome;
  result.errors.push(...benefitOutcome.errors);
  return result;
}

interface BenefitsOutcome extends PensionBenefitsTurnResult {
  errors: string[];
}

/**
 * Retire claims, then pay this turn's benefits, for every scheme that has
 * one. Claims retire BEFORE the drawdown is computed, so a scheme's first
 * pensioners start drawing the turn they retire rather than a turn later.
 */
export function runPensionBenefitsTurn(world: WorldState, currentTurn: number): BenefitsOutcome {
  const outcome: BenefitsOutcome = { ...emptyBenefits(), errors: [] };
  const schemes = world.pensionSchemes ?? {};
  for (const schemeId of Object.keys(schemes).sort()) {
    try {
      const scheme = schemes[schemeId]!;
      if (!(scheme.liabilities > 0)) continue;
      if (scheme.lastBenefitTurn === currentTurn) continue;

      const inPaymentBefore = scheme.benefitsInPayment ?? 0;
      const retirements = pensionRetirementsForTurn({
        liabilities: scheme.liabilities,
        benefitsInPayment: inPaymentBefore,
      });
      const inPayment = inPaymentBefore + retirements;
      const due = pensionBenefitsDueForTurn(inPayment);
      // Paid from CASH only: the pure function caps at cash, so the books
      // can never go negative no matter what moved between the read and
      // the write.
      const payment = pensionBenefitPayment({ benefitsDue: due, cash: scheme.assets });

      // Same static scheme-country currency as the contribution legs above.
      const currencyCode = pensionCurrencyForCountry(scheme.countryId);
      let benefitRow: PensionLedgerRecord | null = null;
      if (payment.paid > 0) {
        const schemeName = schemeDisplayName(world, scheme.id);
        const id = pensionRecordIdFor(scheme.id, currentTurn, "benefit", scheme.id, "system");
        if (ledgerHas(world, id)) {
          throw new Error(`Scheme ${scheme.id} already booked its benefit leg for turn ${currentTurn}`);
        }
        benefitRow = {
          id,
          type: PENSION_BENEFIT_TX_TYPE,
          schemeId: scheme.id,
          unionName: scheme.unionName,
          turn: currentTurn,
          amount: -payment.paid,
          currencyCode,
          subjectType: "pension_scheme",
          subjectId: scheme.id,
          subjectName: schemeName,
          counterpartyType: "system",
          counterpartyId: null,
          counterpartyName: "Pensioners",
        };
      }

      const snapshot = structuredClone({
        scheme: { ...scheme },
        ledgerLength: world.pensionLedger?.length ?? 0,
        hadLedger: world.pensionLedger !== undefined,
      });
      try {
        // Paying a benefit discharges the claim: without this the funding
        // ratio would never improve no matter how much a scheme paid out.
        scheme.assets = roundMoney(scheme.assets - payment.paid);
        scheme.liabilities = scheme.liabilities - payment.paid;
        scheme.benefitsInPayment = inPayment - payment.paid;
        scheme.totalBenefitsPaid = roundMoney((scheme.totalBenefitsPaid ?? 0) + payment.paid);
        scheme.totalBenefitsUnpaid = roundMoney(
          (scheme.totalBenefitsUnpaid ?? 0) + payment.unpaid,
        );
        scheme.lastBenefitTurn = currentTurn;
        scheme.lastBenefitCutFraction = payment.cutFraction;
        if (benefitRow) {
          const ledger = world.pensionLedger ?? (world.pensionLedger = []);
          ledger.push(benefitRow);
        }
      } catch (err) {
        Object.assign(scheme, snapshot.scheme);
        if (!snapshot.hadLedger) {
          delete world.pensionLedger;
        } else {
          world.pensionLedger!.length = snapshot.ledgerLength;
        }
        throw err;
      }

      outcome.schemesPaying += 1;
      outcome.retirements += retirements;
      outcome.benefitsPaid = roundMoney(outcome.benefitsPaid + payment.paid);
      outcome.benefitsUnpaid = roundMoney(outcome.benefitsUnpaid + payment.unpaid);
      if (payment.cutFraction > 0) outcome.schemesCutting += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outcome.errors.push(`Scheme ${schemeId}: ${message}`);
    }
  }
  return outcome;
}

/**
 * Scheme investing. Native has no index funds, so this is the reference's
 * fail-closed shape with the substrate absent: every scheme holds cash and
 * every other pension mechanic is untouched. Kept as an explicit ordered
 * step (benefits, then investment) so the fund slice plugs in here without
 * reordering the turn.
 */
export function runPensionSchemeInvestments(): PensionInvestingTurnResult {
  return { schemesInvesting: 0, invested: 0 };
}

export const pensionTurnPhase: TurnPhase = {
  name: "pensionTurn",
  run(world: WorldState) {
    // Unexpected per-scheme throws are already captured per scheme inside
    // runPensionTurn (the turn continues past one bad union exactly like
    // the reference's per-agreement try/catch); the phase itself stays
    // silent and RNG-free so an error-free turn writes only pension state.
    const result = runPensionTurn(world, world.meta.turn);
    result.investing = runPensionSchemeInvestments();
  },
};
