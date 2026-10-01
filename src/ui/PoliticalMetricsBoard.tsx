import { useState } from "react";
import type { PoliticalRegistryView } from "@ahdclient/engine";

const SOURCE_NAMES: Record<string, string> = {
  orders: "Ministerial orders", settings: "Department settings", military: "Military posture",
  estates: "Estates", energy: "Energy estates", infrastructure: "Infrastructure estates", legacy: "Older effects, fading",
};
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

/** Mobile adaptation of Game's overview > category > metric destination. */
export function PoliticalMetricsBoard({ registry, countryName }: { registry: PoliticalRegistryView; countryName: string }) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [metricId, setMetricId] = useState<string | null>(null);
  const category = registry.categories.find(row => row.id === categoryId);
  const metric = category?.metrics.find(row => row.id === metricId);
  return <div className="ahd-stack">
    <div className="ahd-card ahd-card-pad ahd-hero">
      <h2 className="ahd-h2">Political metrics</h2>
      <p className="ahd-muted">{countryName}</p>
      {!category && <p>Overall score <strong className="ahd-mono">{registry.overall.toFixed(1)} / 100</strong></p>}
    </div>
    {metric && category ? <>
      <button className="ahd-btn ahd-btn-ghost" onClick={() => setMetricId(null)}>Back to {category.name}</button>
      <article className="ahd-card ahd-card-pad" aria-label={metric.name}>
        <h2 className="ahd-h2">{metric.name}</h2>
        <p>{metric.description}</p>
        <p className="ahd-mono">{metric.value.toFixed(1)} / 100</p>
        <p className="ahd-muted">Ideological association: {signed(metric.lean)}. Association, not a quality judgment.</p>
        <h3 className="ahd-h3">Historical series</h3>
        <p className="ahd-muted">No historical series available.</p>
        <h3 className="ahd-h3">Cabinet, orders and estates</h3>
        <p className="ahd-mono">{signed(metric.cabinet)} points</p>
        {metric.cabinetSources.map(source => <p key={source.id}>{SOURCE_NAMES[source.id] ?? source.id} <strong className="ahd-mono">{signed(source.value)} points</strong></p>)}
      </article>
      <div className="ahd-card ahd-card-pad" style={{ overflowX: "auto" }}>
        <h3 className="ahd-h3">Regional breakdown</h3>
        <table className="ahd-table" aria-label="Regional breakdown">
          <thead><tr><th>Region</th><th>Score</th><th>vs national</th></tr></thead>
          <tbody>{metric.regions.map(region => <tr key={region.regionId}><th scope="row">{region.name}</th><td className="ahd-mono">{region.value.toFixed(1)}</td><td className="ahd-mono">{signed(region.value - metric.value)}</td></tr>)}</tbody>
        </table>
      </div>
    </> : category ? <>
      <button className="ahd-btn ahd-btn-ghost" onClick={() => setCategoryId(null)}>Back to national overview</button>
      <div className="ahd-card ahd-card-pad"><h2 className="ahd-h2">{category.name}</h2><p className="ahd-mono">{category.score.toFixed(1)} / 100</p></div>
      {category.metrics.map(row => <article className="ahd-card ahd-card-pad" key={row.id}>
        <button className="ahd-btn ahd-btn-ghost" onClick={() => setMetricId(row.id)}>{row.name}</button>
        <p className="ahd-mono">{row.value.toFixed(1)} / 100</p><p className="ahd-muted">Ideological association: {signed(row.lean)}</p>
      </article>)}
    </> : <div className="ahd-grid ahd-grid-3">
      {registry.categories.map(row => <article className="ahd-card ahd-card-pad" key={row.id}>
        <button className="ahd-btn ahd-btn-ghost" onClick={() => { setCategoryId(row.id); setMetricId(null); }}>{row.name}</button>
        <p className="ahd-mono">{row.score.toFixed(1)} / 100</p>
      </article>)}
    </div>}
  </div>;
}
