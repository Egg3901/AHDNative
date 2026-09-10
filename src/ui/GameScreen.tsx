/**
 * GameScreen — AHDNative primary game shell.
 *
 * Visual baseline adapted from public AHDGame chrome:
 *   src/app/globals.css (default tokens) and navbar/country tab density
 *   (compact cards, primary #dc2626, bg #14141c, border #2a2a3d).
 * Public source Egg3901/AHDGame. Layout is original, responsive for Tauri web.
 */
import { useMemo, useState } from "react";
import type { ActionView, GameScreenProps, GameView } from "../game/types";
import "./ui.css";

type TabId = "overview" | "actions" | "parties" | "elections" | "news";
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "actions", label: "Character" },
  { id: "parties", label: "Parties" },
  { id: "elections", label: "Elections" },
  { id: "news", label: "News" },
];

function formatMetric(v: number, fmt: GameView["metrics"][number]["format"]): string {
  if (fmt === "money") return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  if (fmt === "percent") return `${(v * 100).toFixed(1)}%`;
  return new Intl.NumberFormat(undefined).format(v);
}

function ActionRow({
  action,
  busy,
  regions,
  parties,
  onAction,
}: {
  action: ActionView;
  busy: boolean;
  regions: GameView["regions"];
  parties: GameView["parties"];
  onAction: GameScreenProps["onAction"];
}) {
  const [amount, setAmount] = useState("10");
  const [partyId, setPartyId] = useState(parties[0]?.id ?? "");
  const [regionId, setRegionId] = useState(regions[0]?.id ?? "");

  const [amountError, setAmountError] = useState<string | null>(null);
  const disabled = busy || !action.available;
  const hint = !action.available ? action.disabledReason ?? "Unavailable" : `Cost ${action.cost} actions`;

  const handle = () => {
    if (disabled) return;
    const params: Record<string, string | number> = {};
    if (action.requires === "amount") {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        setAmountError("Enter a positive whole amount.");
        return;
      }
      setAmountError(null);
      params.amount = n;
    }
    if (action.requires === "party") {
      if (!partyId || !parties.some((pp) => pp.id === partyId)) {
        return;
      }
      params.partyId = partyId;
    }
    if (action.requires === "region") {
      if (!regionId || !regions.some((rr) => rr.id === regionId)) {
        return;
      }
      params.regionId = regionId;
    }
    onAction(action.id, Object.keys(params).length ? params : undefined);
  };

  return (
    <div className="ahd-card ahd-card-pad" style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 750, fontSize: "0.86rem" }}>{action.name}</div>
          <div className="ahd-muted" style={{ fontSize: "0.76rem", lineHeight: 1.45 }}>{action.description}</div>
        </div>
        <span className="ahd-badge" aria-label={hint}>{action.available ? `${action.cost}` : "locked"}</span>
      </div>

      {action.requires === "amount" ? (
        <label className="ahd-field" style={{ maxWidth: "12rem" }}>
          <span className="ahd-label">Amount</span>
          <input className="ahd-input" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => { setAmount(e.target.value); if (amountError) setAmountError(null); }} disabled={busy} aria-label={`Amount for ${action.name}`} aria-invalid={!!amountError} aria-describedby={amountError ? `amount-error-${action.id}` : undefined} />
          {amountError ? <span id={`amount-error-${action.id}`} className="ahd-error-text" role="alert">{amountError}</span> : null}
        </label>
      ) : null}
      {action.requires === "party" ? (
        <label className="ahd-field" style={{ maxWidth: "16rem" }}>
          <span className="ahd-label">Party</span>
          <select className="ahd-select" value={partyId} onChange={(e) => setPartyId(e.target.value)} disabled={busy || parties.length === 0} aria-label={`Party for ${action.name}`}>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.abbreviation})</option>)}
            {parties.length === 0 ? <option value="">No parties</option> : null}
          </select>
        </label>
      ) : null}
      {action.requires === "region" ? (
        <label className="ahd-field" style={{ maxWidth: "16rem" }}>
          <span className="ahd-label">Region</span>
          <select className="ahd-select" value={regionId} onChange={(e) => setRegionId(e.target.value)} disabled={busy || regions.length === 0} aria-label={`Region for ${action.name}`}>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            {regions.length === 0 ? <option value="">No regions</option> : null}
          </select>
        </label>
      ) : null}

      <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm" onClick={handle} disabled={disabled} aria-disabled={disabled} aria-label={`${action.available ? "Take action" : "Unavailable"}: ${action.name}`}>
          {busy ? <span className="ahd-spinner" aria-hidden /> : null}
          {action.available ? `Take action: ${action.name}` : "Unavailable"}
        </button>
        <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{hint}{action.requires ? ` · requires ${action.requires}` : ""}</span>
      </div>
      {!action.available && action.disabledReason ? <p className="ahd-help" role="note">{action.disabledReason}</p> : null}
    </div>
  );
}

export function GameScreen({ world, busy, message, error, onAdvanceTurn, onSave, onExit, onAction }: GameScreenProps) {
  const [tab, setTab] = useState<TabId>("overview");

  const tabPanelId = useMemo(() => `ahd-panel-${tab}`, [tab]);

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const idx = TABS.findIndex((t) => t.id === tab);
    let next: typeof tab | null = null;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next = TABS[(idx + 1) % TABS.length].id;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      next = TABS[(idx - 1 + TABS.length) % TABS.length].id;
    } else if (e.key === "Home") {
      e.preventDefault(); next = TABS[0].id;
    } else if (e.key === "End") {
      e.preventDefault(); next = TABS[TABS.length - 1].id;
    }
    if (next) {
      setTab(next);
      requestAnimationFrame(() => {
        const el = document.getElementById(`ahd-tab-${next}`);
        el?.focus();
      });
    }
  };

  return (
    <div className="ahd-screen">
      <header className="ahd-header" role="banner">
        <div className="ahd-container ahd-header-inner">
          <div className="ahd-header-title">
            <div className="ahd-eyebrow">A House Divided</div>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "baseline", flexWrap: "wrap" }}>
              <strong style={{ fontSize: "0.9rem", letterSpacing: "-0.01em" }}>{world.countryName}</strong>
              <span className="ahd-muted" style={{ fontSize: "0.72rem" }}>{world.era} · Turn {world.turn} · {world.date}</span>
            </div>
            <div className="ahd-header-meta" aria-label="Player summary">
              <span>{world.player.name} · {world.player.partyName || "Independent"}</span>
              <span className="ahd-mono">${world.player.cash.toLocaleString()} cash</span>
              <span className="ahd-mono">{world.player.actions} actions</span>
              <span className="ahd-mono">{world.player.influence} influence</span>
            </div>
          </div>

          <div className="ahd-header-actions">
            <button type="button" className="ahd-btn ahd-btn-ghost ahd-btn-sm" onClick={onExit} disabled={busy} aria-label="Exit game">Exit</button>
            <button type="button" className="ahd-btn ahd-btn-sm" onClick={onSave} disabled={busy} aria-busy={busy} aria-label="Save game">
              {busy ? <span className="ahd-spinner" aria-hidden /> : null}
              Save
            </button>
            <button type="button" className="ahd-btn ahd-btn-primary ahd-btn-sm" onClick={onAdvanceTurn} disabled={busy} aria-busy={busy} aria-label="End turn">
              {busy ? <span className="ahd-spinner" aria-hidden /> : null}
              End turn
            </button>
          </div>
        </div>

        <div className="ahd-container" style={{ paddingBottom: "0.5rem" }}>
          {busy && message ? <div className="ahd-notice" role="status" aria-live="polite" style={{ marginBottom: "0.45rem" }}>{message}</div> : null}
          {error ? <div className="ahd-alert" role="alert" style={{ marginBottom: "0.45rem" }}>{error}</div> : null}
          {!busy && message && !error ? <div className="ahd-notice" role="status" style={{ marginBottom: "0.45rem" }}>{message}</div> : null}

          <nav aria-label="Game sections" onKeyDown={onTabKeyDown}>
            <div role="tablist" aria-label="Game sections" className="ahd-tabs">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  id={`ahd-tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={tabPanelId}
                  tabIndex={tab === t.id ? 0 : -1}
                  className="ahd-tab"
                  onClick={() => setTab(t.id)}
                  type="button"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </nav>
        </div>
      </header>

      <main className="ahd-container" style={{ paddingTop: "0.8rem", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <section
          id={tabPanelId}
          role="tabpanel"
          aria-labelledby={`ahd-tab-${tab}`}
          tabIndex={0}
          style={{ outline: "none" }}
        >
          {tab === "overview" ? (
            <div className="ahd-stack">
              <div className="ahd-card ahd-card-pad">
                <h2 className="ahd-h2">Overview</h2>
                <p className="ahd-muted" style={{ fontSize: "0.78rem", margin: "0.35rem 0 0" }}>
                  {world.countryName} — {world.era} · Turn {world.turn} · {world.date} · Player {world.player.name}
                </p>
                <dl style={{ marginTop: "0.65rem", display: "grid", gap: "0.35rem" }}>
                  <div className="ahd-kv"><dt>Cash</dt><dd className="ahd-mono">${world.player.cash.toLocaleString()}</dd></div>
                  <div className="ahd-kv"><dt>Funds</dt><dd className="ahd-mono">${world.player.funds.toLocaleString()}</dd></div>
                  <div className="ahd-kv"><dt>Influence</dt><dd className="ahd-mono">{world.player.influence}</dd></div>
                  <div className="ahd-kv"><dt>Favorability</dt><dd className="ahd-mono">{world.player.favorability}</dd></div>
                </dl>
              </div>

              {world.metrics.length === 0 ? (
                <div className="ahd-empty">No metrics for this world.</div>
              ) : (
                <div className="ahd-grid ahd-grid-3">
                  {world.metrics.map((m) => (
                    <div key={m.id} className="ahd-card ahd-card-pad">
                      <div className="ahd-muted" style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{m.label}</div>
                      <div style={{ fontSize: "1.05rem", fontWeight: 800, marginTop: "0.2rem" }} className="ahd-mono">{formatMetric(m.value, m.format)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === "actions" ? (
            <div className="ahd-stack">
              <div className="ahd-card ahd-card-pad">
                <h2 className="ahd-h2">Character</h2>
                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "0.4rem", fontSize: "0.78rem" }}>
                  <span><strong>{world.player.name}</strong> — {world.player.partyName || "Independent"}</span>
                  <span className="ahd-badge">{world.player.actions} actions</span>
                  <span className="ahd-badge">{world.player.influence} influence</span>
                </div>
              </div>

              <h3 style={{ fontSize: "0.82rem", fontWeight: 750, margin: "0.2rem 0 0" }}>Actions</h3>
              {world.actions.length === 0 ? (
                <div className="ahd-empty">No actions available.</div>
              ) : (
                <div className="ahd-stack">
                  {world.actions.map((a: ActionView) => (
                    <ActionRow key={a.id} action={a} busy={busy} regions={world.regions} parties={world.parties} onAction={onAction} />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === "parties" ? (
            <div className="ahd-stack">
              <div className="ahd-card ahd-card-pad">
                <h2 className="ahd-h2">Parties</h2>
                <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>{world.parties.length} parties in {world.countryName}</p>
              </div>
              {world.parties.length === 0 ? (
                <div className="ahd-empty">No parties in this world.</div>
              ) : (
                <div className="ahd-grid ahd-grid-2">
                  {world.parties.map((p) => (
                    <div key={p.id} className="ahd-card ahd-card-pad" style={{ borderLeft: `3px solid ${p.color}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
                        <strong style={{ fontSize: "0.86rem" }}>{p.name} <span className="ahd-muted" style={{ fontWeight: 600 }}>({p.abbreviation})</span></strong>
                        {p.isPlayerParty ? <span className="ahd-pill" style={{ background: "var(--ahd-primary)", color: "white" }}>Yours</span> : null}
                      </div>
                      <div className="ahd-muted" style={{ fontSize: "0.74rem", marginTop: "0.2rem" }}>{p.members.toLocaleString()} members · ${p.treasury.toLocaleString()} treasury</div>
                      <div style={{ marginTop: "0.3rem", height: "6px", borderRadius: 999, background: "var(--ahd-border)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, p.members / 50)}%`, height: "100%", background: p.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === "elections" ? (
            <div className="ahd-stack">
              <div className="ahd-card ahd-card-pad">
                <h2 className="ahd-h2">Elections</h2>
                <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>{world.elections.length} elections</p>
              </div>
              {world.elections.length === 0 ? (
                <div className="ahd-empty">No elections scheduled.</div>
              ) : (
                <div className="ahd-stack">
                  {world.elections.map((e) => (
                    <div key={e.id} className="ahd-card ahd-card-pad">
                      <div style={{ fontWeight: 700, fontSize: "0.86rem" }}>{e.title}</div>
                      <div className="ahd-muted" style={{ fontSize: "0.74rem" }}>{e.status} · {e.date}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === "news" ? (
            <div className="ahd-stack">
              <div className="ahd-card ahd-card-pad">
                <h2 className="ahd-h2">News</h2>
                <p className="ahd-muted" style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}>{world.news.length} items</p>
              </div>
              {world.news.length === 0 ? (
                <div className="ahd-empty">No news yet.</div>
              ) : (
                <div className="ahd-stack">
                  {world.news.map((n) => (
                    <article key={n.id} className="ahd-card ahd-card-pad">
                      <h3 style={{ margin: 0, fontSize: "0.86rem", fontWeight: 750 }}>{n.title}</h3>
                      <p className="ahd-muted" style={{ fontSize: "0.72rem", margin: "0.15rem 0 0" }}>{n.date}</p>
                      <p style={{ fontSize: "0.82rem", lineHeight: 1.55, margin: "0.4rem 0 0" }}>{n.body}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

export default GameScreen;
