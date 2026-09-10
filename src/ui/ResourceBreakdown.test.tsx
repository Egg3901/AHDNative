import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ResourceBreakdown } from './ResourceBreakdown';
const details = {
  actions: { base: 4, office: 0, penalty: 4, threshold: 100, cap: 200, next: 105 },
  funds: { enabled: true, base: 10000, donor: 0, office: 0, tax: 500, regularNet: 9500 }, history: [],
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
