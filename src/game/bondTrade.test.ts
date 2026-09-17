import { describe, expect, it } from 'vitest';
import { quoteBondTrade } from './bondTrade';
import type { BondListing, BondMarketView } from './bondMarket';

function listing(overrides: Partial<BondListing> = {}): BondListing {
  return {
    id: 'bond-61-UK', countryId: 'UK', issuerName: 'United Kingdom', currency: 'GBP',
    faceValue: 1000, marketPrice: 1, couponRate: 4, maturityTurn: 146,
    publicFloat: 20, playerUnits: 1, matured: false, defaulted: false,
    domestic: false, settlesInHomeCash: false, availableBalance: 5000,
    ...overrides,
  };
}
function view(overrides: Partial<BondMarketView> = {}): BondMarketView {
  return {
    turn: 98, date: '1954-11-23', playerCountryId: 'US', playerCash: 10000,
    currency: 'USD', balances: { GBP: 5000 }, buy: { cost: 1 }, sell: { cost: 1 },
    bonds: [],
    ...overrides,
  };
}

describe('quoteBondTrade denomination settlement (#306)', () => {
  it('approves a foreign buy the denomination balance covers', () => {
    const quote = quoteBondTrade('buy', listing(), 2, view());
    expect(quote).toMatchObject({ notional: 2000, available: true });
    expect(quote.error).toBeUndefined();
  });
  it('refuses a foreign buy above the denomination balance with the currency named', () => {
    const quote = quoteBondTrade('buy', listing(), 6, view());
    expect(quote.available).toBe(false);
    expect(quote.error).toBe('Not enough GBP balance for this order.');
  });
  it('refuses a home-currency buy above cash with the cash message', () => {
    const bond = listing({ currency: 'USD', domestic: true, settlesInHomeCash: true, availableBalance: 10000 });
    const quote = quoteBondTrade('buy', bond, 11, view());
    expect(quote.available).toBe(false);
    expect(quote.error).toBe('Not enough cash for this order.');
  });
  it('approves a foreign sell from holdings without gating on the balance', () => {
    const quote = quoteBondTrade('sell', listing({ availableBalance: 0 }), 1, view());
    expect(quote.available).toBe(true);
  });
  it('refuses a sell above the holding', () => {
    const quote = quoteBondTrade('sell', listing(), 2, view());
    expect(quote.available).toBe(false);
    expect(quote.error).toBe('You own 1 units.');
  });
  it('reports the public float before the balance', () => {
    const quote = quoteBondTrade('buy', listing({ publicFloat: 1, availableBalance: 0 }), 2, view());
    expect(quote.error).toBe('Only 1 units are available.');
  });
  it('rejects non-positive-whole quantities', () => {
    expect(quoteBondTrade('buy', listing(), 1.5, view()).error).toBe('Enter a positive whole number of units.');
    expect(quoteBondTrade('buy', listing(), 0, view()).error).toBe('Enter a positive whole number of units.');
  });
  it('keeps matured/defaulted and action-hint gates ahead of balance checks', () => {
    expect(quoteBondTrade('buy', listing({ matured: true }), 1, view()).error).toBe('This issue has matured.');
    expect(quoteBondTrade('buy', listing({ defaulted: true }), 1, view()).error).toBe('This issue is in default.');
    const held = view({ buy: { cost: 1, disabledReason: 'Not enough action points.' } });
    expect(quoteBondTrade('buy', listing(), 1, held).error).toBe('Not enough action points.');
  });
});
