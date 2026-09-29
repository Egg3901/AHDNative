/** Shared action filters. A missing availability count makes no eligibility claim. */
export function ActionCategories<T extends string>({ items, selected, onSelect }: {
  items: { id: T; label: string; total: number; eligible?: number }[];
  selected: T;
  onSelect: (id: T) => void;
}) {
  return <div role="tablist" aria-label="Filter actions by category" style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
    {items.map((item) => <button key={item.id} type="button" role="tab"
      aria-selected={selected === item.id}
      aria-label={item.eligible === undefined ? `${item.label}, ${item.total} actions` : `${item.label}, ${item.eligible} of ${item.total} available`}
      className="ahd-btn ahd-btn-sm" data-active={selected === item.id ? "true" : undefined}
      onClick={() => onSelect(item.id)}>
      {item.label} <span className="ahd-badge" aria-hidden="true">{item.eligible === undefined ? item.total : `${item.eligible}/${item.total}`}</span>
    </button>)}
  </div>;
}
