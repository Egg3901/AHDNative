import { expect, it } from 'vitest';
import { GameSession } from './session';

const options = { playerName: 'Search Player', countryId: 'UK', era: '1953', seed: 'native-search-v1' };
it('searches actual local parties, nations and companies without changing the world', () => {
  const session = new GameSession();
  session.create(options);
  const before = session.serialize('2026-09-10T00:00:00.000Z');
  expect(session.search('Search Player').results).toContainEqual(expect.objectContaining({ kind: 'player', id: 'player' }));
  expect(session.search('Labour').results).toContainEqual(expect.objectContaining({ kind: 'party', id: 'UK_LAB' }));
  expect(session.search('United States').results).toContainEqual(expect.objectContaining({ kind: 'nation', id: 'US' }));
  expect(session.search('US.MEDI').results).toContainEqual(expect.objectContaining({ kind: 'company', id: 'US-media' }));
  expect(session.search('Democratic').results.filter(r => r.kind === 'party')).toEqual([]);
  expect(session.serialize('2026-09-10T00:00:00.000Z')).toBe(before);
});
it('returns bounded, repeatable results and handles empty or unmatched queries', () => {
  const session = new GameSession();
  expect(() => session.search('Labour')).toThrow('Start or load');
  session.create(options);
  expect(session.search('  ').results).toEqual([]);
  expect(session.search('zz-no-match-zz').results).toEqual([]);
  const found = session.search('a');
  expect(found.results.length).toBeLessThanOrEqual(30);
  expect(found.total).toBeGreaterThanOrEqual(found.results.length);
  expect(session.search('a')).toEqual(found);
  const loaded = new GameSession();
  loaded.load(session.serialize('2026-09-10T00:00:00.000Z'));
  expect(loaded.search('Labour')).toEqual(session.search('Labour'));
});
