import type { WorldState } from '@ahdclient/engine';

export type SearchKind = 'nation' | 'party' | 'company' | 'election' | 'bill' | 'politician' | 'player';
export interface SearchResult { kind: SearchKind; id: string; title: string; description: string; }
export interface SearchResults { query: string; results: SearchResult[]; total: number; }
const LIMIT = 30;
const normalize = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Read-only world search. Keep only the best 30 matches and never project whole directories. */
export function searchWorld(world: WorldState, text: string): SearchResults {
  if (typeof text !== 'string') throw new Error('Enter a search phrase.');
  const query = text.trim().slice(0, 100);
  const normalizedQuery = normalize(query);
  const tokens = normalizedQuery.split(/\s+/);
  const output: SearchResults = { query, results: [], total: 0 };
  if (!query) return output;
  const ranked: { result: SearchResult; score: number; key: string }[] = [];
  const offer = (result: SearchResult, extra = '') => {
    const label = normalize(result.title);
    const haystack = `${label} ${normalize(result.description)} ${normalize(extra)}`;
    if (!tokens.every(token => haystack.includes(token))) return;
    output.total++;
    ranked.push({ result, score: label === normalizedQuery ? 0 : label.startsWith(normalizedQuery) ? 1 : 2, key: `${label}:${result.kind}:${result.id}` });
    ranked.sort((a, b) => a.score - b.score || compare(a.key, b.key));
    if (ranked.length > LIMIT) ranked.pop();
  };
  for (const country of Object.values(world.countries)) {
    offer({ kind: 'nation', id: country.id, title: country.name, description: 'Nation' }, country.id);
  }
  // Detail adapters currently expose home-country parties, races and bills.
  for (const party of Object.values(world.parties)) {
    if (party.countryId !== world.player.countryId) continue;
    offer({ kind: 'party', id: party.id, title: party.name, description: `Party · ${party.abbreviation}` }, party.id);
  }
  offer({ kind: 'player', id: 'player', title: world.player.name, description: 'Your profile' });
  for (const politician of world.politicians) {
    if (politician.countryId !== world.player.countryId) continue;
    offer({ kind: 'politician', id: politician.id, title: politician.name, description: `Politician · ${world.parties[politician.partyId]?.name ?? 'Independent'}` });
  }
  for (const company of Object.values(world.corporations)) {
    offer({ kind: 'company', id: company.id, title: company.tickerSymbol, description: `${world.countries[company.countryId]?.name ?? company.countryId} · ${company.sectorType.replaceAll('_', ' ')}` }, company.id);
  }
  for (const election of world.elections) {
    if (election.countryId !== world.player.countryId) continue;
    const chamber = world.legislatures[election.countryId]?.chambers.find(c => c.key === election.chamberKey)?.name ?? election.electionType.replaceAll('_', ' ');
    const region = election.state ? world.regions[election.state]?.name ?? election.state : world.countries[election.countryId]?.name ?? election.countryId;
    offer({ kind: 'election', id: election.id, title: `${chamber} · ${region}`, description: `Election · ${election.status} · Turn ${election.endTurn}` }, election.candidates.map(c => c.name).join(' '));
  }
  for (const bill of world.bills) {
    if (bill.countryId !== world.player.countryId) continue;
    offer({ kind: 'bill', id: bill.id, title: bill.title, description: `Bill · ${bill.status.replaceAll('_', ' ')}` });
  }
  output.results = ranked.map(item => item.result);
  return output;
}
