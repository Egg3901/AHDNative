import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { BondMarketPanel } from './BondMarketPanel';
import type { BondMarketView } from '../game/bondMarket';

const market: BondMarketView = {
  turn: 98, date: '1954-11-23', playerCountryId: 'US', playerCash: 10000, currency: 'USD', buy: { cost: 1 }, sell: { cost: 1 },
  bonds: [{ id: 'bond-60-US', countryId: 'US', issuerName: 'United States', currency: 'USD', faceValue: 1000,
    marketPrice: 1, couponRate: 3.75, maturityTurn: 108, publicFloat: 20, playerUnits: 1,
    matured: false, defaulted: false, domestic: true }],
};
it('quotes whole units and dispatches the selected issue, while rejecting overselling and decimals', async () => {
  const user = userEvent.setup(); const onAction = vi.fn();
  render(<BondMarketPanel market={market} busy={false} onAction={onAction} onSelect={vi.fn()} />);
  await user.clear(screen.getByLabelText('Bond units'));
  await user.type(screen.getByLabelText('Bond units'), '2');
  expect(screen.getByRole('button', { name: 'Sell bond units' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Buy bond units' }));
  expect(onAction).toHaveBeenCalledWith('buyBond', { bondId: 'bond-60-US', units: 2 });
  await user.clear(screen.getByLabelText('Bond units'));
  await user.type(screen.getByLabelText('Bond units'), '1.5');
  expect(screen.getByRole('button', { name: 'Buy bond units' })).toBeDisabled();
});
it('explains foreign settlement and blocks both trade controls', () => {
  render(<BondMarketPanel market={{ ...market, bonds: [{ ...market.bonds[0]!, domestic: false }] }} busy={false} onAction={vi.fn()} onSelect={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Buy bond units' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Sell bond units' })).toBeDisabled();
  expect(screen.getAllByText('Foreign bond trading is unavailable in singleplayer.').length).toBeGreaterThan(0);
});
it('shows the source-grounded yield, coupon and ownership for the selected issue', () => {
  render(<BondMarketPanel market={market} busy={false} onAction={vi.fn()} onSelect={vi.fn()} />);
  // 3.75% coupon at par with 10 turns left yields 3.75% (engine YTM formula).
  expect(screen.getByText('Yield to maturity').parentElement).toHaveTextContent('3.75%');
  expect(screen.getByText('Annual coupon per unit').parentElement).toHaveTextContent('$37.50');
  expect(screen.getByText('Price vs par').parentElement).toHaveTextContent('At par');
  expect(screen.getByRole('img', { name: /you own 1 of 21 outstanding units/i })).toBeInTheDocument();
  expect(screen.getByText('Sovereign')).toBeInTheDocument();
  expect(screen.getByText('Outstanding')).toBeInTheDocument();
});
it('compares outstanding issues with scaled yield bars and selects on tap', async () => {
  const user = userEvent.setup(); const onSelect = vi.fn();
  const multi: BondMarketView = { ...market, bonds: [...market.bonds,
    { id: 'bond-61-US', countryId: 'US', issuerName: 'United States Second', currency: 'USD', faceValue: 1000,
      marketPrice: 0.9, couponRate: 5, maturityTurn: 146, publicFloat: 40, playerUnits: 0,
      matured: false, defaulted: false, domestic: true }] };
  render(<BondMarketPanel market={multi} busy={false} onAction={vi.fn()} onSelect={onSelect} />);
  expect(screen.getByText('Compare issues')).toBeInTheDocument();
  const discountBar = screen.getByTestId('bond-ytm-bar-bond-61-US');
  const parBar = screen.getByTestId('bond-ytm-bar-bond-60-US');
  expect(Number.parseFloat(discountBar.style.width)).toBeGreaterThan(Number.parseFloat(parBar.style.width));
  await user.click(screen.getByRole('button', { name: /select united states second/i }));
  expect(onSelect).toHaveBeenCalledWith('bond-61-US');
});
it('dashes the yield and bar for a defaulted issue instead of plotting a recovery artifact', () => {
  const defaulted: BondMarketView = { ...market, bonds: [
    { ...market.bonds[0]!, defaulted: true, marketPrice: 0.1 },
    { ...market.bonds[0]!, id: 'bond-61-US', issuerName: 'United States Second', currency: 'USD',
      marketPrice: 0.9, couponRate: 5, maturityTurn: 146, publicFloat: 40, playerUnits: 0 },
  ] };
  render(<BondMarketPanel market={defaulted} busy={false} onAction={vi.fn()} onSelect={vi.fn()} selectedId="bond-60-US" />);
  expect(screen.getByText('Yield to maturity').parentElement).toHaveTextContent('—');
  expect(screen.getAllByText('Defaulted').length).toBeGreaterThan(0);
  expect(screen.queryByTestId('bond-ytm-bar-bond-60-US')).not.toBeInTheDocument();
});
it('omits the comparison when a single issue is outstanding', () => {
  render(<BondMarketPanel market={market} busy={false} onAction={vi.fn()} onSelect={vi.fn()} />);
  expect(screen.queryByText('Compare issues')).not.toBeInTheDocument();
});
