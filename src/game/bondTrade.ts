import type { BondListing, BondMarketView } from './bondMarket';

/** Quote the existing neutral-fee engine trade, rounding the full order once. */
export function quoteBondTrade(side: 'buy' | 'sell', bond: BondListing, units: number, market: BondMarketView) {
  const notional = Math.round(units * bond.faceValue * bond.marketPrice * 100) / 100;
  const hint = market[side];
  const error = !Number.isSafeInteger(units) || units < 1 || !Number.isFinite(notional) || notional < 0
    ? 'Enter a positive whole number of units.'
    : hint.disabledReason ?? (bond.matured ? 'This issue has matured.'
    : bond.defaulted ? 'This issue is in default.'
    : !bond.domestic ? 'Foreign bond trading is unavailable in singleplayer.'
    : side === 'buy' && units > bond.publicFloat ? `Only ${bond.publicFloat} units are available.`
    : side === 'buy' && notional > market.playerCash ? 'Not enough cash for this order.'
    : side === 'sell' && units > bond.playerUnits ? `You own ${bond.playerUnits} units.` : undefined);
  return { notional, cost: hint.cost, available: !error, error };
}
