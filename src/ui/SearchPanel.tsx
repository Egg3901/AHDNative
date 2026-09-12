import { useEffect, useState } from 'react';
import type { SearchFilter, SearchKind, SearchResult, SearchResults } from '../game/search';

/**
 * Search state the shell keeps alive across route changes. The panel is
 * unmounted whenever the player opens a result, so the shell owns this
 * snapshot and feeds it back in when Search is reached again.
 */
export interface SearchPanelSnapshot {
  query: string;
  submitted: string | null;
  kind: string;
  location: string;
  results?: SearchResults;
  /** `${kind}:${id}` of the last opened result, so it stays marked/selected. */
  opened: string | null;
}

export const EMPTY_SEARCH_SNAPSHOT: SearchPanelSnapshot = {
  query: '', submitted: null, kind: '', location: '', results: undefined, opened: null,
};

export function SearchPanel({ load, revision, onOpen, snapshot, onSnapshot }: {
  load: (query: string, filter?: SearchFilter) => Promise<SearchResults>;
  revision: object;
  onOpen: (result: SearchResult) => void;
  /** Persisted state from a previous visit; only read when the panel mounts. */
  snapshot?: SearchPanelSnapshot;
  onSnapshot?: (snapshot: SearchPanelSnapshot) => void;
}) {
  const [query, setQuery] = useState(snapshot?.query ?? '');
  const [submitted, setSubmitted] = useState<string | null>(snapshot?.submitted ?? null);
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState<SearchResults | undefined>(snapshot?.results);
  const [error, setError] = useState<string>();
  // Filter selections are kept as plain strings so the effect dependency list
  // stays primitive and the worker call is only rebuilt when a choice changes.
  const [kind, setKind] = useState(snapshot?.kind ?? '');
  const [location, setLocation] = useState(snapshot?.location ?? '');
  const [opened, setOpened] = useState<string | null>(snapshot?.opened ?? null);
  useEffect(() => {
    let active = true;
    setResults(undefined); setError(undefined);
    if (submitted) {
      // Filters travel to the worker so narrowing happens before the 30-result cap.
      const filter: SearchFilter = {};
      if (kind) filter.kind = kind as SearchKind;
      if (location.startsWith('country:')) filter.countryId = location.slice('country:'.length);
      else if (location.startsWith('region:')) filter.regionId = location.slice('region:'.length);
      Promise.resolve().then(() => load(submitted, filter)).then(
        value => { if (active) setResults(value); },
        reason => { if (active) setError(reason instanceof Error ? reason.message : 'Search could not complete.'); },
      );
    }
    return () => { active = false; };
  }, [load, revision, submitted, attempt, kind, location]);
  // Report every change so the shell can restore the exact search on return.
  useEffect(() => {
    onSnapshot?.({ query, submitted, kind, location, results, opened });
  }, [query, submitted, kind, location, results, opened, onSnapshot]);
  // Persist the opened/selected result synchronously: opening one navigates away
  // immediately, so the snapshot must be reported before the panel unmounts.
  const open = (result: SearchResult) => {
    const key = `${result.kind}:${result.id}`;
    setOpened(key);
    onSnapshot?.({ query, submitted, kind, location, results, opened: key });
    onOpen(result);
  };
  const filtering = Boolean(kind || location);
  return <div className="ahd-stack">
    <div className="ahd-card ahd-card-pad">
      <h1 className="ahd-h1">Search</h1>
      <p className="ahd-muted">Find your profile, nations, regions, companies, bonds, and your country's politicians, parties, elections, bills and referendums in this saved world.</p>
      <form onSubmit={event => { event.preventDefault(); setSubmitted(query.trim()); setAttempt(value => value + 1); }}>
        <label className="ahd-field">
          <span className="ahd-label">Search your world</span>
          <input className="ahd-input" type="search" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} />
        </label>
        <button className="ahd-btn ahd-btn-primary" type="submit" style={{ marginTop: '.6rem' }}>Search</button>
      </form>
    </div>
    {error ? <div className="ahd-card ahd-card-pad"><p role="alert">{error}</p><button className="ahd-btn" onClick={() => setAttempt(value => value + 1)}>Retry search</button></div> : null}
    {submitted && !results && !error ? <p role="status">Searching your world...</p> : null}
    {results ? <section aria-label="Search results" className="ahd-card ahd-card-pad">
      <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
        <label className="ahd-field" style={{ maxWidth: '12rem' }}>
          <span className="ahd-label">Result kind</span>
          <select className="ahd-select" aria-label="Result kind" value={kind} onChange={event => setKind(event.target.value)}>
            <option value="">All kinds</option>
            {results.facets.kinds.map(facet => <option key={facet.id} value={facet.id}>{facet.label} ({facet.count})</option>)}
          </select>
        </label>
        <label className="ahd-field" style={{ maxWidth: '16rem' }}>
          <span className="ahd-label">Country or region</span>
          <select className="ahd-select" aria-label="Country or region" value={location} onChange={event => setLocation(event.target.value)}>
            <option value="">All locations</option>
            {results.facets.countries.length > 0 ? <optgroup label="Countries">
              {results.facets.countries.map(facet => <option key={facet.id} value={`country:${facet.id}`}>{facet.label} ({facet.count})</option>)}
            </optgroup> : null}
            {results.facets.regions.length > 0 ? <optgroup label="Regions">
              {results.facets.regions.map(facet => <option key={facet.id} value={`region:${facet.id}`}>{facet.label} ({facet.count})</option>)}
            </optgroup> : null}
          </select>
        </label>
        {filtering ? <button className="ahd-btn" type="button" onClick={() => { setKind(''); setLocation(''); }}>Clear filters</button> : null}
      </div>
      <p role="status" style={{ marginTop: '.6rem' }}>{results.total ? `Showing ${results.results.length} of ${results.total} matches for ${results.query}.` : 'No matches.'}</p>
      {results.total > results.results.length ? <p className="ahd-muted">Use a more specific phrase or a filter to narrow the results.</p> : null}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '.5rem' }}>
        {results.results.map(result => {
          const key = `${result.kind}:${result.id}`;
          const selected = key === opened;
          return <li key={key}><button className="ahd-btn" aria-current={selected ? 'true' : undefined} style={{ width: '100%', textAlign: 'left', justifyContent: 'start', display: 'grid', whiteSpace: 'normal', overflowWrap: 'anywhere', ...(selected ? { borderColor: 'var(--ahd-primary)' } : {}) }} onClick={() => open(result)}>
            <strong>{result.title}</strong>
            <span className="ahd-muted">{result.description}{selected ? ' · Selected' : ''}</span>
          </button></li>;
        })}
      </ul>
    </section> : null}
  </div>;
}
