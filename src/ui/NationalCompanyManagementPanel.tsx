import { useState } from "react";
import type { GameScreenProps } from "../game/types";
import type { NationalCompanyManagementView } from "../game/nationalCompanyManagement";

export function NationalCompanyManagementPanel({ view, busy, onAction }: {
  view: NationalCompanyManagementView; busy: boolean; onAction: GameScreenProps["onAction"];
}) {
  const [industry, setIndustry] = useState<string>(view.splitTypes[0] ?? "");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string>();
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const blocked = busy || submitting;
  const split = async () => {
    if (blocked || !industry || name.trim().length < 2) return;
    setSubmitting(true); setMessage(undefined);
    try {
      if (await onAction("splitNationalCorporation", { sectorType: industry, newCorpName: name, countryId: view.countryId }) === true) { setMessage(`${name.trim()} created.`); setName(""); }
    } finally { setSubmitting(false); }
  };
  const merge = async (sectorType: string, intoCorpId: string) => {
    if (blocked) return;
    setSubmitting(true); setMessage(undefined);
    try {
      if (await onAction("mergeNationalCorporation", { sectorType, countryId: view.countryId, ...(intoCorpId ? { intoCorpId } : {}) }) === true) {
        const targetName = view.corporations.find(corporation => corporation.id === intoCorpId)?.name ?? "the primary National Corporation";
        setMessage(`${sectorType.replaceAll("_", " ")} merged into ${targetName}.`);
      }
    } finally { setSubmitting(false); }
  };
  return <section className="ahd-card ahd-card-pad ahd-stack" aria-label="Reorganize state corporations">
    <h3 style={{ margin: 0 }}>Reorganize state corporations</h3>
    <p className="ahd-muted">Move a whole industry into its own state corporation. Future takings of that industry follow it. No compensation or treasury payment applies.</p>
    <label className="ahd-field"><span className="ahd-label">Industry to split off</span>
      <select className="ahd-select" value={industry} onChange={event => setIndustry(event.target.value)} disabled={blocked || view.splitTypes.length === 0}>
        {view.splitTypes.map(type => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
      </select>
    </label>
    <label className="ahd-field"><span className="ahd-label">New state corporation name</span>
      <input className="ahd-input" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={80} disabled={blocked} />
    </label>
    <button type="button" className="ahd-btn" disabled={blocked || !view.splitTypes.some(type => type === industry) || name.trim().length < 2} onClick={() => void split()}>Split off industry</button>
    {view.corporations.filter(corporation => !corporation.isPrimary && corporation.assignedSectorTypes.length > 0).map(corporation => {
      const selectedId = mergeTargets[corporation.id] ?? "";
      const target = view.corporations.find(candidate => candidate.id === selectedId && candidate.id !== corporation.id);
      const targetId = target?.id ?? "";
      const targetName = target?.name ?? "primary";
      return <div key={corporation.id} className="ahd-stack">
        <strong>{corporation.name}</strong>
        <label className="ahd-field"><span className="ahd-label">Merge target for {corporation.name}</span>
          <select className="ahd-select" value={targetId} onChange={event => setMergeTargets(current => ({ ...current, [corporation.id]: event.target.value }))} disabled={blocked}>
            <option value="">Primary National Corporation</option>
            {view.corporations.filter(candidate => candidate.id !== corporation.id && candidate.id !== view.primaryId).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select>
        </label>
        {corporation.assignedSectorTypes.map(type => <button type="button" key={type} className="ahd-btn ahd-btn-sm ahd-btn-ghost" disabled={blocked} onClick={() => void merge(type, targetId)}>Merge {type.replaceAll("_", " ")} into {targetName}</button>)}
      </div>;
    })}
    {message && <p role="status">{message}</p>}
  </section>;
}
