import type { WorldState } from "../types.js";

/**
 * Native equivalent of AHDGame `marketPoolQuotes.ts` and the opening pool
 * seed in migration `2026-09-03-bond-market-pools.ts`. Native has no persisted
 * M2 snapshots, so its recorded `centralBank.externalBroadMoney` aggregate is
 * the currency M2 input; the source 5% share seeds both opening cash and the
 * liquidity target. Books are lazy to preserve byte-stable saves until a bond
 * flow needs one.
 */
export const BOND_POOL_M2_SHARE = 0.05;
export const BOND_POOL_HALF_SPREAD_CORPORATE = 0.02;
export const BOND_POOL_CASH_SKEW_RATE = 0.05;
export const BOND_POOL_CASH_SKEW_CAP = 0.03;
export const BOND_POOL_SKEW_MIN = -0.01;
export const BOND_POOL_SKEW_MAX = 0.08;

export interface NativeBondPoolQuote {
  mid: number;
  bid: number;
  ask: number;
  cashSkew: number;
  halfSpread: number;
  appetiteSkew?: number;
}

export function nativeBondPoolForCurrency(world: WorldState, currency: string, create = false) {
  const prior = world.bondMarketPools?.[currency];
  if (prior) return prior;
  let m2Local = 0;
  for (const [countryId, bank] of Object.entries(world.centralBanks)) {
    const code = world.budgets[countryId]?.currencyCode ?? world.exchangeRates[countryId]?.currencyCode ?? "USD";
    if (code === currency && Number.isFinite(bank.externalBroadMoney) && bank.externalBroadMoney > 0) {
      m2Local += bank.externalBroadMoney;
    }
  }
  const targetCashLocal = Math.round(m2Local * BOND_POOL_M2_SHARE * 100) / 100;
  const seeded = {
    cashLocal: targetCashLocal,
    targetCashLocal,
    m2Local,
    liquidityTargetLocal: targetCashLocal,
    lifetime: {} as Record<string, number>,
  };
  if (create) (world.bondMarketPools ??= {})[currency] = seeded;
  return seeded;
}

/** AHDGame `quoteBondPrices`, corporation issuer branch, rounded to four dp. */
export function quoteNativeCorporateBondPool(input: {
  marketPrice: number;
  cashLocal: number;
  targetCashLocal: number;
  defaulted?: boolean;
}): NativeBondPoolQuote {
  const mid = Number.isFinite(input.marketPrice) && input.marketPrice > 0 ? input.marketPrice : 0;
  if (input.defaulted || mid <= 0) return { mid, bid: mid, ask: mid, cashSkew: 0, halfSpread: 0 };
  const cash = Number.isFinite(input.cashLocal) && input.cashLocal > 0 ? input.cashLocal : 0;
  const target = Number.isFinite(input.targetCashLocal) && input.targetCashLocal > 0 ? input.targetCashLocal : 0;
  const shortfallShare = target > 0 ? Math.max(-1, Math.min(1, (target - cash) / target)) : 0;
  const cashSkew = Math.max(-BOND_POOL_CASH_SKEW_CAP, Math.min(BOND_POOL_CASH_SKEW_CAP, shortfallShare * BOND_POOL_CASH_SKEW_RATE));
  const skew = Math.max(BOND_POOL_SKEW_MIN, Math.min(BOND_POOL_SKEW_MAX, cashSkew));
  const halfSpread = BOND_POOL_HALF_SPREAD_CORPORATE;
  const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
  const bid = round4(Math.max(0.01, mid * (1 - halfSpread - skew)));
  const ask = round4(Math.max(bid, mid * (1 + halfSpread - skew)));
  return { mid, bid, ask, cashSkew, halfSpread };
}

/** AHDGame marketPoolQuotes.ts quote for a source index-fund bond purchase. */
export function quoteNativeBondPool(input: {
  issuerType: "sovereign" | "corporation";
  marketPrice: number;
  cashLocal: number;
  targetCashLocal: number;
  appetite?: number;
  defaulted?: boolean;
}): NativeBondPoolQuote {
  const mid = Number.isFinite(input.marketPrice) && input.marketPrice > 0 ? input.marketPrice : 0;
  if (input.defaulted || mid <= 0) return { mid, bid: mid, ask: mid, cashSkew: 0, halfSpread: 0, appetiteSkew: 0 };
  const cash = Number.isFinite(input.cashLocal) && input.cashLocal > 0 ? input.cashLocal : 0;
  const target = Number.isFinite(input.targetCashLocal) && input.targetCashLocal > 0 ? input.targetCashLocal : 0;
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const shortfall = target > 0 ? clamp((target - cash) / target, -1, 1) : 0;
  const cashSkew = clamp(shortfall * BOND_POOL_CASH_SKEW_RATE, -BOND_POOL_CASH_SKEW_CAP, BOND_POOL_CASH_SKEW_CAP);
  const appetite = Number.isFinite(input.appetite) ? input.appetite! : 1;
  const appetiteSkew = input.issuerType === "sovereign"
    ? clamp((1 - appetite) * 0.05, -0.01, 0.05)
    : 0;
  const skew = clamp(cashSkew + appetiteSkew, BOND_POOL_SKEW_MIN, BOND_POOL_SKEW_MAX);
  const halfSpread = input.issuerType === "sovereign" ? 0.01 : 0.02;
  const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
  const bid = round4(Math.max(0.01, mid * (1 - halfSpread - skew)));
  const ask = round4(Math.max(bid, mid * (1 + halfSpread - skew)));
  return { mid, bid, ask, cashSkew, halfSpread, appetiteSkew };
}

/** Local-currency units per USD anchor from the current Native FX table. */
export function nativeCurrencyRate(world: WorldState, currency: string): number | undefined {
  const matching = Object.values(world.exchangeRates).find((row) => row.currencyCode === currency);
  const rate = matching?.rate;
  if (Number.isFinite(rate) && rate! > 0) return rate!;
  return currency === "USD" && matching === undefined ? 1 : undefined;
}
