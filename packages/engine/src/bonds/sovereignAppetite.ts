import type { WorldState } from "../types.js";
import { BOND_UNIT_FACE_VALUE, calculateQuarterlyIssuanceAmount } from "./constants.js";
import { nativeBondPoolForCurrency } from "./bondMarketPool.js";
import type { IndexFundRecord } from "../indexFunds/types.js";

/** Source `sovereignDefault/marketDemand.ts` snapshot in its native units. */
export interface SovereignMarketDemandInput {
  debtToGdp: number;
  inflationRate: number;
  trust: number;
  sovereignCouponRate: number;
  fxDepreciationRate10t: number;
  turnsSinceLastDefault: number | null;
  entityHoldings: number;
  requiredIssuance: number;
}

const BASE_DEMAND = 1.2;
const DGDP_PENALTY_FLOOR = 0.6;
const DGDP_PENALTY_RATE = 0.3;
const DGDP_CLIFF_FLOOR = 2.0;
const DGDP_CLIFF_RATE = 0.4;
const INFLATION_PENALTY_FLOOR = 0.05;
const INFLATION_PENALTY_RATE = 2.0;
const FX_DEPREC_PENALTY_RATE = 1.5;
const DEFAULT_SCAR_DURATION = 100;
const DEFAULT_SCAR_PER_TURN = 0.01;
const TRUST_MODIFIER_RATE = 0.4;
const COUPON_PREMIUM_RATE = 5.0;
const GLOBAL_BENCHMARK_RATE = 0.04;
const ENTITY_DEMAND_WEIGHT = 0.5;
const ENTITY_DEMAND_CAP = 0.4;

/** Exact pinned Game computeMarketDemand result (fff42a48a7dd7fd50cbe01124c8164cf9b7f6cb8). */
export function computeSovereignMarketDemand(input: SovereignMarketDemandInput): number {
  const dgdpPenalty = input.debtToGdp > DGDP_PENALTY_FLOOR
    ? -(input.debtToGdp - DGDP_PENALTY_FLOOR) * DGDP_PENALTY_RATE : 0;
  const dgdpCliff = input.debtToGdp > DGDP_CLIFF_FLOOR
    ? -(input.debtToGdp - DGDP_CLIFF_FLOOR) * DGDP_CLIFF_RATE : 0;
  const inflationPenalty = input.inflationRate > INFLATION_PENALTY_FLOOR
    ? -(input.inflationRate - INFLATION_PENALTY_FLOOR) * INFLATION_PENALTY_RATE : 0;
  const fxPenalty = input.fxDepreciationRate10t > 0
    ? -input.fxDepreciationRate10t * FX_DEPREC_PENALTY_RATE : 0;
  const scarPenalty = input.turnsSinceLastDefault !== null && input.turnsSinceLastDefault < DEFAULT_SCAR_DURATION
    ? -(DEFAULT_SCAR_DURATION - input.turnsSinceLastDefault) * DEFAULT_SCAR_PER_TURN : 0;
  const trustModifier = (input.trust - 0.5) * TRUST_MODIFIER_RATE;
  const yieldPremium = input.sovereignCouponRate / 100 - GLOBAL_BENCHMARK_RATE;
  const couponContribution = yieldPremium * COUPON_PREMIUM_RATE;
  const entityContributionRaw = input.requiredIssuance > 0
    ? (input.entityHoldings / input.requiredIssuance) * ENTITY_DEMAND_WEIGHT : 0;
  const entityContribution = Math.min(entityContributionRaw, ENTITY_DEMAND_CAP);
  return Math.max(0, BASE_DEMAND + dgdpPenalty + dgdpCliff + inflationPenalty + fxPenalty +
    scarPenalty + trustModifier + couponContribution + entityContribution);
}

const SOVEREIGN_RATING_THRESHOLDS: ReadonlyArray<readonly [number, WorldState["budgets"][string]["creditRating"]]> = [
  [0.6, "AAA"], [0.8, "AA"], [1.0, "A"], [1.2, "BBB"], [1.5, "BB"], [2.5, "B"], [Infinity, "CCC"],
];

/** Source budget/debt.ts debt rating ladder; no risk-anchor rescale is applied. */
export function sourceSovereignCreditRating(debtToGdpRatio: number): WorldState["budgets"][string]["creditRating"] {
  const ratio = Math.max(0, debtToGdpRatio);
  return SOVEREIGN_RATING_THRESHOLDS.find(([upper]) => ratio <= upper)![1];
}

function fxDepreciation10t(world: WorldState, countryId: string): number {
  const row = world.exchangeRates[countryId];
  if (!row?.rateHistory?.length) return 0;
  const lookback = world.meta.turn - 10;
  const sorted = [...row.rateHistory].sort((a, b) => a.turn - b.turn);
  const past = sorted.find((point) => point.turn >= lookback) ?? sorted[0];
  if (!past || past.rate === 0) return 0;
  return Math.max(0, (row.rate - past.rate) / past.rate);
}

function trustFor(world: WorldState, countryId: string): number {
  // Game snapshotLoader averages the political-board `values` field. The
  // similarly named regionalMetrics table is a separate policy-effect cache.
  const rows = Object.values(world.regions)
    .filter((region) => region.countryId === countryId && world.regionalPoliticalMetrics?.[region.id] !== undefined)
    .map((region) => {
      const value = world.regionalPoliticalMetrics?.[region.id]?.values["governance.integrity"];
      return typeof value === "number" && Number.isFinite(value) ? value : 50;
    });
  if (!rows.length) return 0.5;
  return Math.max(0, Math.min(1, rows.reduce((sum, value) => sum + value, 0) / rows.length / 100));
}

function requiredIssuance(world: WorldState, countryId: string): number {
  const budget = world.budgets[countryId];
  if (!budget) return 0;
  const deficitAmount = calculateQuarterlyIssuanceAmount(Math.max(0, -budget.surplus));
  const turn = world.meta.turn;
  const active = Object.values(world.bonds).filter((bond) => bond.issuerType === "sovereign" &&
    bond.countryId === countryId && !bond.matured && !bond.defaulted);
  const maturing = active.filter((bond) => bond.maturityTurn >= turn && bond.maturityTurn < turn + 12);
  const maturingFace = maturing.reduce((sum, bond) => sum + (bond.totalIssued ?? 0), 0);
  const activeFace = active.reduce((sum, bond) => sum + (bond.totalIssued ?? 0), 0);
  const principal = budget.debt.principal;
  const rollover = Math.floor(Math.min(maturingFace, Math.max(0, principal - (activeFace - maturingFace))) / BOND_UNIT_FACE_VALUE) * BOND_UNIT_FACE_VALUE;
  return deficitAmount + rollover;
}

function entityHoldings(world: WorldState, countryId: string): number {
  return Object.values(world.bonds).filter((bond) => bond.issuerType === "sovereign" && bond.countryId === countryId && !bond.matured && !bond.defaulted)
    .reduce((total, bond) => total + bond.holders.reduce((sum, holder) => sum + Math.max(0, holder.units), 0) * BOND_UNIT_FACE_VALUE, 0);
}

function sovereignCouponRate(world: WorldState, countryId: string): number {
  const prime = world.centralBanks[countryId]?.primeRate;
  const budget = world.budgets[countryId];
  if (!Number.isFinite(prime) || !budget) return 0;
  const spreads = { AAA: 0, AA: 0.5, A: 1.5, BBB: 3, BB: 5, B: 8, CCC: 12 } as const;
  return Math.round((prime! + spreads[budget.creditRating]) * 100) / 100;
}

/** Builds the source market-demand inputs from actual Native world producers. */
export function sovereignDemandForCountry(world: WorldState, countryId: string): number | undefined {
  const budget = world.budgets[countryId];
  if (!budget) return undefined;
  const gdp = budget.gdp;
  const debtToGdp = budget.debtToGdpRatio !== undefined && Number.isFinite(budget.debtToGdpRatio)
    ? budget.debtToGdpRatio
    : gdp > 0 ? budget.debt.principal / gdp : 0;
  const exchange = world.exchangeRates[countryId];
  const currency = budget.currencyCode || exchange?.currencyCode || "USD";
  const entity = entityHoldings(world, countryId);
  const issuance = requiredIssuance(world, countryId);
  // Native has no sovereign-default event clock, IMF issuer or imperial/corporate bond holders.
  // An absent clock is the source's never-defaulted state; only modeled player/fund holders count.
  const demand = computeSovereignMarketDemand({
    debtToGdp,
    // Game snapshotLoader reads only federalBudget.economicFactors and stores
    // its percentage value as a fraction at the market-demand seam.
    inflationRate: budget.economicFactors.inflationRate / 100,
    trust: trustFor(world, countryId),
    sovereignCouponRate: sovereignCouponRate(world, countryId),
    fxDepreciationRate10t: fxDepreciation10t(world, countryId),
    turnsSinceLastDefault: null,
    entityHoldings: entity,
    requiredIssuance: issuance,
  });
  return Number.isFinite(demand) ? demand : undefined;
}

/** Refreshes source-like rating and appetite snapshots before fund asset execution. */
export function refreshNativeSovereignAppetite(world: WorldState): void {
  for (const budget of Object.values(world.budgets)) {
    const gdp = budget.gdp;
    if (gdp > 0 && Number.isFinite(gdp) && Number.isFinite(budget.debt.principal)) {
      budget.debtToGdpRatio = Math.max(0, budget.debt.principal / gdp);
      budget.creditRating = sourceSovereignCreditRating(budget.debtToGdpRatio);
    }
  }
  for (const [currency, pool] of Object.entries(world.bondMarketPools ?? {})) {
    const appetiteByCountry: Record<string, number> = {};
    for (const budget of Object.values(world.budgets)) {
      const code = budget.currencyCode || world.exchangeRates[budget.countryId]?.currencyCode;
      if (code !== currency) continue;
      const demand = sovereignDemandForCountry(world, budget.countryId);
      if (demand !== undefined) appetiteByCountry[budget.countryId] = demand;
    }
    pool.appetiteByCountry = appetiteByCountry;
  }
}

/** Seed the actual currency pools a live source bond-fund mandate can quote, then publish demand. */
export function prepareNativeSovereignMarket(world: WorldState, funds: readonly IndexFundRecord[]): void {
  const bondFunds = funds.filter((fund) => fund.status === "active" && fund.bondUniverse);
  if (bondFunds.length === 0) return;
  const currencies = new Set<string>();
  for (const fund of bondFunds) {
    if (fund.currencyCode) currencies.add(fund.currencyCode);
    const homeCountry = fund.countryId ?? Object.entries(world.exchangeRates).find(([, row]) => row.currencyCode === fund.currencyCode)?.[0];
    for (const bond of Object.values(world.bonds)) {
      if (bond.issuerType !== fund.bondUniverse!.issuerType || bond.matured || bond.defaulted || bond.publicFloat <= 0) continue;
      if (fund.bondUniverse!.homeOnly && bond.countryId !== homeCountry) continue;
      if (bond.currencyCode) currencies.add(bond.currencyCode);
    }
  }
  for (const currency of currencies) nativeBondPoolForCurrency(world, currency, true);
  refreshNativeSovereignAppetite(world);
}
