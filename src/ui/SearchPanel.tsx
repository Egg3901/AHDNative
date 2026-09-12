import { useEffect, useState } from 'react';
import type { SearchFilter, SearchKind, SearchResult, SearchResults } from '../game/search';

export function SearchPanel({ load, revision, onOpen }: {
  load: (query: string, filter?: SearchFilter) => Promise<SearchResults>;
  revision: object;
  onOpen: (result: SearchResult) => void;
}) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState<SearchResults>();
  const [error, setError] = useState<string>();
  // Filter selections are kept as plain strings so the effect dependency list
  // stays primitive and the worker call is only rebuilt when a choice changes.
  const [kind, setKind] = useState('');
  const [location, setLocation] = useState('');
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
  const filtering = Boolean(kind || location);
  return <div className="ahd-stack">
    <div className="ahd-card ahd-card-pad">
      <h1 className="ahd-h1">Search</h1>
      <p className="ahd-muted">Find your profile, nations, regions, companies, bonds, and your country's politicians, parties, elections and bills in this saved world.</p>
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
        {results.results.map(result => <li key={`${result.kind}:${result.id}`}><button className="ahd-btn" style={{ width: '100%', textAlign: 'left', justifyContent: 'start', display: 'grid', whiteSpace: 'normal', overflowWrap: 'anywhere' }} onClick={() => onOpen(result)}>
          <strong>{result.title}</strong><span className="ahd-muted">{result.description}</span>
        </button></li>)}
      </ul>
    </section> : null}
  </div>;
}
