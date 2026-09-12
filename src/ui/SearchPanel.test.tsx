import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchPanel } from './SearchPanel';
import type { SearchFilter, SearchResults } from '../game/search';

const EMPTY_FACETS = { kinds: [], countries: [], regions: [] };

it('restores a persisted query, filters and marks the opened result', async () => {
  const results: SearchResults = {
    query: 'Labour',
    results: [
      { kind: 'party', id: 'UK_LAB', title: 'Labour Party', description: 'Party · LAB', countryId: 'UK' },
      { kind: 'nation', id: 'US', title: 'United States', description: 'Nation', countryId: 'US' },
    ],
    total: 2,
    facets: {
      kinds: [{ id: 'party', label: 'Parties', count: 1 }, { id: 'nation', label: 'Nations', count: 1 }],
      countries: [{ id: 'UK', label: 'United Kingdom', count: 1 }, { id: 'US', label: 'United States', count: 1 }],
      regions: [],
    },
  };
  const load = vi.fn(async () => results);
  render(<SearchPanel load={load} revision={{}} onOpen={vi.fn()} snapshot={{
    query: 'Labour', submitted: 'Labour', kind: 'party', location: 'country:UK', results, opened: 'party:UK_LAB',
  }} />);
  // The shell-supplied snapshot seeds the input immediately; the filters and
  // result list come back after the local re-query resolves.
  expect(screen.getByLabelText('Search your world')).toHaveValue('Labour');
  const opened = await screen.findByRole('button', { name: /Labour Party/ });
  expect(screen.getByLabelText('Result kind')).toHaveValue('party');
  expect(screen.getByLabelText('Country or region')).toHaveValue('country:UK');
  expect(opened).toHaveAttribute('aria-current', 'true');
  expect(opened).toHaveTextContent('Selected');
  const other = screen.getByRole('button', { name: /United States/ });
  expect(other).not.toHaveAttribute('aria-current');
});

it('reports its query, filters and opened result so the shell can restore them', async () => {
  const user = userEvent.setup();
  const result = { kind: 'party' as const, id: 'UK_LAB', title: 'Labour Party', description: 'Party · LAB', countryId: 'UK' };
  const load = vi.fn(async () => ({
    query: 'Labour', results: [result], total: 1,
    facets: { kinds: [{ id: 'party', label: 'Parties', count: 1 }], countries: [{ id: 'UK', label: 'United Kingdom', count: 1 }], regions: [] },
  }));
  const onSnapshot = vi.fn();
  const onOpen = vi.fn();
  render(<SearchPanel load={load} revision={{}} onOpen={onOpen} onSnapshot={onSnapshot} />);
  await user.type(screen.getByLabelText('Search your world'), 'Labour{Enter}');
  await screen.findByRole('button', { name: /Labour Party/ });
  expect(onSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'Labour', submitted: 'Labour' }));
  // Opening a result persists the selection synchronously, before the panel unmounts.
  await user.click(screen.getByRole('button', { name: /Labour Party/ }));
  expect(onSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ opened: 'party:UK_LAB' }));
  expect(onOpen).toHaveBeenCalledWith(result);
});

it('submits a local query and opens the exact returned destination', async () => {
  const user = userEvent.setup();
  const result = { kind: 'party' as const, id: 'UK_LAB', title: 'Labour Party', description: 'Party · LAB', countryId: 'UK' };
  const load = vi.fn(async () => ({ query: 'Labour', results: [result], total: 1, facets: EMPTY_FACETS }));
  const onOpen = vi.fn();
  render(<SearchPanel load={load} revision={{}} onOpen={onOpen} />);
  expect(load).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Search your world'), 'Labour{Enter}');
  await user.click(await screen.findByRole('button', { name: /Labour Party/ }));
  expect(load).toHaveBeenCalledWith('Labour', {});
  expect(onOpen).toHaveBeenCalledWith(result);
});

it('ignores stale responses and allows retry after a failed query', async () => {
  const user = userEvent.setup();
  let resolveFirst!: (value: SearchResults) => void;
  const load = vi.fn().mockImplementationOnce(() => new Promise<SearchResults>(resolve => { resolveFirst = resolve; }))
    .mockRejectedValueOnce(new Error('Search unavailable.'))
    .mockResolvedValue({ query: 'second', results: [], total: 0, facets: EMPTY_FACETS });
  render(<SearchPanel load={load} revision={{}} onOpen={vi.fn()} />);
  const input = screen.getByLabelText('Search your world');
  await user.type(input, 'first{Enter}');
  await user.clear(input);
  await user.type(input, 'second{Enter}');
  expect(await screen.findByRole('alert')).toHaveTextContent('Search unavailable.');
  resolveFirst({ query: 'first', results: [{ kind: 'nation', id: 'US', title: 'Old result', description: 'Nation' }], total: 1, facets: EMPTY_FACETS });
  await user.click(screen.getByRole('button', { name: 'Retry search' }));
  expect(await screen.findByText('No matches.')).toBeInTheDocument();
  expect(screen.queryByText('Old result')).not.toBeInTheDocument();
});

it('passes the kind and country/region filters into the loader', async () => {
  const user = userEvent.setup();
  const base = [
    { kind: 'party' as const, id: 'UK_LAB', title: 'Labour Party', description: 'Party · LAB', countryId: 'UK' },
    { kind: 'nation' as const, id: 'US', title: 'United States', description: 'Nation', countryId: 'US' },
  ];
  const load = vi.fn(async (query: string, filter: SearchFilter = {}) => {
    const results = base.filter(result =>
      (!filter.kind || result.kind === filter.kind) && (!filter.countryId || result.countryId === filter.countryId));
    return {
      query, results, total: results.length,
      facets: {
        kinds: [{ id: 'party', label: 'Parties', count: 1 }, { id: 'nation', label: 'Nations', count: 1 }],
        countries: [{ id: 'UK', label: 'United Kingdom', count: 1 }, { id: 'US', label: 'United States', count: 1 }],
        regions: [],
      },
    };
  });
  render(<SearchPanel load={load} revision={{}} onOpen={vi.fn()} />);
  await user.type(screen.getByLabelText('Search your world'), 'UK{Enter}');
  expect(await screen.findByText('United States')).toBeInTheDocument();
  expect(load).toHaveBeenLastCalledWith('UK', {});
  expect(screen.getByRole('option', { name: 'Parties (1)' })).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText('Result kind'), 'party');
  await waitFor(() => expect(load).toHaveBeenLastCalledWith('UK', { kind: 'party' }));
  expect(screen.queryByText('United States')).not.toBeInTheDocument();
  expect(await screen.findByText('Labour Party')).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText('Country or region'), 'country:US');
  await waitFor(() => expect(load).toHaveBeenLastCalledWith('UK', { kind: 'party', countryId: 'US' }));
  expect(await screen.findByText('No matches.')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(load).toHaveBeenLastCalledWith('UK', {}));
  expect(await screen.findByText('United States')).toBeInTheDocument();
});
