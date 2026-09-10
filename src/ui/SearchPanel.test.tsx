import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchPanel } from './SearchPanel';
import type { SearchResults } from '../game/search';

it('submits a local query and opens the exact returned destination', async () => {
  const user = userEvent.setup();
  const result = { kind: 'party' as const, id: 'UK_LAB', title: 'Labour Party', description: 'Party · LAB' };
  const load = vi.fn(async () => ({ query: 'Labour', results: [result], total: 1 }));
  const onOpen = vi.fn();
  render(<SearchPanel load={load} revision={{}} onOpen={onOpen} />);
  expect(load).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Search your world'), 'Labour{Enter}');
  await user.click(await screen.findByRole('button', { name: /Labour Party/ }));
  expect(load).toHaveBeenCalledWith('Labour');
  expect(onOpen).toHaveBeenCalledWith(result);
});

it('ignores stale responses and allows retry after a failed query', async () => {
  const user = userEvent.setup();
  let resolveFirst!: (value: SearchResults) => void;
  const load = vi.fn().mockImplementationOnce(() => new Promise<SearchResults>(resolve => { resolveFirst = resolve; }))
    .mockRejectedValueOnce(new Error('Search unavailable.'))
    .mockResolvedValue({ query: 'second', results: [], total: 0 });
  render(<SearchPanel load={load} revision={{}} onOpen={vi.fn()} />);
  const input = screen.getByLabelText('Search your world');
  await user.type(input, 'first{Enter}');
  await user.clear(input);
  await user.type(input, 'second{Enter}');
  expect(await screen.findByRole('alert')).toHaveTextContent('Search unavailable.');
  resolveFirst({ query: 'first', results: [{ kind: 'nation', id: 'US', title: 'Old result', description: 'Nation' }], total: 1 });
  await user.click(screen.getByRole('button', { name: 'Retry search' }));
  expect(await screen.findByText('No matches.')).toBeInTheDocument();
  expect(screen.queryByText('Old result')).not.toBeInTheDocument();
});
