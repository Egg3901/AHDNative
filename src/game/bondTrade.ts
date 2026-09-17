import type { BondListing, BondMarketView } from './bondMarket';

/**
 * Quote the existing neutral-fee engine trade, rounding the full order once.
 * Since #306 the engine settles every issue in its own denomination (home
 * cash for home-currency issues, the personal foreign balance otherwise), so
 * foreign tickets are quoted against the listing's availableBalance instead
 * of being blocked. executeAction stays authoritative.
 */
export function quoteBondTrade(side: 'buy' | 'sell', bond: BondListing, units: number, market: BondMarketView) {
  const notional = Math.round(units * bond.faceValue * bond.marketPrice * 100) / 100;
  const hint = market[side];
  const shortBalance = bond.settlesInHomeCash
    ? 'Not enough cash for this order.'
    : `Not enough ${bond.currency} balance for this order.`;
  const error = !Number.isSafeInteger(units) || units < 1 || !Number.isFinite(notional) || notional < 0
    ? 'Enter a positive whole number of units.'
    : hint.disabledReason ?? (bond.matured ? 'This issue has matured.'
    : bond.defaulted ? 'This issue is in default.'
    : side === 'buy' && units > bond.publicFloat ? `Only ${bond.publicFloat} units are available.`
    : side === 'buy' && notional > bond.availableBalance ? shortBalance
    : side === 'sell' && units > bond.playerUnits ? `You own ${bond.playerUnits} units.` : undefined);
  return { notional, cost: hint.cost, available: !error, error };
}
