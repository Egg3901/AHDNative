/**
 * corporationTurn — W9. Per-corp growth, margin, cost, tax, and insolvency,
 * then the per-country revenue rollup that feeds macroCountryTurn's growth
 * signal (see macroCountryTurn.ts THE KEY WIRE comment). #322 adds the
 * labour leg (overtime/strike output factors + margin penalty applied once
 * here, then strike-state stepping; see corporationLabour.ts).
 *
 * Registered immediately before macroCountryTurnPhase in registry.ts. AHDGame
 * runs corporationTurn before macroCountryTurn, and the macro phase reads the
 * per-country corpRevenueSnapshots written here. Keeping this causal edge in
 * the Native order makes current-turn corporate output visible to current-turn
 * macro growth. This phase is RNG-free, so the move does not consume or shift
 * the shared RNG stream.
 *
 * Scope (see types.ts + constants.ts file docs for full citations): per-corp
 * growth trend + affordability brake (sectorGrowthPolicy.ts, command-economy
 * plan-gravity branch not ported — no command-economy system in this
 * worktree), flat margin (no ~20-term modifier stack), corporate tax at the
 * country's authored rate (no consolidated-loss-offset apportionment — W9
 * corps are single-sector), and a simplified insolvency/reincorporation cycle
 * (nppInsolvencyDissolution.ts triggers 1+2 only; trigger 3 is bond-related,
 * W12/W13). CEO salary and shareholder dividends now settle from the recorded
 * CEO/shareholder fields. Overhead budgets (marketing/logistics/R&D) and the
 * full nppCorporationBehavior.ts decision engine remain PORT-STUB/deferred —
 * see constants.ts CEO_ARCHETYPE_MODIFIERS doc.
 *
 * W10 wire: runCorporationTurn also pushes this turn's annualized net income
 * into corp.earningsHistory (see the end of the function), which
 * market/recomputeSharePricesPhase reads as the earnings-power input to the
 * share-price formula. recomputeSharePricesPhase runs later in registry.ts,
 * after the other tail phases, and still sees the current turn's fresh push
 * because no intervening phase mutates corporation earnings history.
 */

import type { TurnPhase } from "../phases/types.js";
import type { Corporation } from "./types.js";
import type { PlayerCharacter } from "../types.js";
import {
  GROWTH_COST_MARGIN_SHARE,
  GROWTH_BRAKE_STEP,
  GROWTH_RATE_TURNS_PER_YEAR,
  MIN_GROWTH_RATE,
  MAX_GROWTH_RATE,
  calculateGrowthCost,
  softCapEffectiveMargin,
  trendGrowthRate,
  PERSISTENT_INSOLVENCY_GRACE_TURNS,
  DEFAULT_CORPORATE_TAX_RATE_PCT,
} from "./constants.js";
import { pushEarningsHistory } from "../market/earnings.js";
import {
  labourFactorsForCorporation,
  loadCorporationLabourState,
  stepCorporateSectorStrikes,
  type CorporationLabourFactors,
} from "./corporationLabour.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * One corp's turn: growth trend + brake, margin, growth cost, tax, net
 * income. Mutates the corp in place; returns nothing (matches other W9
 * phases' style).
 * Formulas: sectorGrowthPolicy.ts resolveSectorGrowthPolicy (growth/brake) +
 * sectorProfitBasis.ts sectorDailyProfitAnchor (revenue - maintenance -
 * growthCost) + sectorCalculations.ts corporate tax (single-sector, no
 * consolidation).
 */
export function runCorporationTurn(
  corp: Corporation,
  taxRatePct: number,
  labourFactors: CorporationLabourFactors = { outputFactor: 1, marginModifierPP: 0, strikeActive: false },
  settlement?: { player: PlayerCharacter; currencyCode: string },
): void {
  const priorRevenue = corp.revenue;
  const priorMargin = corp.effectiveProfitMargin || corp.profitMargin;
  const priorGrowthCostShare = priorRevenue > 0 ? (100 * corp.currentGrowthCost) / priorRevenue : 0;

  const growthUnaffordable =
    priorRevenue > 0 && (priorMargin <= 0 || priorGrowthCostShare >= priorMargin * GROWTH_COST_MARGIN_SHARE);

  const brakedTargetRate = growthUnaffordable
    ? Math.max(MIN_GROWTH_RATE, corp.targetGrowthRate - GROWTH_BRAKE_STEP)
    : corp.targetGrowthRate;

  const trended = trendGrowthRate(corp.currentGrowthRate, corp.targetGrowthRate);
  const newCurrentGrowthRate = growthUnaffordable
    ? Math.max(MIN_GROWTH_RATE, Math.min(trended, brakedTargetRate))
    : trended;

  const perTurnGrowthRate = newCurrentGrowthRate / GROWTH_RATE_TURNS_PER_YEAR;
  const growthCost = calculateGrowthCost(priorRevenue, perTurnGrowthRate);
  // #322: labour output hit lands here, exactly once per turn (the unions
  // pass never touches revenue). Worlds with no live action read factor 1.
  const outputFactor = Number.isFinite(labourFactors.outputFactor)
    ? Math.max(0, Math.min(1, labourFactors.outputFactor))
    : 1;
  const newRevenue = priorRevenue * (1 + perTurnGrowthRate / 100) * outputFactor;

  // #322: strike margin penalty while an asset strikes unprotected
  // (reference strikeMarginModifier). Transient: it leaves with the strike.
  const marginModifierPP = Number.isFinite(labourFactors.marginModifierPP) ? labourFactors.marginModifierPP : 0;
  const effectiveMargin = softCapEffectiveMargin(corp.profitMargin) + marginModifierPP;
  const operatingIncomePreTax = priorRevenue * (effectiveMargin / 100) - growthCost;

  // AHDGame sectorCalculations.ts subtracts the CEO's per-turn salary before
  // tax, caps it by projected cash and 1.25x gross revenue, then distributes
  // the configured dividend percentage from positive after-tax income. Native
  // stores the weekly/per-turn salary directly (its 48-turn year differs from
  // AHDGame's 24 hourly turns per day); the payout and affordability rules are
  // the same. Source MAX_DIVIDEND_RATE is 25%.
  const requestedSalary = corp.ceoVacant === true || !Number.isFinite(corp.ceoSalaryPerTurn)
    ? 0
    : Math.max(0, corp.ceoSalaryPerTurn ?? 0);
  const projectedCashBeforeSalary = Math.max(0, corp.liquidCapital + operatingIncomePreTax);
  const ceoSalaryPaid = Math.min(requestedSalary, projectedCashBeforeSalary, Math.max(0, priorRevenue) * 1.25);
  const netIncomePreTax = operatingIncomePreTax - ceoSalaryPaid;

  const taxableIncome = Math.max(0, netIncomePreTax);
  const corporateTax = taxableIncome * (taxRatePct / 100);
  const netIncomeBeforeDividends = netIncomePreTax - corporateTax;
  const dividendRate = Number.isFinite(corp.dividendRate)
    ? Math.max(0, Math.min(25, corp.dividendRate ?? 0))
    : 0;
  const dividendPoolPaid = netIncomeBeforeDividends > 0
    ? Math.min(netIncomeBeforeDividends * (dividendRate / 100), netIncomeBeforeDividends)
    : 0;
  const playerHolding = corp.shareholders.find((shareholder) => shareholder.holder === "player");
  const playerDividendPaid = playerHolding && corp.totalShares > 0
    ? dividendPoolPaid * Math.max(0, Math.min(1, playerHolding.shares / corp.totalShares))
    : 0;

  corp.targetGrowthRate = clamp(brakedTargetRate, MIN_GROWTH_RATE, MAX_GROWTH_RATE);
  corp.currentGrowthRate = newCurrentGrowthRate;
  corp.currentGrowthCost = growthCost;
  corp.revenue = newRevenue;
  corp.effectiveProfitMargin = effectiveMargin;
  corp.lastCeoSalaryPaid = ceoSalaryPaid;
  corp.lastDividendPoolPaid = dividendPoolPaid;
  corp.lastPlayerDividendPaid = playerDividendPaid;
  corp.lastUnpostedDividendPaid = Math.max(0, dividendPoolPaid - playerDividendPaid);
  corp.liquidCapital += netIncomeBeforeDividends - dividendPoolPaid;

  if (settlement) {
    const payout = (amount: number) => {
      if (amount <= 0 || !Number.isFinite(amount)) return;
      if (settlement.player.countryId === corp.countryId) {
        settlement.player.cash += amount;
      } else {
        settlement.player.currencyBalances ??= { personal: {} };
        const personal = settlement.player.currencyBalances.personal;
        personal[settlement.currencyCode] = (personal[settlement.currencyCode] ?? 0) + amount;
      }
    };
    if (corp.ceoId === "player" && corp.ceoVacant !== true) payout(ceoSalaryPaid);
    payout(playerDividendPaid);
  }

  // W10 wire: push this turn's annualized after-tax income into the rolling
  // earnings window market/recomputeSharePrices.ts reads as
  // normalizedEarningsAnchor. Source: turn/corporation/sectorCalculations.ts
  // "Push this turn's annualized after-tax income into the rolling history"
  // (annualIncomeBase = netIncomeBeforeDividends * TURNS_PER_YEAR). W9 has no
  // dividend system, so netIncome here already IS the pre-dividend figure
  // mainline annualizes.
  corp.earningsHistory = pushEarningsHistory(corp.earningsHistory, netIncomeBeforeDividends * GROWTH_RATE_TURNS_PER_YEAR);
}

/**
 * Insolvency check + reincorporation. Source: nppInsolvencyDissolution.ts —
 * see constants.ts PERSISTENT_INSOLVENCY_GRACE_TURNS doc for the relative
 * deep-threshold adaptation. Reincorporation resets the corp to its founding
 * state (capital, revenue, growth) rather than removing it: mainline's full
 * dissolution returns the sector to an unowned pool and (eventually) a fresh
 * NPP corp is spawned into it by a separate admin process; AHDClient has no
 * unowned-pool/spawn-queue system to port that two-step pipeline, so W9
 * collapses "dissolve then eventually respawn" into one deterministic step
 * that keeps sector coverage and corp count stable across a long run — the
 * property the 200-turn long-run-sanity test exists to check.
 */
export function checkInsolvency(corp: Corporation, currentTurn: number): void {
  const deepThreshold = -corp.foundingRevenue;
  const deeplyInsolvent = corp.liquidCapital < deepThreshold;
  const negative = corp.liquidCapital < 0;

  let shouldReincorporate = false;
  if (deeplyInsolvent) {
    shouldReincorporate = true;
  } else if (negative) {
    if (corp.insolventSinceTurn === null) {
      corp.insolventSinceTurn = currentTurn;
    } else if (currentTurn - corp.insolventSinceTurn >= PERSISTENT_INSOLVENCY_GRACE_TURNS) {
      shouldReincorporate = true;
    }
  } else {
    corp.insolventSinceTurn = null;
  }

  if (shouldReincorporate) {
    corp.liquidCapital = corp.foundingRevenue;
    corp.revenue = corp.foundingRevenue / GROWTH_RATE_TURNS_PER_YEAR;
    corp.currentGrowthCost = 0;
    corp.effectiveProfitMargin = corp.profitMargin;
    corp.insolventSinceTurn = null;
    corp.reincorporationCount += 1;
  }
}

export const corporationTurnPhase: TurnPhase = {
  name: "corporationTurn",
  run(world) {
    // #322: agreement protection + overtime-ban factors load once per turn;
    // strike resolution steps after the corp math (reference sector-pass
    // order: production effects from turn-start state, then the step).
    const labour = loadCorporationLabourState(world, world.meta.turn);
    for (const corp of Object.values(world.corporations)) {
      const taxRatePct = world.budgets?.[corp.countryId]?.taxRates.domesticCorporateTax ?? DEFAULT_CORPORATE_TAX_RATE_PCT;
      const currencyCode = world.budgets?.[corp.countryId]?.currencyCode ?? world.exchangeRates?.[corp.countryId]?.currencyCode ?? "XXX";
      runCorporationTurn(corp, taxRatePct, labourFactorsForCorporation(world, corp.id, labour), { player: world.player, currencyCode });
      checkInsolvency(corp, world.meta.turn);
    }
    stepCorporateSectorStrikes(world, world.meta.turn, labour);

    // Per-country revenue rollup for the macro growth-signal wire (see file doc).
    const byCountry: Record<string, number> = {};
    for (const corp of Object.values(world.corporations)) {
      byCountry[corp.countryId] = (byCountry[corp.countryId] ?? 0) + corp.revenue;
    }
    for (const [countryId, total] of Object.entries(byCountry)) {
      const snap = world.corpRevenueSnapshots[countryId];
      world.corpRevenueSnapshots[countryId] = {
        current: total,
        previous: snap ? snap.current : total,
        turn: world.meta.turn,
      };
    }
  },
};
