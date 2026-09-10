import { useEffect, useState } from 'react';
import type { SearchResult, SearchResults } from '../game/search';

export function SearchPanel({ load, revision, onOpen }: {
  load: (query: string) => Promise<SearchResults>;
  revision: object;
  onOpen: (result: SearchResult) => void;
}) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState<SearchResults>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    setResults(undefined); setError(undefined);
    if (submitted) {
      Promise.resolve().then(() => load(submitted)).then(
        value => { if (active) setResults(value); },
        reason => { if (active) setError(reason instanceof Error ? reason.message : 'Search could not complete.'); },
      );
    }
    return () => { active = false; };
  }, [load, revision, submitted, attempt]);
  return <div className="ahd-stack">
    <div className="ahd-card ahd-card-pad">
      <h1 className="ahd-h1">Search</h1>
      <p className="ahd-muted">Find your profile, nations, companies, and your country's politicians, parties, elections and bills in this saved world.</p>
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
      <p role="status">{results.total ? `Showing ${results.results.length} of ${results.total} matches for ${results.query}.` : 'No matches.'}</p>
      {results.total > results.results.length ? <p className="ahd-muted">Use a more specific phrase to narrow the results.</p> : null}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '.5rem' }}>
        {results.results.map(result => <li key={`${result.kind}:${result.id}`}><button className="ahd-btn" style={{ width: '100%', textAlign: 'left', justifyContent: 'start', display: 'grid', whiteSpace: 'normal', overflowWrap: 'anywhere' }} onClick={() => onOpen(result)}>
          <strong>{result.title}</strong><span className="ahd-muted">{result.description}</span>
        </button></li>)}
      </ul>
    </section> : null}
  </div>;
}
