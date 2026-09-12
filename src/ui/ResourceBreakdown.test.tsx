import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ResourceBreakdown } from './ResourceBreakdown';
const details = {
  actions: { base: 4, seat: 0, cabinet: 0, chair: 0, office: 0, penalty: 4, threshold: 100, cap: 200, next: 105, refresh: 4 },
  funds: { enabled: true, base: 10000, donor: 0, office: 0, tax: 500, regularNet: 9500 },
  partyInfluence: null,
  history: [],
};
it('explains the action penalty threshold and next refresh balance', () => {
  render(<ResourceBreakdown details={details} resource="ap" currency="USD" />);
  expect(screen.getByText(/above 100/)).toBeInTheDocument();
  expect(screen.getByText('105')).toBeInTheDocument();
  expect(screen.getByText('200')).toBeInTheDocument();
});
it('separates regular funds from tax and warns totals can change', () => {
  render(<ResourceBreakdown details={details} resource="funds" currency="USD" />);
  expect(screen.getByText('$9,500.00')).toBeInTheDocument();
  expect(screen.getByText('$500.00')).toBeInTheDocument();
  expect(screen.getByText(/Other activity/)).toBeInTheDocument();
});
it('breaks the action refresh into office sources with an honest chair note', () => {
  render(<ResourceBreakdown details={{
    ...details,
    actions: { base: 4, seat: 2, cabinet: 1, chair: 0, office: 3, party: 2, penalty: 0, threshold: 100, cap: 200, next: 11, refresh: 7 },
  }} resource="ap" currency="USD" />);
  expect(screen.getByText('Elected seat office')).toBeInTheDocument();
  expect(screen.getByText('Cabinet office')).toBeInTheDocument();
  expect(screen.getByText('Chair bonus')).toBeInTheDocument();
  expect(screen.getByText(/no central-bank chair/)).toBeInTheDocument();
});
it('records turn-over-turn fund and cash deltas in the balance history', () => {
  render(<ResourceBreakdown details={{
    ...details,
    history: [
      { turn: 11, cash: 1000, savings: 300, funds: 5000 },
      { turn: 12, cash: 1200, savings: 300, funds: 5400 },
    ],
  }} resource="cash" currency="USD" />);
  expect(screen.getByText(/Turn 12/)).toBeInTheDocument();
  expect(screen.getByText(/\+\$400\.00 funds, \+\$200\.00 cash/)).toBeInTheDocument();
});
