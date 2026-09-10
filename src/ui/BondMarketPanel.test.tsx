import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { BondMarketPanel } from './BondMarketPanel';
import type { BondMarketView } from '../game/bondMarket';

const market: BondMarketView = {
  turn: 98, playerCountryId: 'US', playerCash: 10000, currency: 'USD', buy: { cost: 1 }, sell: { cost: 1 },
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
