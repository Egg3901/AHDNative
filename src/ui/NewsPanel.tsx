import { useMemo, useState } from "react";
import type { NewsView } from "../game/types";
import { formatGameDate, type GameClock } from "../game/gameDate";

interface StoredNewsState { selectedId: string | null; readIds: string[]; }

function loadState(key: string): StoredNewsState {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<StoredNewsState> | null;
    return { selectedId: typeof value?.selectedId === "string" ? value.selectedId : null, readIds: Array.isArray(value?.readIds) ? value.readIds.filter((id): id is string => typeof id === "string") : [] };
  } catch {
    return { selectedId: null, readIds: [] };
  }
}

function saveState(key: string, value: StoredNewsState): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* News remains usable when storage is unavailable. */ }
}

export function NewsPanel({ news, clock, storageKey, onCountry, onParty, onElection }: {
  news: NewsView[];
  clock: GameClock;
  storageKey: string;
  onCountry: (id: string) => void;
  onParty: (id: string) => void;
  onElection: (id: string) => void;
}) {
  const key = `ahd.news.v1:${storageKey}`;
  const initial = useMemo(() => loadState(key), [key]);
  const [selectedId, setSelectedId] = useState<string | null>(() => initial.selectedId);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set(initial.readIds));
  const [country, setCountry] = useState("all");
  const [category, setCategory] = useState("all");
  const [date, setDate] = useState("all");

  const countries = useMemo(() => [...new Map(news.flatMap(item => item.country ? [[item.country.id, item.country.name] as const] : [])).entries()], [news]);
  const categories = useMemo(() => [...new Set(news.map(item => item.category ?? "General"))], [news]);
  const dates = useMemo(() => [...new Set(news.map(item => item.date))], [news]);
  const filtered = news.filter(item => (country === "all" || item.country?.id === country) && (category === "all" || (item.category ?? "General") === category) && (date === "all" || item.date === date));
  const selected = news.find(item => item.id === selectedId) ?? null;

  const select = (id: string | null) => {
    setSelectedId(id);
    const nextRead = new Set(readIds);
    if (id) nextRead.add(id);
    setReadIds(nextRead);
    saveState(key, { selectedId: id, readIds: [...nextRead] });
  };

  if (selected) {
    return (
      <article className="ahd-card ahd-card-pad ahd-stack" aria-label={selected.title}>
        <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={() => select(null)}>Back to news</button>
        <div><span className="ahd-pill">Read</span><span className="ahd-pill">{selected.category ?? "General"}</span><h2 className="ahd-h2">{selected.title}</h2><p className="ahd-muted">{formatGameDate(selected.date, clock)}</p></div>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{selected.body}</p>
        <nav aria-label="Related records" style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
          {selected.country ? <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onCountry(selected.country!.id)}>View {selected.country.name}</button> : null}
          {selected.party ? <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onParty(selected.party!.id)}>View {selected.party.name}</button> : null}
          {selected.election ? <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onElection(selected.election!.id)}>View {selected.election.name}</button> : null}
        </nav>
        {selected.event ? <section role="region" aria-label="Event context" className="ahd-card ahd-card-pad"><h3 className="ahd-h3">Event context</h3><p>{selected.event.name}</p><p className="ahd-muted">This save has no separate event-detail destination. The article above is the complete local record.</p></section> : null}
      </article>
    );
  }

  return (
    <div className="ahd-stack">
      <div className="ahd-card ahd-card-pad ahd-hero">
        <h2 className="ahd-h2">News</h2><p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>{filtered.length} of {news.length} items</p>
        <div className="ahd-grid ahd-grid-3" style={{ marginTop: "0.7rem" }}>
          <label className="ahd-field"><span className="ahd-label">Country</span><select className="ahd-select" aria-label="News country" value={country} onChange={event => setCountry(event.target.value)}><option value="all">All countries</option>{countries.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label className="ahd-field"><span className="ahd-label">Date</span><select className="ahd-select" aria-label="News date" value={date} onChange={event => setDate(event.target.value)}><option value="all">All dates</option>{dates.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="ahd-field"><span className="ahd-label">Category</span><select className="ahd-select" aria-label="News category" value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>
      </div>
      {filtered.length === 0 ? <div className="ahd-empty">No news matches these filters.</div> : <div className="ahd-grid ahd-grid-3">{filtered.map(item => <article key={item.id} className="ahd-card ahd-card-pad" aria-label={`${item.title}${readIds.has(item.id) ? ", read" : ", unread"}`}><div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><h3 style={{ margin: 0, fontSize: "0.86rem", fontWeight: 750 }}>{item.title}</h3>{readIds.has(item.id) ? <span className="ahd-pill">Read</span> : null}</div><p className="ahd-muted" style={{ fontSize: "0.72rem", margin: "0.15rem 0 0" }}>{item.category ?? "General"} · {formatGameDate(item.date, clock)}</p><button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={() => select(item.id)} aria-label={`Read ${item.title}`}>Read article</button></article>)}</div>}
    </div>
  );
}
