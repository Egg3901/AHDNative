import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createWorld, type ReferendumRecord } from '@ahdclient/engine';
import { GameSession } from './session';
import { searchWorld } from './search';

const options = { playerName: 'Search Player', countryId: 'UK', era: '1953', seed: 'native-search-v1' };
const ELECTED_FIXTURE = new URL('../../fixtures/career-elected-1953-US.save.json.gz', import.meta.url);
const loadElected = () => {
  const session = new GameSession();
  session.load(gunzipSync(readFileSync(ELECTED_FIXTURE)).toString('utf8'));
  return session;
};

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
it('carries result metadata and facet counts derived from every match', () => {
  const session = new GameSession();
  session.create(options);
  const all = session.search('a');
  expect(all.facets.kinds.reduce((sum, facet) => sum + facet.count, 0)).toBe(all.total);
  expect(all.facets.countries.reduce((sum, facet) => sum + facet.count, 0)).toBe(all.total);
  expect(all.facets.kinds).toContainEqual(expect.objectContaining({ id: 'company', label: 'Companies' }));
  // Region results expose the owning country and the region itself.
  expect(session.search('East of England').results).toContainEqual(
    expect.objectContaining({ kind: 'region', id: 'EAE', countryId: 'UK', regionId: 'EAE' }));
});
it('applies the kind filter to the whole match set before the 30-result cap', () => {
  const session = new GameSession();
  session.create(options);
  const all = session.search('a');
  const companyFacet = all.facets.kinds.find(facet => facet.id === 'company');
  expect(companyFacet).toBeDefined();
  const companies = session.search('a', { kind: 'company' });
  // Facet counts come from every match, so a filtered total above the cap proves the
  // filter ran inside the worker rather than against the truncated 30-result page.
  expect(companies.total).toBe(companyFacet!.count);
  expect(companies.total).toBeGreaterThan(30);
  expect(companies.results.length).toBe(30);
  expect(companies.results.every(result => result.kind === 'company')).toBe(true);
});
it('applies the country and region filters from real result metadata', () => {
  const session = new GameSession();
  session.create(options);
  const all = session.search('a');
  const us = session.search('a', { countryId: 'US' });
  expect(us.total).toBe(all.facets.countries.find(facet => facet.id === 'US')!.count);
  expect(us.results.length).toBeGreaterThan(0);
  expect(us.results.every(result => result.countryId === 'US')).toBe(true);
  const regionFacet = all.facets.regions[0];
  expect(regionFacet).toBeDefined();
  const inRegion = session.search('a', { regionId: regionFacet!.id });
  expect(inRegion.total).toBe(regionFacet!.count);
  expect(inRegion.results.every(result => result.regionId === regionFacet!.id)).toBe(true);
});
it('indexes referendum records with their country, region and question', () => {
  const world = createWorld({ playerName: 'Referendum Player', countryId: 'UK', era: '1953', seed: 'native-search-referendum' });
  const independence: ReferendumRecord = {
    id: 'referendum-SCO-1', countryId: 'UK', regionId: 'SCO', kind: 'independence',
    status: 'completed', yesShare: 55.1, finalYesShare: 55.1, passed: true, turnout: 68.1,
    requestedTurn: 10, grantedTurn: 10, campaignOpenTurn: 10, campaignCloseTurn: 58,
    conversionDeadlineTurn: 70, cooldownReadyAtTurn: 130,
  };
  const reunification: ReferendumRecord = {
    id: 'referendum-NIR-1', countryId: 'UK', regionId: 'NIR', kind: 'reunification', targetCountryId: 'IE',
    status: 'polling', yesShare: 44.2, requestedTurn: 11, grantedTurn: 11, campaignOpenTurn: 11, campaignCloseTurn: 59,
  };
  // A foreign record must never surface in the home-country search.
  const abroad: ReferendumRecord = { ...independence, id: 'referendum-TX-1', countryId: 'US', regionId: 'TX' };
  world.referendums.push(independence, reunification, abroad);
  const found = searchWorld(world, 'Scotland');
  expect(found.results).toContainEqual(expect.objectContaining({
    kind: 'referendum', id: 'referendum-SCO-1',
    title: 'Should Scotland become an independent country?', countryId: 'UK', regionId: 'SCO',
  }));
  expect(found.facets.kinds).toContainEqual(expect.objectContaining({ id: 'referendum', label: 'Referendums' }));
  expect(found.facets.regions).toContainEqual(expect.objectContaining({ id: 'SCO' }));
  // Reunification records build the question from the target country.
  expect(searchWorld(world, 'reunify').results).toContainEqual(expect.objectContaining({
    kind: 'referendum', id: 'referendum-NIR-1', title: 'Should Northern Ireland reunify with Ireland?',
  }));
  // The kind filter narrows to referendums, and the foreign record stays invisible.
  const only = searchWorld(world, 'a', { kind: 'referendum' });
  expect(only.results.every(result => result.kind === 'referendum')).toBe(true);
  expect(only.results.map(result => result.id)).not.toContain('referendum-TX-1');
});
it('offers the remaining entity kinds from a loaded save', () => {
  const session = loadElected();
  const kinds = session.search('a').facets.kinds.map(facet => facet.id);
  expect(kinds).toEqual(expect.arrayContaining(['politician', 'election', 'bill', 'region', 'bond']));
  expect(session.search('Alabama').results).toContainEqual(expect.objectContaining({ kind: 'region', id: 'AL' }));
  expect(session.search('bond-60-US', { kind: 'bond' }).results).toContainEqual(
    expect.objectContaining({ kind: 'bond', id: 'bond-60-US', countryId: 'US' }));
  // A kind filter narrows one entity type without touching the others.
  const bonds = session.search('bond', { kind: 'bond' });
  expect(bonds.total).toBeGreaterThan(0);
  expect(bonds.results.every(result => result.kind === 'bond')).toBe(true);
});
