import { useState } from "react";
import { addCanvassBoost } from "@ahdclient/engine";
import type { CanvassingView } from "../game/canvassing";
import type { GameScreenProps } from "../game/types";

export function CanvassingPanel({ view, busy, onAction, onBack }: {
  view: CanvassingView; busy: boolean; onAction: GameScreenProps["onAction"]; onBack: () => void;
}) {
  const [categoryId, setCategoryId] = useState(view.categories.length === 1 ? view.categories[0]!.id : "");
  const [groupId, setGroupId] = useState("");
  const [countText, setCountText] = useState("1");
  const [confirming, setConfirming] = useState(false);
  const category = view.categories.find(category => category.id === categoryId);
  const group = category?.groups.find(group => group.id === groupId);
  const count = Number(countText);
  const validCount = Number.isInteger(count) && count >= 1 && count <= 50;
  const max = Math.max(0, Math.min(50, Math.floor(view.actions), Math.floor(view.funds / view.fundsPerCanvass)));
  const error = view.error ?? (!validCount ? "Choose a whole count from 1 to 50." : count > max ? "Not enough actions or campaign funds for this batch." : undefined);
  const funds = view.fundsPerCanvass * count;
  const money = (amount: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: view.currency, maximumFractionDigits: 2 }).format(amount);
  const modifier = group && validCount ? addCanvassBoost(group.before, group.boost, count) : null;
  const submit = () => {
    if (!group || error || !view.regionId || busy) return;
    onAction("canvass", { regionId: view.regionId, demographicCategory: categoryId, demographicGroup: groupId, count });
    setConfirming(false);
  };
  return <section className="ahd-card ahd-card-pad ahd-stack" aria-label="Voter Canvassing">
    <h2 className="ahd-h2">Voter Canvassing</h2>
    <p>Target voters who align with your positions for maximum effectiveness.</p>
    {view.regionName ? <p>Boost turnout for specific demographics in your {view.source === "home" ? `home ${view.regionNoun}` : view.source === "travel" ? "travel state" : "primary campaign state"}: <strong>{view.regionName}</strong>.</p> : null}
    <p className="ahd-help">Each canvass: 1 AP and {money(view.fundsPerCanvass)} campaign funds. Maximum available: {max}.</p>
    {!view.error ? <>
      <label className="ahd-field"><span className="ahd-label">Demographic category</span><select className="ahd-select" aria-label="Canvass demographic category" value={categoryId} disabled={busy} onChange={event => { setCategoryId(event.target.value); setGroupId(""); setConfirming(false); }}>
        <option value="">Choose a category</option>{view.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select></label>
      <label className="ahd-field"><span className="ahd-label">Demographic group</span><select className="ahd-select" aria-label="Canvass demographic group" value={groupId} disabled={busy || !category} onChange={event => { setGroupId(event.target.value); setConfirming(false); }}>
        <option value="">Choose voters</option>{category?.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select></label>
      <label className="ahd-field"><span className="ahd-label">Number of canvasses</span><input className="ahd-input" aria-label="Number of canvasses" type="number" min="1" max="50" step="1" inputMode="numeric" value={countText} disabled={busy} onChange={event => { setCountText(event.target.value); setConfirming(false); }} /></label>
      {group && modifier !== null ? <div className="ahd-notice" role="status">
        <strong>{group.name} in {view.regionName}</strong><br />
        Turnout modifier: {group.before.toFixed(3)} to {modifier.toFixed(3)} percentage points.<br />
        Turnout: {Math.max(0, Math.min(100, group.turnout + group.before)).toFixed(2)}% to {Math.max(0, Math.min(100, group.turnout + modifier)).toFixed(2)}%.<br />
        Total cost: {count} AP and {money(funds)} campaign funds.
      </div> : null}
      {confirming ? <div role="group" aria-label="Confirm voter canvassing" className="ahd-stack">
        <p>Canvass {group?.name} in {view.regionName} {count} {count === 1 ? "time" : "times"} for {count} AP and {money(funds)}?</p>
        <button className="ahd-btn ahd-btn-primary" type="button" disabled={busy || !!error} onClick={submit}>Confirm canvassing</button>
        <button className="ahd-btn" type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
      </div> : <button className="ahd-btn ahd-btn-primary" type="button" disabled={busy || !group || !!error} onClick={() => setConfirming(true)}>Review canvassing</button>}
    </> : null}
    {error ? <p className="ahd-error-text" role="alert">{error}</p> : null}
    <button className="ahd-btn" type="button" onClick={onBack}>Back to Actions</button>
  </section>;
}
