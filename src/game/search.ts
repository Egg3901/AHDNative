import type { WorldState } from '@ahdclient/engine';

/**
 * Local world search. Entity kinds are limited to those with a real destination
 * route in this app; each result carries the country (and, when region-scoped,
 * the region) so the panel can filter without re-projecting whole directories.
 */
export type SearchKind = 'nation' | 'party' | 'company' | 'election' | 'bill' | 'politician' | 'player' | 'region' | 'bond';

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  description: string;
  /** Owning nation, when the entity belongs to one. Drives the country filter and facets. */
  countryId?: string;
  /** Owning region, when the entity is region-scoped (regions and region elections). */
  regionId?: string;
}

/** One selectable filter option with the count of query matches it represents. */
export interface SearchFacet { id: string; label: string; count: number; }

export interface SearchFacets {
  kinds: SearchFacet[];
  countries: SearchFacet[];
  regions: SearchFacet[];
}

export interface SearchResults {
  query: string;
  results: SearchResult[];
  total: number;
  /** Filter menu options with counts, computed over the full query match set (never a truncated list). */
  facets: SearchFacets;
}

/** Filter applied inside the worker before the 30-result cap, never to an already-truncated list. */
export interface SearchFilter {
  kind?: SearchKind;
  countryId?: string;
  regionId?: string;
}

const LIMIT = 30;

const KIND_LABELS: Record<SearchKind, string> = {
  nation: 'Nations', party: 'Parties', company: 'Companies', election: 'Elections',
  bill: 'Bills', politician: 'Politicians', player: 'You', region: 'Regions', bond: 'Bonds',
};

const normalize = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function facetList(counts: Map<string, number>, label: (id: string) => string): SearchFacet[] {
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: label(id), count }))
    .sort((a, b) => b.count - a.count || compare(a.label, b.label));
}

/**
 * Read-only world search. Keep only the best 30 matches for the current filter;
 * the kind/country/region filter narrows the candidate set before truncation so
 * a narrow filter can still surface matches the unfiltered cap would have dropped.
 */
export function searchWorld(world: WorldState, text: string, filter: SearchFilter = {}): SearchResults {
  if (typeof text !== 'string') throw new Error('Enter a search phrase.');
  const query = text.trim().slice(0, 100);
  const normalizedQuery = normalize(query);
  const tokens = normalizedQuery.split(/\s+/);
  const empty: SearchResults = { query, results: [], total: 0, facets: { kinds: [], countries: [], regions: [] } };
  if (!query) return empty;
  const matched: { result: SearchResult; score: number; key: string }[] = [];
  const kindCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  const offer = (result: SearchResult, extra = '') => {
    const label = normalize(result.title);
    const haystack = `${label} ${normalize(result.description)} ${normalize(extra)}`;
    if (!tokens.every(token => haystack.includes(token))) return;
    kindCounts.set(result.kind, (kindCounts.get(result.kind) ?? 0) + 1);
    if (result.countryId) countryCounts.set(result.countryId, (countryCounts.get(result.countryId) ?? 0) + 1);
    if (result.regionId) regionCounts.set(result.regionId, (regionCounts.get(result.regionId) ?? 0) + 1);
    matched.push({ result, score: label === normalizedQuery ? 0 : label.startsWith(normalizedQuery) ? 1 : 2, key: `${label}:${result.kind}:${result.id}` });
  };
  for (const country of Object.values(world.countries)) {
    offer({ kind: 'nation', id: country.id, title: country.name, description: 'Nation', countryId: country.id }, country.id);
  }
  // Regions scoped to the player's country, matching the regions directory.
  for (const region of Object.values(world.regions)) {
    if (region.countryId !== world.player.countryId) continue;
    const countryName = world.countries[region.countryId]?.name ?? region.countryId;
    offer({ kind: 'region', id: region.id, title: region.name, description: `Region · ${countryName}`, countryId: region.countryId, regionId: region.id }, region.id);
  }
  // Detail adapters currently expose home-country parties, races and bills.
  for (const party of Object.values(world.parties)) {
    if (party.countryId !== world.player.countryId) continue;
    offer({ kind: 'party', id: party.id, title: party.name, description: `Party · ${party.abbreviation}`, countryId: party.countryId }, party.id);
  }
  offer({ kind: 'player', id: 'player', title: world.player.name, description: 'Your profile', countryId: world.player.countryId });
  for (const politician of world.politicians) {
    if (politician.countryId !== world.player.countryId) continue;
    offer({ kind: 'politician', id: politician.id, title: politician.name, description: `Politician · ${world.parties[politician.partyId]?.name ?? 'Independent'}`, countryId: politician.countryId });
  }
  for (const company of Object.values(world.corporations)) {
    offer({ kind: 'company', id: company.id, title: company.tickerSymbol, description: `${world.countries[company.countryId]?.name ?? company.countryId} · ${company.sectorType.replaceAll('_', ' ')}`, countryId: company.countryId }, company.id);
  }
  // Mirror projectBondMarket's inventory: settled issues without player holdings have no destination row.
  for (const bond of Object.values(world.bonds)) {
    const playerUnits = bond.holders.find(holder => holder.holderId === 'player')?.units ?? 0;
    if (bond.matured && playerUnits === 0) continue;
    const issuer = world.countries[bond.countryId]?.name ?? bond.issuerName;
    offer({ kind: 'bond', id: bond.id, title: `${issuer} bond`, description: `Bond · ${bond.couponRate}% · matures turn ${bond.maturityTurn}`, countryId: bond.countryId }, bond.id);
  }
  for (const election of world.elections) {
    if (election.countryId !== world.player.countryId) continue;
    const chamber = world.legislatures[election.countryId]?.chambers.find(c => c.key === election.chamberKey)?.name ?? election.electionType.replaceAll('_', ' ');
    const region = election.state ? world.regions[election.state]?.name ?? election.state : world.countries[election.countryId]?.name ?? election.countryId;
    offer({ kind: 'election', id: election.id, title: `${chamber} · ${region}`, description: `Election · ${election.status} · Turn ${election.endTurn}`, countryId: election.countryId, ...(election.state ? { regionId: election.state } : {}) }, election.candidates.map(c => c.name).join(' '));
  }
  for (const bill of world.bills) {
    if (bill.countryId !== world.player.countryId) continue;
    offer({ kind: 'bill', id: bill.id, title: bill.title, description: `Bill · ${bill.status.replaceAll('_', ' ')}`, countryId: bill.countryId });
  }
  const filtered = matched.filter(({ result }) =>
    (!filter.kind || result.kind === filter.kind)
    && (!filter.countryId || result.countryId === filter.countryId)
    && (!filter.regionId || result.regionId === filter.regionId));
  filtered.sort((a, b) => a.score - b.score || compare(a.key, b.key));
  return {
    query,
    results: filtered.slice(0, LIMIT).map(item => item.result),
    total: filtered.length,
    facets: {
      kinds: facetList(kindCounts, id => KIND_LABELS[id as SearchKind] ?? id),
      countries: facetList(countryCounts, id => world.countries[id]?.name ?? id),
      regions: facetList(regionCounts, id => world.regions[id]?.name ?? id),
    },
  };
}
