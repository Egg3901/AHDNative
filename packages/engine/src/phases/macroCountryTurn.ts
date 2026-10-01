import type { TurnPhase } from "./types.js";
import {
  GAP_CLOSURE,
  GROWTH_RATE_MAX,
  GROWTH_RATE_MIN,
  INFLATION_BASE_TARGET,
  INFLATION_FISCAL_COEFF_DEFICIT,
  INFLATION_FISCAL_COEFF_SURPLUS,
  INFLATION_GDP_COEFF_DOWN,
  INFLATION_GDP_COEFF_UP,
  INFLATION_INERTIA,
  INFLATION_MAX,
  INFLATION_MAX_PER_TURN_DELTA,
  INFLATION_MEAN_REVERSION_COEFF,
  INFLATION_MIN,
  INFLATION_NAIRU,
  INFLATION_SHOCK_PCT,
  INFLATION_TREND_GDP_GROWTH,
  INFLATION_UNEMPLOYMENT_COEFF_DOWN,
  INFLATION_UNEMPLOYMENT_COEFF_UP,
  OKUN_COEFFICIENT_DOWN,
  OKUN_COEFFICIENT_UP,
  OUTPUT_GAP_BOUND,
  TURNS_PER_YEAR,
  UNEMPLOYMENT_INERTIA,
  UNEMPLOYMENT_MAX,
  UNEMPLOYMENT_MIN,
  WEEKS_PER_YEAR,
  NEUTRAL_GDP_GROWTH,
  SECTOR_SIGNAL_MIN,
  SECTOR_SIGNAL_MAX,
} from "../economy/macroConstants.js";
import {
  annualizedGrowthRate,
  computeLaborForce,
  NEUTRAL_LABOR_PARTICIPATION,
  potentialGrowth,
  tfpBasket,
  TFP_METRIC_PATHS,
  type TfpBasketInputs,
} from "../demographics/laborForce.js";
import { CENTRAL_BANK_COUNTRY_ANCHORS, computeMonetaryTerm } from "../centralBank/constants.js";
import { computeRealizedRevenueGrowthRate } from "../corporation/constants.js";
import { legacyPoliticalHalfFromBoard } from "../politicalMetrics/sourceRuntime.mjs";
import type { WorldState } from "../types.js";

// ── Pure helpers (exported for golden-value tests) ─────────────────────

/**
 * Advance the output gap by one turn and derive integrated gdpGrowth.
 * Formula: source <mainline-checkout>/src/lib/metricEngine/outputGap.ts advanceOutputGap
 */
export function advanceOutputGap(
  prevGap: number,
  sectorSignal: number,
  potential: number,
  turnsPerYear: number,
): { gap: number; gdpGrowth: number; impulse: number } {
  const g0Raw = Number.isFinite(prevGap) ? prevGap : 0;
  const g0 = Math.max(OUTPUT_GAP_BOUND[0], Math.min(OUTPUT_GAP_BOUND[1], g0Raw));
  const sector = Number.isFinite(sectorSignal) ? sectorSignal : 0;
  const potRaw = Number.isFinite(potential) ? potential : 0;
  const growthMin = GROWTH_RATE_MIN * 100;
  const growthMax = GROWTH_RATE_MAX * 100;
  const pot = Math.max(growthMin, Math.min(growthMax, potRaw));
  const impulse = sector - pot;
  const tpy = Number.isFinite(turnsPerYear) && turnsPerYear > 0 ? turnsPerYear : 1;
  const rawGap = g0 + (impulse - GAP_CLOSURE * g0) / tpy;
  // Game bounds the persisted stock and reported rate together. Clipping
  // growth after persisting an unbounded step loses their accounting identity.
  const feasibleGap: [number, number] = [
    Math.max(OUTPUT_GAP_BOUND[0], g0 + (growthMin - pot) / tpy),
    Math.min(OUTPUT_GAP_BOUND[1], g0 + (growthMax - pot) / tpy),
  ];
  const gap = Math.max(feasibleGap[0], Math.min(feasibleGap[1], rawGap));
  const gdpGrowth = pot + (gap - g0) * tpy;
  return { gap, gdpGrowth, impulse };
}

/**
 * Okun's law target for unemployment.
 * Formula: source <mainline-checkout>/src/lib/metricEngine/registry/economic.ts unemploymentNode
 */
export function okunTarget(
  prevUnemploymentPct: number,
  gdpGrowthPct: number,
  potentialPct: number,
): number {
  const gdpDeviation = gdpGrowthPct - potentialPct;
  const coeff = gdpDeviation > 0 ? OKUN_COEFFICIENT_DOWN : OKUN_COEFFICIENT_UP;
  const raw = prevUnemploymentPct - gdpDeviation * coeff;
  return Math.max(UNEMPLOYMENT_MIN, Math.min(UNEMPLOYMENT_MAX, raw));
}

/**
 * Fiscal term from budget deficit/surplus.
 * Source: src/lib/budget/inflation.ts calculateInflationWithBreakdown deficitPct logic
 *  FISCAL_COEFF_DEFICIT=0.15 (deficit inflationary), FISCAL_COEFF_SURPLUS=0.08 (surplus deflationary),
 *  clamp deficitPct to [-30,50] before coeff.
 */
export function computeFiscalTerm(surplus: number, gdp: number): number {
  if (!Number.isFinite(surplus) || !Number.isFinite(gdp) || gdp <= 0) return 0;
  const surplusToGdp = surplus / gdp;
  const deficitPctRaw = -surplusToGdp * 100;
  const deficitPct = Math.max(-30, Math.min(50, deficitPctRaw));
  const coeff = deficitPct >= 0
    ? INFLATION_FISCAL_COEFF_DEFICIT // source: inflation.ts FISCAL_COEFF_DEFICIT 0.15
    : INFLATION_FISCAL_COEFF_SURPLUS; // source: inflation.ts FISCAL_COEFF_SURPLUS 0.08
  return deficitPct * coeff;
}

/**
 * Simplified country-level inflation.
 * Pure core of <mainline-checkout>/src/lib/budget/inflation.ts calculateInflationWithBreakdown
 * with neutral values for every input that requires unported systems except the fiscal term
 * (W2, deficit/GDP) and the monetary term (W3, central-bank rate gap with lag).
 */
export function computeInflation(
  previousInflationPct: number,
  unemploymentPct: number,
  gdpGrowthPct: number,
  surplus: number = 0,
  gdp: number = 0,
  monetaryTerm: number = 0,
): number {
  // Tariff cost-push — PORT-STUB at baseline (0)
  // Wage growth — PORT-STUB at baseline (0)
  // Commodity/forex/savings/housing/policy/moneySupply — all PORT-STUB 0
  // Fiscal term (W2) and monetary term (W3) are now real; the rest remain neutral.

  const target = INFLATION_BASE_TARGET;

  // 1. Demand-pull (Phillips curve) — two-sided
  // source: inflation.ts
  const uGap = INFLATION_NAIRU - unemploymentPct;
  const unemploymentTerm =
    uGap >= 0 ? uGap * INFLATION_UNEMPLOYMENT_COEFF_UP : uGap * INFLATION_UNEMPLOYMENT_COEFF_DOWN;

  const gGap = gdpGrowthPct - INFLATION_TREND_GDP_GROWTH;
  const gdpTerm = gGap >= 0 ? gGap * INFLATION_GDP_COEFF_UP : gGap * INFLATION_GDP_COEFF_DOWN;

  const fiscalTerm = computeFiscalTerm(surplus, gdp);

  const raw = target + unemploymentTerm + gdpTerm + fiscalTerm + monetaryTerm; // stubs for tariffs/wage/commodity/forex/savings remain 0

  // Inertia smoothing — source: inflation.ts
  const smoothedRaw = INFLATION_INERTIA * previousInflationPct + (1 - INFLATION_INERTIA) * raw;

  // Mean-reversion pull toward target — source: inflation.ts
  const meanReversion = INFLATION_MEAN_REVERSION_COEFF * (target - smoothedRaw);
  const smoothed = smoothedRaw + meanReversion;

  // Per-turn delta clamp — source: inflation.ts
  const delta = smoothed - previousInflationPct;
  const clampedDelta = Math.max(
    -INFLATION_MAX_PER_TURN_DELTA,
    Math.min(INFLATION_MAX_PER_TURN_DELTA, delta),
  );
  const clamped = previousInflationPct + clampedDelta;

  return Math.max(INFLATION_MIN, Math.min(INFLATION_MAX, Math.round(clamped * 100) / 100));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Read a prev-turn nationalMetrics leaf if it is a finite number.
 * Paths match AHDGame src/lib/metricEngine/phase.ts tfpBasket inputs at e364c0495.
 * Absent or non-finite values stay undefined so tfpBasket's orRef fallback applies.
 * Do not invent aliases: only these exact keys are TFP inputs.
 */
function finiteMetricValue(
  metrics: Record<string, { value: number }> | undefined,
  path: string,
): number | undefined {
  const v = metrics?.[path]?.value;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Only exact AHDGame tfpBasket paths (laborForce.ts TFP_METRIC_PATHS). Omit missing keys; do not invent aliases. */
function tfpInputsFromNationalMetrics(
  metrics: Record<string, { value: number }> | undefined,
): TfpBasketInputs {
  const out: TfpBasketInputs = {};
  for (const [field, path] of Object.entries(TFP_METRIC_PATHS) as Array<
    [keyof TfpBasketInputs, string]
  >) {
    const value = finiteMetricValue(metrics, path);
    if (value !== undefined) out[field] = value;
  }
  return out;
}

/**
 * Game advances politicalMetricsDynamics before its metric engine, then reads
 * these four TFP leaves from each region's current board. Native's macro is
 * country-level, so reduce the exact source board conversion with the same
 * population weighting used for its national metrics. R&D and urbanization
 * remain lagged macro roots from nationalMetrics.
 */
function currentPoliticalTfpInputs(world: WorldState, countryId: string): Partial<TfpBasketInputs> {
  const year = Number(world.meta.date.slice(0, 4));
  const fields = [
    ["workforceSkill", TFP_METRIC_PATHS.workforceSkill],
    ["transportEfficiency", TFP_METRIC_PATHS.transportEfficiency],
    ["broadbandAccess", TFP_METRIC_PATHS.broadbandAccess],
    ["powerGridReliability", TFP_METRIC_PATHS.powerGridReliability],
  ] as const;
  const out: Partial<TfpBasketInputs> = {};
  for (const [field, path] of fields) {
    const [category, metricId] = path.split(".");
    if (!category || !metricId) continue;
    let weighted = 0;
    let total = 0;
    for (const region of Object.values(world.regions)) {
      if (region.countryId !== countryId || !(region.population > 0)) continue;
      const board = world.regionalPoliticalMetrics?.[region.id];
      const projection = board?.countryId === countryId
        ? legacyPoliticalHalfFromBoard(board.values, { countryId, year })?.[category]?.[metricId]?.value
        : undefined;
      const regionalValue = typeof projection === "number" && Number.isFinite(projection)
        ? projection
        : world.regionalMetrics?.[region.id]?.[path]?.value;
      if (typeof regionalValue !== "number" || !Number.isFinite(regionalValue)) continue;
      weighted += regionalValue * region.population;
      total += region.population;
    }
    if (total > 0) out[field] = weighted / total;
  }
  return out;
}

interface MacroGrowthContext {
  prevGap: number;
  prevUnempPct: number;
  sectorSignal: number;
  gL: number;
  gK: number;
  hasLabor: boolean;
  earlyGap: number;
  earlyGrowth: number;
  earlyUnemployment: number;
}

// Turn-local scratch only; it is never attached to or serialized with the world.
const pendingTfpGrowth = new WeakMap<WorldState, Map<string, MacroGrowthContext>>();

export const macroCountryTurnPhase: TurnPhase = {
  name: "macroCountryTurn",
  run(world, rng) {
    const pending = new Map<string, MacroGrowthContext>();
    const ids = Object.keys(world.countries).sort();
    for (const id of ids) {
      const country = world.countries[id]!;
      const econ = country.economy;

      // Ensure outputGap exists for pre-v2 worlds that bypassed migration in tests.
      if (!Number.isFinite(econ.outputGap)) econ.outputGap = 0;

      const prevGap = econ.outputGap;
      const prevGrowthPct = econ.growthRate * 100;
      const prevUnempPct = econ.unemploymentRate * 100;
      const prevInflPct = econ.inflationRate * 100;

      // ── Growth via output gap ─────────────────────────────────────
      // THE KEY WIRE (W9): sectorSignal is now the real corporate-revenue
      // growth signal, replacing the random-walk PORT-STUB (previous growth
      // plus RNG shock). Source: src/lib/turn/gdpGrowth.ts
      // computeRealizedRevenueGrowthRate (ported verbatim in
      // corporation/constants.ts) fed by corporationTurn.ts's per-country
      // revenue rollup (world.corpRevenueSnapshots, written earlier this same
      // turn because corporationTurnPhase precedes this phase in registry.ts).
      // Falls back to flat previous growth for countries with no corp data,
      // such as a non-playable country (W9 only seeds playable countries).
      const revenueSnapshot = world.corpRevenueSnapshots?.[id];
      const realizedGrowth = revenueSnapshot
        ? computeRealizedRevenueGrowthRate(revenueSnapshot.current, revenueSnapshot.previous, 1, TURNS_PER_YEAR)
        : null;
      const sectorSignal = clamp(
        realizedGrowth ?? prevGrowthPct,
        SECTOR_SIGNAL_MIN,
        SECTOR_SIGNAL_MAX,
      );
      // Labor force -> potential growth (real laborForce replacing the PORT-STUB).
      // Source: src/lib/metricEngine/potentialGrowth.ts computeLaborForce +
      // potentialGrowth (Solow LEVEL form). Labor participation is 62.5% default;
      // workingAge and militaryService come from demographics flows (per-region).
      // This early macro pass preserves Native's established inflation and
      // fiscal timing. The source political-board TFP correction runs after
      // this turn's board dynamics and replaces only the growth-dependent
      // outputs later in the registry.
      const regionIds = Object.values(world.regions)
        .filter((r) => r.countryId === id)
        .map((r) => r.id);
      let totalLaborForce = 0;
      let prevTotalLaborForce = 0;
      let hasLabor = false;
      for (const rid of regionIds) {
        const region = world.regions[rid];
        if (!region) continue;
        const lf = computeLaborForce(
          (region as unknown as { workingAgePopulation?: number }).workingAgePopulation ?? Math.round((region.population ?? 0) * 0.58),
          (region as unknown as { militaryServicePopulation?: number }).militaryServicePopulation ?? 0,
          NEUTRAL_LABOR_PARTICIPATION,
        );
        // Update live laborForces map (authoritative)
        if ((world as unknown as { laborForces?: Record<string, number> }).laborForces) {
          const prev = (world as unknown as { laborForces: Record<string, number> }).laborForces[rid] ?? lf;
          prevTotalLaborForce += prev;
          (world as unknown as { laborForces: Record<string, number> }).laborForces[rid] = Math.round(lf);
        }
        totalLaborForce += lf;
        hasLabor = true;
      }
      // Annualized labor growth from this turn vs prior total
      const gL = hasLabor && prevTotalLaborForce > 0
        ? annualizedGrowthRate(totalLaborForce, prevTotalLaborForce, TURNS_PER_YEAR)
        : 0;
      // W14: real capital-stock growth, one turn lagged — advanceCapitalStockPhase
      // runs in the tail (after this phase, see registry.ts) and writes
      // world.capitalGrowth for THIS turn, which this read only sees NEXT
      // turn. Same lag shape as the corpRevenueSnapshot sectorSignal above.
      // Falls back to 0 for the first turn or two before the phase has run.
      const gK = world.capitalGrowth?.[id] ?? 0;
      const tfp = tfpBasket(tfpInputsFromNationalMetrics(world.nationalMetrics?.[id]));
      const potential = hasLabor ? potentialGrowth(gL, gK, tfp) : NEUTRAL_GDP_GROWTH;
      const step = advanceOutputGap(prevGap, sectorSignal, potential, TURNS_PER_YEAR);
      const newGrowth = clamp(step.gdpGrowth / 100, GROWTH_RATE_MIN, GROWTH_RATE_MAX);

      // ── Unemployment via Okun's law ───────────────────────────────
      // Formula: source gdpGrowth.ts + registry/economic.ts unemploymentNode
      const targetUnemp = okunTarget(prevUnempPct, step.gdpGrowth, potential);
      // Inertia EMA: source gdpGrowth.ts UNEMPLOYMENT_INERTIA + registry/economic.ts
      const newUnempPctRaw =
        UNEMPLOYMENT_INERTIA * prevUnempPct + (1 - UNEMPLOYMENT_INERTIA) * targetUnemp;
      const newUnempPct = clamp(newUnempPctRaw, UNEMPLOYMENT_MIN, UNEMPLOYMENT_MAX);

      // ── Inflation ─────────────────────────────────────────────────
      // Formula: source budget/inflation.ts calculateInflationWithBreakdown
      // Fiscal term is real: deficit/GDP from budget.surplus/gdp via FISCAL_COEFF_*
      // (source: inflation.ts FISCAL_COEFF_DEFICIT 0.15, FISCAL_COEFF_SURPLUS 0.08).
      // Monetary term (W3) is real for countries with a central bank: rate gap vs
      // neutral, lagged via the 12-turn trailing average, scaled by MONETARY_COEFF_*
      // and dampened by chair scrutiny (source: inflation.ts "2. Monetary policy" +
      // centralBank/constants.ts computeMonetaryTerm). Countries without a bank get 0.
      // Tariffs/wage/commodity/forex/savings/housing/policy/moneySupply remain neutral.
      const budget = world.budgets?.[id];
      const surplus = budget?.surplus ?? 0;
      const gdpForFiscal = budget?.gdp ?? econ.gdp;
      const bank = world.centralBanks?.[id];
      const bankAnchor = CENTRAL_BANK_COUNTRY_ANCHORS[id];
      const monetaryTerm =
        bank && bankAnchor
          ? computeMonetaryTerm(
              bank.primeRate,
              bank.interestRateHistory.map((s) => s.rate),
              bankAnchor.neutralPrimeRate,
              bank.chairInfamy,
            )
          : 0;
      let newInflPct = computeInflation(
        prevInflPct,
        newUnempPct,
        step.gdpGrowth,
        surplus,
        gdpForFiscal,
        monetaryTerm,
      );
      // Small RNG shock for deterministic variation (kept bounded by the
      // per-turn clamp already applied; shock is added after so it stays
      // within overall INFLATION_MIN/MAX).
      const inflationDraw = rng.next();
      const inflShock = (inflationDraw - 0.5) * INFLATION_SHOCK_PCT;
      newInflPct = clamp(
        Math.round((newInflPct + inflShock) * 100) / 100,
        INFLATION_MIN,
        INFLATION_MAX,
      );

      // ── GDP compounding ───────────────────────────────────────────
      // Weekly compounding from annualized growthRate:
      // gdp *= 1 + growthRate / WEEKS_PER_YEAR
      // Placeholder used WEEKS_PER_YEAR=52; mainline annualizes by TURNS_PER_YEAR=48
      // but compounding interval is the game turn (1 week). Cite placeholder +
      // constants/turnTime.ts.
      const gdpGrowthFactor = 1 + newGrowth / WEEKS_PER_YEAR;
      const newGdp = econ.gdp * gdpGrowthFactor;

      // ── Commit ────────────────────────────────────────────────────
      econ.outputGap = Math.round(step.gap * 1000) / 1000;
      econ.growthRate = Math.round(newGrowth * 10000) / 10000;
      econ.unemploymentRate = Math.round((newUnempPct / 100) * 10000) / 10000;
      econ.inflationRate = Math.round((newInflPct / 100) * 10000) / 10000;
      econ.gdp = Number.isFinite(newGdp) && newGdp > 0 ? Math.round(newGdp * 100) / 100 : econ.gdp;
      pending.set(id, {
        prevGap,
        prevUnempPct,
        sectorSignal,
        gL,
        gK,
        hasLabor,
        earlyGap: econ.outputGap,
        earlyGrowth: econ.growthRate,
        earlyUnemployment: econ.unemploymentRate,
      });
    }
    pendingTfpGrowth.set(world, pending);
  },
};

/** Apply Game's same-turn political-board TFP after its dynamics phase. */
export const sourceTfpGrowthPhase: TurnPhase = {
  name: "sourceTfpGrowth",
  run(world) {
    const pending = pendingTfpGrowth.get(world);
    if (!pending) return;
    for (const countryId of Object.keys(world.countries).sort()) {
      const context = pending.get(countryId);
      const country = world.countries[countryId];
      if (!context || !country) continue;
      const inputs = {
        ...tfpInputsFromNationalMetrics(world.nationalMetrics?.[countryId]),
        ...currentPoliticalTfpInputs(world, countryId),
      };
      const tfp = tfpBasket(inputs);
      const potential = context.hasLabor
        ? potentialGrowth(context.gL, context.gK, tfp)
        : NEUTRAL_GDP_GROWTH;
      const step = advanceOutputGap(context.prevGap, context.sectorSignal, potential, TURNS_PER_YEAR);
      const newGrowth = clamp(step.gdpGrowth / 100, GROWTH_RATE_MIN, GROWTH_RATE_MAX);
      const targetUnemp = okunTarget(context.prevUnempPct, step.gdpGrowth, potential);
      const newUnempPct = clamp(
        UNEMPLOYMENT_INERTIA * context.prevUnempPct + (1 - UNEMPLOYMENT_INERTIA) * targetUnemp,
        UNEMPLOYMENT_MIN,
        UNEMPLOYMENT_MAX,
      );
      // Preserve later-turn phase effects (for example a crisis GDP shock)
      // by applying only the source TFP delta from the early macro result.
      const growthDelta = newGrowth - context.earlyGrowth;
      const unemploymentDelta = newUnempPct / 100 - context.earlyUnemployment;
      const gapDelta = step.gap - context.earlyGap;
      const correctedGrowth = clamp(
        country.economy.growthRate + growthDelta,
        GROWTH_RATE_MIN,
        GROWTH_RATE_MAX,
      );
      const correctedUnemployment = clamp(
        country.economy.unemploymentRate + unemploymentDelta,
        UNEMPLOYMENT_MIN / 100,
        UNEMPLOYMENT_MAX / 100,
      );
      const gdpFactor = (1 + newGrowth / WEEKS_PER_YEAR) / (1 + context.earlyGrowth / WEEKS_PER_YEAR);
      const correctedGdp = country.economy.gdp * gdpFactor;
      country.economy.outputGap = Math.round((country.economy.outputGap + gapDelta) * 1000) / 1000;
      country.economy.growthRate = Math.round(correctedGrowth * 10000) / 10000;
      country.economy.unemploymentRate = Math.round(correctedUnemployment * 10000) / 10000;
      country.economy.gdp = Number.isFinite(correctedGdp) && correctedGdp > 0
        ? Math.round(correctedGdp * 100) / 100
        : country.economy.gdp;
    }
    pendingTfpGrowth.delete(world);
  },
};

// Back-compat export — deprecated alias for the rename.
export const macroEconomyPhase = macroCountryTurnPhase;
