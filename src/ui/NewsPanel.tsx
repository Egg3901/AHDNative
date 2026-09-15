import { useEffect, useMemo, useRef, useState } from "react";
import type { NewsView } from "../game/types";
import { formatGameDate, type GameClock } from "../game/gameDate";

interface StoredNewsState { selectedId: string | null; readIds: string[]; eventId: string | null; }

function loadState(key: string): StoredNewsState {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as Partial<StoredNewsState> | null;
    return { selectedId: typeof value?.selectedId === "string" ? value.selectedId : null, readIds: Array.isArray(value?.readIds) ? value.readIds.filter((id): id is string => typeof id === "string") : [], eventId: typeof value?.eventId === "string" ? value.eventId : null };
  } catch {
    return { selectedId: null, readIds: [], eventId: null };
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
  const [eventId, setEventId] = useState<string | null>(() => initial.eventId);
  const [country, setCountry] = useState("all");
  const [category, setCategory] = useState("all");
  const [date, setDate] = useState("all");
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const eventHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const eventButtonRef = useRef<HTMLButtonElement | null>(null);
  const readButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  // "article" moves focus into the opened article, "event" into the opened
  // event detail, and "event-source" back to the article's event button;
  // otherwise a news id moves focus back to its Read button. Set only on
  // user action, never on restore.
  const pendingFocus = useRef<string | null>(null);

  const countries = useMemo(() => [...new Map(news.flatMap(item => item.country ? [[item.country.id, item.country.name] as const] : [])).entries()], [news]);
  const categories = useMemo(() => [...new Set(news.map(item => item.category ?? "General"))], [news]);
  const dates = useMemo(() => [...new Set(news.map(item => item.date))], [news]);
  const filtered = news.filter(item => (country === "all" || item.country?.id === country) && (category === "all" || (item.category ?? "General") === category) && (date === "all" || item.date === date));
  const selected = news.find(item => item.id === selectedId) ?? null;
  // The event detail is backed only by local news records carrying the same
  // projected event id. A stale persisted id with no surviving records
  // renders nothing; callers fall back to the article or the list.
  const eventRecords = eventId ? news.filter(item => item.event?.id === eventId) : [];
  const event = eventId && eventRecords.length > 0 ? { id: eventId, name: (selected?.event?.id === eventId ? selected.event.name : undefined) ?? eventRecords[0]!.event!.name, records: eventRecords } : null;
  // Related destinations are the union of relations genuinely projected on
  // the event's own records. Nothing is inferred from headlines or ids.
  const relatedBy = (pick: (item: NewsView) => { id: string; name: string } | null | undefined) =>
    [...new Map(eventRecords.flatMap(item => { const related = pick(item); return related ? [[related.id, related] as const] : []; })).values()];
  const eventCountries = relatedBy(item => item.country);
  const eventParties = relatedBy(item => item.party);
  const eventElections = relatedBy(item => item.election);

  const select = (id: string | null) => {
    pendingFocus.current = id ? "article" : (selectedId ?? null);
    setSelectedId(id);
    setEventId(null);
    const nextRead = new Set(readIds);
    if (id) nextRead.add(id);
    setReadIds(nextRead);
    saveState(key, { selectedId: id, readIds: [...nextRead], eventId: null });
  };

  const openEvent = (id: string) => {
    pendingFocus.current = "event";
    setEventId(id);
    saveState(key, { selectedId, readIds: [...readIds], eventId: id });
  };

  const closeEvent = () => {
    pendingFocus.current = "event-source";
    setEventId(null);
    saveState(key, { selectedId, readIds: [...readIds], eventId: null });
  };

  useEffect(() => {
    if (pendingFocus.current === "event" && event) {
      pendingFocus.current = null;
      eventHeadingRef.current?.focus();
    } else if (pendingFocus.current === "article" && selected && !event) {
      pendingFocus.current = null;
      headingRef.current?.focus();
    } else if (pendingFocus.current === "event-source" && selected && !event) {
      pendingFocus.current = null;
      eventButtonRef.current?.focus();
    } else if (pendingFocus.current && !selected && !event) {
      const target = readButtonRefs.current.get(pendingFocus.current);
      pendingFocus.current = null;
      target?.focus();
    }
  }, [selected, event]);

  if (event) {
    return (
      <article className="ahd-card ahd-card-pad ahd-stack" aria-label={event.name}>
        <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={closeEvent}>{selected ? "Back to article" : "Back to news"}</button>
        <div><span className="ahd-pill">Event</span><h2 className="ahd-h2" ref={eventHeadingRef} tabIndex={-1}>{event.name}</h2><p className="ahd-muted">{event.records.length} {event.records.length === 1 ? "article" : "articles"} in this save</p></div>
        <nav aria-label="Related records" style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
          {eventCountries.map(related => <button key={related.id} type="button" className="ahd-btn ahd-btn-sm" onClick={() => onCountry(related.id)}>View {related.name}</button>)}
          {eventParties.map(related => <button key={related.id} type="button" className="ahd-btn ahd-btn-sm" onClick={() => onParty(related.id)}>View {related.name}</button>)}
          {eventElections.map(related => <button key={related.id} type="button" className="ahd-btn ahd-btn-sm" onClick={() => onElection(related.id)}>View {related.name}</button>)}
        </nav>
        <div className="ahd-grid ahd-grid-3">{event.records.map(item => <article key={item.id} className="ahd-card ahd-card-pad" aria-label={`${item.title}${readIds.has(item.id) ? ", read" : ", unread"}`}><div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><h3 style={{ margin: 0, fontSize: "0.86rem", fontWeight: 750 }}>{item.title}</h3>{readIds.has(item.id) ? <span className="ahd-pill">Read</span> : null}</div><p className="ahd-muted" style={{ fontSize: "0.72rem", margin: "0.15rem 0 0" }}>{item.category ?? "General"} · {formatGameDate(item.date, clock)}</p><button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={() => select(item.id)} aria-label={`Read ${item.title}`}>Read article</button></article>)}</div>
      </article>
    );
  }

  if (selected) {
    return (
      <article className="ahd-card ahd-card-pad ahd-stack" aria-label={selected.title}>
        <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={() => select(null)}>Back to news</button>
        <div><span className="ahd-pill">Read</span><span className="ahd-pill">{selected.category ?? "General"}</span><h2 className="ahd-h2" ref={headingRef} tabIndex={-1}>{selected.title}</h2><p className="ahd-muted">{formatGameDate(selected.date, clock)}</p></div>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{selected.body}</p>
        <nav aria-label="Related records" style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
          {selected.country ? <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onCountry(selected.country!.id)}>View {selected.country.name}</button> : null}
          {selected.party ? <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onParty(selected.party!.id)}>View {selected.party.name}</button> : null}
          {selected.election ? <button type="button" className="ahd-btn ahd-btn-sm" onClick={() => onElection(selected.election!.id)}>View {selected.election.name}</button> : null}
        </nav>
        {selected.event ? <section role="region" aria-label="Event context" className="ahd-card ahd-card-pad"><h3 className="ahd-h3">Event context</h3><p>{selected.event.name}</p><button ref={eventButtonRef} type="button" className="ahd-btn ahd-btn-sm" onClick={() => openEvent(selected.event!.id)}>View {selected.event.name}</button></section> : null}
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
      {filtered.length === 0 ? <div className="ahd-empty">No news matches these filters.</div> : <div className="ahd-grid ahd-grid-3">{filtered.map(item => <article key={item.id} className="ahd-card ahd-card-pad" aria-label={`${item.title}${readIds.has(item.id) ? ", read" : ", unread"}`}><div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}><h3 style={{ margin: 0, fontSize: "0.86rem", fontWeight: 750 }}>{item.title}</h3>{readIds.has(item.id) ? <span className="ahd-pill">Read</span> : null}</div><p className="ahd-muted" style={{ fontSize: "0.72rem", margin: "0.15rem 0 0" }}>{item.category ?? "General"} · {formatGameDate(item.date, clock)}</p><button type="button" ref={node => { if (node) readButtonRefs.current.set(item.id, node); else readButtonRefs.current.delete(item.id); }} className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={() => select(item.id)} aria-label={`Read ${item.title}`}>Read article</button></article>)}</div>}
    </div>
  );
}
