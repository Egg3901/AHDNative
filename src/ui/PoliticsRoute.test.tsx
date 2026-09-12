import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { PoliticsView } from '../game/politics';
import { PoliticsRoute } from './PoliticsRoute';
const politics: PoliticsView = { countryId: 'US', countryName: 'United States', currency: 'USD', playerPartyId: null, parties: [], elections: [], referendums: [], referendumRequest: { applicable: false, note: 'Referendums are only available in the UK in this local slice.', regions: [], action: { id: 'requestReferendum', name: 'Request Referendum', description: '', cost: 0, available: false, disabledReason: 'Referendums are UK-only.' } }, politicians: [] };

it('recovers an on-demand query failure through the visible retry control', async () => {
  const load = vi.fn<() => Promise<PoliticsView>>()
    .mockRejectedValueOnce(new Error('Details unavailable'))
    .mockResolvedValueOnce(politics);
  render(<PoliticsRoute load={load} revision={{}} section="parties" busy={false} onAction={vi.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Details unavailable');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry details' }));
  expect(await screen.findByText(/No parties/)).toBeVisible();
  expect(load).toHaveBeenCalledTimes(2);
});

it('ignores a stale response after an action replaces the world', async () => {
  let resolveOld!: (value: PoliticsView) => void;
  const load = vi.fn<() => Promise<PoliticsView>>()
    .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce(politics);
  const props = { load, section: 'parties' as const, busy: false, onAction: vi.fn() };
  const { rerender } = render(<PoliticsRoute {...props} revision={{ turn: 1 }} />);
  rerender(<PoliticsRoute {...props} revision={{ turn: 2 }} />);
  expect(await screen.findByText(/No parties/)).toBeVisible();
  await act(async () => resolveOld({ ...politics, countryName: 'Stale Nation' }));
  expect(screen.queryByText(/Stale Nation/)).not.toBeInTheDocument();
  expect(load).toHaveBeenCalledTimes(2);
});
