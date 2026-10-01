import { describe, expect, it } from 'vitest';
import type { WorldState } from '@ahdclient/engine';
import { projectBondMarket } from './bondMarket';

function world(overrides: Record<string, unknown> = {}): WorldState {
  return {
    meta: { turn: 98, date: '1954-11-23' },
    player: {
      countryId: 'US', cash: 10000, currencyBalances: { personal: { GBP: 5000 } },
      actions: 10, actionCooldowns: {}, donorBaseLevel: 0, politicalInfluence: 0, favorability: {},
    },
    budgets: { US: { currencyCode: 'USD' }, UK: { currencyCode: 'GBP' } },
    exchangeRates: {},
    countries: { US: { name: 'United States' }, UK: { name: 'United Kingdom' } },
    bonds: {
      'bond-60-US': {
        id: 'bond-60-US', issuerType: 'sovereign', countryId: 'US', issuerName: 'United States', currencyCode: 'USD',
        faceValue: 1000, marketPrice: 1, couponRate: 3.75, maturityTurn: 108,
        publicFloat: 20, holders: [], matured: false, defaulted: false,
      },
      'bond-61-UK': {
        id: 'bond-61-UK', issuerType: 'sovereign', countryId: 'UK', issuerName: 'United Kingdom', currencyCode: 'GBP',
        faceValue: 1000, marketPrice: 1, couponRate: 4, maturityTurn: 146,
        publicFloat: 20, holders: [{ holderId: 'player', units: 1 }], matured: false, defaulted: false,
      },
    },
    ...overrides,
  } as unknown as WorldState;
}

describe('projectBondMarket denomination balances (#306)', () => {
  it('exposes the settling balance per issue: home cash or the foreign personal balance', () => {
    const market = projectBondMarket(world());
    const home = market.bonds.find(b => b.id === 'bond-60-US')!;
    const foreign = market.bonds.find(b => b.id === 'bond-61-UK')!;
    expect(home).toMatchObject({ currency: 'USD', settlesInHomeCash: true, availableBalance: 10000 });
    expect(foreign).toMatchObject({ currency: 'GBP', settlesInHomeCash: false, availableBalance: 5000, playerUnits: 1 });
    expect(market.balances).toEqual({ GBP: 5000 });
  });
  it('resolves a legacy empty code to the issuing country currency, like the engine coupon path', () => {
    const base = world();
    (base.bonds['bond-61-UK'] as { currencyCode: string }).currencyCode = '';
    const market = projectBondMarket(base);
    const foreign = market.bonds.find(b => b.id === 'bond-61-UK')!;
    expect(foreign).toMatchObject({ currency: 'GBP', settlesInHomeCash: false, availableBalance: 5000 });
  });
  it('falls back to USD for an unknown issuing country, settling in home cash for a US player', () => {
    const base = world();
    base.bonds['bond-61-UK'] = {
      ...(base.bonds['bond-61-UK'] as object),
      countryId: 'XX', issuerName: 'Unknown', currencyCode: '',
    } as never;
    const market = projectBondMarket(base);
    const fallback = market.bonds.find(b => b.id === 'bond-61-UK')!;
    expect(fallback).toMatchObject({ currency: 'USD', settlesInHomeCash: true, availableBalance: 10000 });
  });
  it('reports a zero foreign balance instead of blocking the projection', () => {
    const base = world();
    (base.player as { currencyBalances?: unknown }).currencyBalances = undefined;
    const market = projectBondMarket(base);
    expect(market.balances).toEqual({});
    expect(market.bonds.find(b => b.id === 'bond-61-UK')).toMatchObject({ availableBalance: 0 });
  });
  it('copies balances so panel reads cannot mutate the world', () => {
    const base = world();
    const market = projectBondMarket(base);
    const balances = market.balances;
    expect(balances).toBeDefined();
    balances!['GBP'] = 0;
    expect((base.player as { currencyBalances: { personal: Record<string, number> } }).currencyBalances.personal['GBP']).toBe(5000);
  });

  it('projects corporate issuer identity and authored company name instead of country name', () => {
    const base = world({
      corporations: { 'US-media': { id: 'US-media', name: 'Daily Media' } },
      bonds: {
        'cbond-98-US-media': {
          id: 'cbond-98-US-media', issuerType: 'corporation', corporationId: 'US-media',
          countryId: 'US', issuerName: 'US-media', currencyCode: 'USD', faceValue: 1000,
          marketPrice: 1, couponRate: 5, maturityTurn: 338, issuedAtTurn: 98,
          publicFloat: 20, holders: [], matured: false, defaulted: false,
        },
      },
    });
    expect(projectBondMarket(base).bonds[0]).toMatchObject({
      issuerType: 'corporation', corporationId: 'US-media', issuerName: 'Daily Media',
      canBuyback: false,
    });
  });
  it('exposes issuer buyback only when the player is the active CEO', () => {
    const base = world({
      corporations: { 'US-media': { id: 'US-media', name: 'Daily Media', ceoType: 'player', ceoId: 'player', ceoVacant: false } },
      bonds: {
        'cbond-98-US-media': { id: 'cbond-98-US-media', issuerType: 'corporation', corporationId: 'US-media', countryId: 'US', issuerName: 'Daily Media', currencyCode: 'USD', faceValue: 1000, marketPrice: 1, couponRate: 5, maturityTurn: 338, issuedAtTurn: 98, publicFloat: 20, holders: [], matured: false, defaulted: false },
      },
    });
    expect(projectBondMarket(base).bonds[0]?.canBuyback).toBe(true);
    base.corporations['US-media']!.ceoVacant = true;
    expect(projectBondMarket(base).bonds[0]?.canBuyback).toBe(false);
  });
});
