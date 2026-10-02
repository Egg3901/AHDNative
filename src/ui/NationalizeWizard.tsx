import { useState } from "react";
import type { NationalizationView } from "../game/nationalization";
import type { GameScreenProps } from "../game/types";
import { formatFinanceMoney } from "./FinancePanel";

/** Game NationalizeWizard: target, discounted/seizure tier, indicative quote,
 * then the authoritative command. A fair tier remains an API/legislation path. */
export function NationalizeWizard({ view, currency, busy, onAction }: {
  view: NationalizationView;
  currency: string;
  busy: boolean;
  onAction: GameScreenProps["onAction"];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tier, setTier] = useState<"discounted" | "seizure">("discounted");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selected = view.targets.find(target => target.corporationId === selectedId);
  const blocked = busy || submitting;
  const submit = async () => {
    if (!selected || blocked) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const ok = await onAction("nationalizeCorporation", { corporationId: selected.corporationId, tier });
      if (ok === true) {
        setFeedback(`${selected.name} nationalized.`);
        setSelectedId(null);
      }
    } finally {
      setSubmitting(false);
    }
  };
  return <section className="ahd-card ahd-card-pad ahd-stack" aria-label="Nationalize an asset">
    <h2 className="ahd-h2">Nationalize an asset</h2>
    <p className="ahd-muted">Executive power reaches failing or NPC firms headquartered here. Solvent private corporations require legislation.</p>
    {view.targets.length === 0 ? <p className="ahd-muted">No eligible targets right now.</p> : <div className="ahd-stack">
      {view.targets.map(target => <label key={target.corporationId} className="ahd-card ahd-card-pad" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
        <input type="radio" name="nationalization-target" checked={selectedId === target.corporationId}
          onChange={() => setSelectedId(target.corporationId)} disabled={blocked} />
        <span>{target.name}</span>
        <span className="ahd-muted">{target.ownerKind === "npc" ? "NPC-owned" : "Player-owned"} · {target.sectorCount} {target.sectorCount === 1 ? "sector" : "sectors"}</span>
      </label>)}
    </div>}
    <label className="ahd-field">
      <span className="ahd-label">Tier</span>
      <select className="ahd-select" value={tier} onChange={event => setTier(event.target.value === "seizure" ? "seizure" : "discounted")} disabled={blocked}>
        <option value="discounted">Discounted</option>
        <option value="seizure">Seizure (no compensation)</option>
      </select>
    </label>
    {selected && <div className="ahd-muted">
      Indicative compensation: <strong>{formatFinanceMoney(tier === "discounted" ? selected.discountedIndicativeLocal : 0, currency)}</strong>
      <p className="ahd-help">Final amount computed and debited at execution.</p>
    </div>}
    {selected?.ownerKind === "npc" && <p className="ahd-help">This target is NPC-owned. No investor-confidence or political penalty applies at any tier; only the cash cost differs.</p>}
    <button type="button" className="ahd-btn ahd-btn-primary" disabled={!selected || blocked} onClick={() => void submit()}>{blocked ? "Working..." : "Nationalize"}</button>
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}
