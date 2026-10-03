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

import { trackPlayerCorporationDistress } from "./nationalizationEligibility.js";
import { resolvePendingLegislativeNationalizations } from "./pendingNationalizations.js";
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
  calcRdScoreAfterTurn,
  rdMoraleFactor,
  sourcePlannedTargetRate,
} from "./constants.js";
import { CEO_ARCHETYPE_MODIFIERS } from "./constants.js";
import { getEraNominalScale } from "../commodity/constants.js";
import { isCommandEconomy } from "../commandEconomy/constants.js";
import { DAYS_PER_TURN } from "../calendar.js";
import { pushEarningsHistory } from "../market/earnings.js";
import { subsidyMarginModifierForCorporation } from "../budget/subsidyBudget.js";
import {
  labourFactorsForCorporation,
  loadCorporationLabourState,
  stepCorporateSectorStrikes,
  type CorporationLabourFactors,
} from "./corporationLabour.js";
import { syncSourceRegionalSectorReceipts } from "./sourceRegionalSectorSeed.js";
import { corporatePlantsRealizationRatio, runCorporatePlantProductionTurn, sourceCorpDailyGrossRevenueLocal } from "./plantProduction.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import { makeRdInnovationRng } from "./rdInnovationRng.js";
import { applyNppSourceStrategyRetools, strategyTransitionMarginModifier } from "./strategyRetooling.js";
import { applyNppCapacityReplacement, applyNppSourceFounding } from "./nppCapacityReinvestment.js";
import { advanceNppCorporationStrategies } from "./nppStrategyTurn.js";
import { strategyLevers } from "./nppCorpStrategy.js";
import { unlockNppCorporationTech } from "./techTree/nppUnlock.js";
import { getSectorTechEffects } from "./techTree/selectors.js";
import { assembleSourcePlantPnl, sourcePlantPolicyCredit } from "./physicalPlantCosts.js";
import { resolveDueCorporateRelocationVotes } from "./relocationVotes.js";
import { settleIndexFundDividend } from "../indexFunds/dividends.js";
import { refreshNativeCorporateCreditSnapshots } from "./creditSnapshot.js";
import {
  RD_EXTRACTION_BOOST_MAX,
  RD_EXTRACTION_BOOST_MIN,
  RD_INNOVATION_INTERVAL,
  RD_INNOVATION_SCORE_THRESHOLD,
  RD_REGULAR_BOOST_MAX,
  RD_REGULAR_BOOST_MIN,
} from "./constants.js";

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
  settlement?: {
    player: PlayerCharacter;
    currencyCode: string;
    indexFundBook?: import("../indexFunds/types.js").IndexFundBook;
    playerCurrencyCode?: string;
    foreignExchangeEnabled?: boolean;
    exchangeRates?: Record<string, { rate: number; currencyCode: string }>;
    turn?: number;
  },
  plantsTier: boolean = false,
  rdContext: { localPerAnchor?: number; avgWageLevel?: number } = {},
  growthContext: { softBudget: boolean; plannedTargetRate?: number } = { softBudget: false },
  plantOperatingMargin?: number,
  growthCostMultiplier = 1,
): void {
  const priorRevenue = corp.revenue;
  const priorMargin = corp.effectiveProfitMargin || corp.profitMargin;
  const priorGrowthCostShare = priorRevenue > 0 ? (100 * corp.currentGrowthCost) / priorRevenue : 0;

  const growthUnaffordable = !growthContext.softBudget &&
    priorRevenue > 0 && (priorMargin <= 0 || priorGrowthCostShare >= priorMargin * GROWTH_COST_MARGIN_SHARE);

  const brakedTargetRate = growthContext.plannedTargetRate !== undefined
    ? growthContext.plannedTargetRate
    : growthUnaffordable
      ? Math.max(MIN_GROWTH_RATE, corp.targetGrowthRate - GROWTH_BRAKE_STEP)
      : corp.targetGrowthRate;

  const trended = trendGrowthRate(corp.currentGrowthRate, corp.targetGrowthRate);
  const newCurrentGrowthRate = growthUnaffordable
    ? Math.max(MIN_GROWTH_RATE, Math.min(trended, brakedTargetRate))
    : trended;

  const perTurnGrowthRate = newCurrentGrowthRate / GROWTH_RATE_TURNS_PER_YEAR;
  const safeGrowthMultiplier = Number.isFinite(growthCostMultiplier) ? Math.max(0, growthCostMultiplier) : 1;
  const growthCost = calculateGrowthCost(priorRevenue, perTurnGrowthRate) * safeGrowthMultiplier;
  // #322: labour output hit lands here, exactly once per turn (the unions
  // pass never touches revenue). Worlds with no live action read factor 1.
  const outputFactor = Number.isFinite(labourFactors.outputFactor)
    ? Math.max(0, Math.min(1, labourFactors.outputFactor))
    : 1;
  const newRevenue = plantsTier
    ? priorRevenue
    : priorRevenue * (1 + perTurnGrowthRate / 100) * outputFactor;

  // #322: strike margin penalty while an asset strikes unprotected
  // (reference strikeMarginModifier). Transient: it leaves with the strike.
  const marginModifierPP = Number.isFinite(labourFactors.marginModifierPP) ? labourFactors.marginModifierPP : 0;
  const effectiveMargin = plantsTier && Number.isFinite(plantOperatingMargin)
    ? plantOperatingMargin! + marginModifierPP
    : softCapEffectiveMargin(corp.profitMargin) + marginModifierPP;
  const salaryRequestForCap = corp.ceoVacant === true || !Number.isFinite(corp.ceoSalaryPerTurn)
    ? 0
    : Math.max(0, corp.ceoSalaryPerTurn ?? 0);
  const rdRequest = Number.isFinite(corp.rdBudgetPerTurn) ? Math.max(0, corp.rdBudgetPerTurn ?? 0) : 0;
  const overheadRoom = Math.max(0, Math.max(0, priorRevenue) * 1.5 - salaryRequestForCap);
  const rdSpend = Math.min(rdRequest, overheadRoom);
  const operatingIncomePreTax = priorRevenue * (effectiveMargin / 100) - growthCost - rdSpend;

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
  const fundDividendReceived = settlement
    ? settleIndexFundDividend({
        book: settlement.indexFundBook,
        corporation: corp,
        corporationCurrencyCode: settlement.currencyCode,
        dividendPoolAnchor: dividendPoolPaid,
        player: settlement.player,
        playerCurrencyCode: settlement.playerCurrencyCode ?? settlement.currencyCode,
        foreignExchangeEnabled: settlement.foreignExchangeEnabled === true,
        ...(settlement.exchangeRates ? { exchangeRates: settlement.exchangeRates } : {}),
        ...(rdContext.localPerAnchor !== undefined ? { corporationLocalPerAnchor: rdContext.localPerAnchor } : {}),
        turn: settlement.turn ?? 0,
      })
    : 0;

  corp.targetGrowthRate = clamp(brakedTargetRate, MIN_GROWTH_RATE, MAX_GROWTH_RATE);
  corp.currentGrowthRate = newCurrentGrowthRate;
  corp.currentGrowthCost = growthCost;
  corp.revenue = newRevenue;
  corp.effectiveProfitMargin = effectiveMargin;
  corp.lastCeoSalaryPaid = ceoSalaryPaid;
  corp.lastRdSpendPerTurn = rdSpend;
  corp.lastDividendPoolPaid = dividendPoolPaid;
  corp.lastPlayerDividendPaid = playerDividendPaid;
  corp.lastUnpostedDividendPaid = Math.max(0, dividendPoolPaid - playerDividendPaid - fundDividendReceived);
  corp.liquidCapital += netIncomeBeforeDividends - dividendPoolPaid;
  const localPerAnchor = Number.isFinite(rdContext.localPerAnchor) && (rdContext.localPerAnchor ?? 0) > 0
    ? rdContext.localPerAnchor!
    : 1;
  const dailyAnchorBudget = rdSpend / localPerAnchor / DAYS_PER_TURN;
  const paidBudgetMorale = rdMoraleFactor(rdContext.avgWageLevel ?? 1);
  const currentRdScore = Number.isFinite(corp.rdScore) ? Math.max(0, corp.rdScore ?? 0) : 0;
  const scoreAfterSpend = calcRdScoreAfterTurn(currentRdScore, dailyAnchorBudget * paidBudgetMorale);
  corp.rdScore = Math.round(scoreAfterSpend * 100) / 100;

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

/**
 * Current Game rdInnovation plants branch. Its dedicated SHA-256 stream is
 * ported byte-for-byte and does not consume the world action RNG. The source
 * DB row order is adapted to the stable insertion order of Native's seeded
 * corporation records; Native has one aggregate sector asset per issuer.
 */
export function runCorporateRdInnovations(world: import("../types.js").WorldState): void {
  const assets = corporateSectorAssets(world);
  for (const asset of Object.values(assets)) {
    const corp = world.corporations[asset.corporationId];
    if (corp) corp.lastRdCapacityGain = 0;
  }
  if (world.meta.turn % RD_INNOVATION_INTERVAL !== 0) return;

  const rng = makeRdInnovationRng(world.meta.turn);
  const corporations = Object.values(world.corporations);
  for (const corp of corporations) {
    const score = Number.isFinite(corp.rdScore) ? Math.max(0, corp.rdScore ?? 0) : 0;
    if (score <= 0 || rng() > Math.min(1, score / RD_INNOVATION_SCORE_THRESHOLD)) continue;
    const eligible = Object.values(assets).filter((asset) => asset.corporationId === corp.id);
    if (eligible.length === 0) continue;
    // Native's source-backed single-sector aggregate has exactly one asset per
    // issuer. Keeping the pick preserves future multi-asset behavior.
    const asset = eligible[Math.floor(rng() * eligible.length)]!;
    const min = corp.sectorType === "extraction" ? RD_EXTRACTION_BOOST_MIN : RD_REGULAR_BOOST_MIN;
    const max = corp.sectorType === "extraction" ? RD_EXTRACTION_BOOST_MAX : RD_REGULAR_BOOST_MAX;
    const boost = min + rng() * (max - min);
    const stock = Number.isFinite(asset.capitalStock) ? Math.max(0, asset.capitalStock ?? 0) : 0;
    const gain = Math.round(stock * boost * 100) / 100;
    if (gain <= 0) continue;
    asset.capitalStock = stock + gain;
    corp.lastRdCapacityGain = gain;
  }
}

/** Supported one-sector NPP budget and dividend policy from nppCorporationBehavior.ts. */
export function updateNppCorporationFinancialPolicy(
  corp: Corporation,
  era: string,
  localPerAnchor: number,
): void {
  if (corp.ceoType === "player" || corp.ceoVacant === true || corp.countryOwnerId || corp.ownershipState === "stateOwned") return;
  const revenue = Number.isFinite(corp.revenue) ? Math.max(0, corp.revenue) : 0;
  const income = revenue * (corp.effectiveProfitMargin / 100)
    - Math.max(0, corp.lastCeoSalaryPaid ?? 0)
    - Math.max(0, corp.lastRdSpendPerTurn ?? 0);
  const margin = revenue > 0 ? income / revenue * 100 : 0;
  const cashFloorLocal = nppCorporationCashFloorLocal(corp, era, localPerAnchor);
  let rdPct = 0;
  if (income > 0 && revenue > 0 && corp.liquidCapital > cashFloorLocal) {
    if (margin >= 25) rdPct = 0.02;
    else if (margin >= 10) rdPct = 0.01;
  }
  const modifiers = CEO_ARCHETYPE_MODIFIERS[corp.archetype];
  const strategy = strategyLevers(corp.nppStrategy?.id ?? "expand");
  corp.rdBudgetPerTurn = Math.round(revenue * rdPct * modifiers.rdMult * strategy.rdMult);

  let dividendRate = 0;
  if (income > 0 && corp.liquidCapital > cashFloorLocal && margin >= 15) {
    const base = margin >= 30 ? 8 : margin >= 20 ? 5 : 3;
    dividendRate = Math.min(25, Math.round(base * modifiers.dividendMult * strategy.dividendMult));
  }
  corp.dividendRate = dividendRate;
}

/** Pinned source getNppCashFloorAnchor, converted into the issuer's currency. */
export function nppCorporationCashFloorLocal(corp: Corporation, era: string, localPerAnchor: number): number {
  const nominalScale = getEraNominalScale(era);
  const cashFloorAnchor = Math.max(
    Math.max(1, Math.round(125_000 * nominalScale)),
    Math.round(250_000 * nominalScale * CEO_ARCHETYPE_MODIFIERS[corp.archetype].cashFloorMult),
  );
  const fx = Number.isFinite(localPerAnchor) && localPerAnchor > 0 ? localPerAnchor : 1;
  return cashFloorAnchor * fx;
}

export const corporationTurnPhase: TurnPhase = {
  name: "corporationTurn",
  run(world) {
    // #322: agreement protection + overtime-ban factors load once per turn;
    // strike resolution steps after the corp math (reference sector-pass
    // order: production effects from turn-start state, then the step).
    const labour = loadCorporationLabourState(world, world.meta.turn);
    const labourByCorp = new Map(
      Object.keys(world.corporations).map((corpId) => [corpId, labourFactorsForCorporation(world, corpId, labour)]),
    );
    const subsidies = Array.isArray(world.subsidies) ? world.subsidies : [];
    const techByCorp = new Map(Object.values(world.corporations).map((corp) => [
      corp.id,
      getSectorTechEffects({ type: corp.sectorType, ...corp }, corp.sectorType),
    ]));
    const marginModifierByCorp = new Map(Object.values(world.corporations).map((corp) => {
      const labourFactors = labourByCorp.get(corp.id)!;
      const tech = techByCorp.get(corp.id)!;
      return [corp.id, labourFactors.marginModifierPP + subsidyMarginModifierForCorporation(subsidies, corp)
        + strategyTransitionMarginModifier(world, corp.id) + tech.marginBonusPp];
    }));
    runCorporatePlantProductionTurn(world, new Map(
      [...labourByCorp].map(([corpId, factors]) => [corpId, factors.outputFactor]),
    ), marginModifierByCorp);
    for (const corp of Object.values(world.corporations)) {
      const taxRatePct = world.budgets?.[corp.countryId]?.taxRates.domesticCorporateTax ?? DEFAULT_CORPORATE_TAX_RATE_PCT;
      const currencyCode = world.budgets?.[corp.countryId]?.currencyCode ?? world.exchangeRates?.[corp.countryId]?.currencyCode ?? "XXX";
      const labourFactors = labourByCorp.get(corp.id)!;
      const tech = techByCorp.get(corp.id)!;
      const asset = Object.values(world.corporateSectors ?? {}).find((candidate) => candidate.corporationId === corp.id);
      const fx = world.exchangeRates?.[corp.countryId]?.rate ?? 1;
      const marketizationLevel = world.commandEconomy[corp.countryId]?.marketizationLevel ?? 100;
      const softBudget = isCommandEconomy(marketizationLevel);
      const year = Number(world.meta.date.slice(0, 4));
      const plannedTargetRate = sourcePlannedTargetRate({
        countryId: corp.countryId,
        sectorType: corp.sectorType,
        year,
        marketizationLevel,
        currentTargetRate: corp.targetGrowthRate,
      });
      const issuerAssets = Object.values(world.corporateSectors ?? {}).filter((candidate) => candidate.corporationId === corp.id);
      const marginWeight = issuerAssets.reduce((sum, candidate) => sum + Math.max(0, candidate.realizedRevenue ?? 0), 0);
      const plantOperatingMargin = marginWeight > 0
        ? issuerAssets.reduce((sum, candidate) => sum + (candidate.effectiveProfitMargin ?? corp.profitMargin) * Math.max(0, candidate.realizedRevenue ?? 0), 0) / marginWeight
        : undefined;
      const labourAndSubsidy = {
        ...labourFactors,
        // Physical asset P&L owns the additive modifier credit once available.
        marginModifierPP: marginWeight > 0 ? 0 : (marginModifierByCorp.get(corp.id) ?? 0),
      };
      runCorporationTurn(corp, taxRatePct, labourAndSubsidy, {
        player: world.player,
        currencyCode,
        ...(world.indexFundBook ? { indexFundBook: world.indexFundBook } : {}),
        playerCurrencyCode: world.budgets?.[world.player.countryId]?.currencyCode ?? world.exchangeRates?.[world.player.countryId]?.currencyCode ?? "XXX",
        foreignExchangeEnabled: world.featureFlags.foreignExchange !== false,
        exchangeRates: world.exchangeRates,
        turn: world.meta.turn,
      }, true, {
        localPerAnchor: fx,
        avgWageLevel: asset?.wageLevel ?? 1,
      }, {
        softBudget,
        ...(plannedTargetRate !== undefined ? { plannedTargetRate } : {}),
      }, plantOperatingMargin, tech.growthCostMultiplier * corporatePlantsRealizationRatio(world, corp.id));
      // Game sectorCosts carries the tapered expansion bill through the
      // physical statement even after plant capacity becomes authoritative.
      // Native has one real asset per issuer; a revenue share keeps this
      // deterministic if a multi-asset issuer is introduced later.
      if (marginWeight > 0) {
        const totalRevenue = marginWeight;
        for (const sector of issuerAssets) {
          if (!sector.plantsPnl) continue;
          const share = Math.max(0, sector.realizedRevenue ?? 0) / totalRevenue;
          const growth = corp.currentGrowthCost * share;
          const settledPnl = assembleSourcePlantPnl({
            revenue: sector.plantsPnl.revenue,
            inputs: sector.plantsPnl.inputs,
            labour: sector.plantsPnl.labour ?? 0,
            upkeep: sector.plantsPnl.upkeep ?? 0,
            compliance: sector.plantsPnl.compliance ?? 0,
            financialLegs: sector.plantsPnl.financialLegs ?? 0,
            growth,
            otherOpex: sector.plantsPnl.otherOpexUncapped ?? sector.plantsPnl.otherOpex,
            requestedPolicyCredit: sourcePlantPolicyCredit(
              sector.plantsPnl.revenue,
              sector.profitMargin ?? corp.profitMargin,
              marginModifierByCorp.get(corp.id) ?? 0,
            ),
          });
          sector.plantsPnl.growth = growth;
          sector.plantsPnl.otherOpex = settledPnl.otherOpex;
          sector.plantsPnl.otherOpexUncapped = settledPnl.otherOpexUncapped;
          sector.plantsPnl.otherOpexCreditCapped = settledPnl.otherOpexCreditCapped;
          sector.plantsPnl.policyCredit = settledPnl.policyCredit;
          sector.plantsPnl.operatingCost = settledPnl.operatingCost;
          sector.plantsPnl.totalCost = settledPnl.totalCost;
          sector.plantsPnl.profit = settledPnl.profit;
        }
      }
      // Source insolvency uses management, separately from creator ownership.
      // Legacy absent management is the procedural NPP founding contract.
      if (!corp.countryOwnerId && (corp.ceoType ?? "npp") === "npp") checkInsolvency(corp, world.meta.turn);
      // Source computes the new NPP brain after current P&L, then uses that
      // decision for this turn's entry/capex and the financial targets it
      // writes for the next turn.
      advanceNppCorporationStrategies(world, corp.id);
      updateNppCorporationFinancialPolicy(corp, world.meta.era, fx);
    }
    // Current source turn writes the rating after issuer and per-asset P&L.
    refreshNativeCorporateCreditSnapshots(world);
    // Game runs NPP strategy decisions after the current sector and issuer
    // results are written. A chosen method therefore starts affecting output
    // on the next turn, rather than changing the production just settled.
    applyNppSourceStrategyRetools(world);
    applyNppCapacityReplacement(world);
    applyNppSourceFounding(world);
    const year = Number(world.meta.date.slice(0, 4));
    for (const corp of Object.values(world.corporations)) {
      const fx = world.exchangeRates?.[corp.countryId]?.rate ?? 1;
      unlockNppCorporationTech(
        world,
        corp,
        year,
        nppCorporationCashFloorLocal(corp, world.meta.era, fx),
        sourceCorpDailyGrossRevenueLocal(world, corp.id),
      );
    }
    resolvePendingLegislativeNationalizations(world);
    trackPlayerCorporationDistress(world);
    runCorporateRdInnovations(world);
    syncSourceRegionalSectorReceipts(world);
    stepCorporateSectorStrikes(world, world.meta.turn, labour);
    resolveDueCorporateRelocationVotes(world);

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
