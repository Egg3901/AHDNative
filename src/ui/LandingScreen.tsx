import { LandingGlobe } from "./LandingGlobe";
import type { EraChoice } from "../game/types";
import type { SaveMetadata } from "../game/storage";
import type { ReducedMotion } from "../preferences";
import "./ui.css";

/* Landing presentation for the home route. App owns all state and actions;
 * this component only renders them. Starting or loading a game still enters
 * Profile; this screen only collects the entry choice.
 */

export interface LandingScreenProps {
  eras: EraChoice[];
  saves: SaveMetadata[];
  worldActive: boolean;
  busy: boolean;
  error?: string;
  message?: string;
  buildLabel: string;
  reducedMotion: ReducedMotion;
  pendingDelete: SaveMetadata | null;
  onNew: () => void;
  onHelp: () => void;
  onSettings: () => void;
  onReturn: () => void;
  onReload: () => void;
  onImport: (file: File) => void;
  onLoad: (saved: SaveMetadata) => void;
  onRequestDelete: (saved: SaveMetadata) => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onlineBusy: boolean;
  onEnterMultiplayer: () => void;
}

export function LandingScreen({
  eras,
  saves,
  worldActive,
  busy,
  error,
  message,
  buildLabel,
  reducedMotion,
  pendingDelete,
  onNew,
  onHelp,
  onSettings,
  onReturn,
  onReload,
  onImport,
  onLoad,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
  onlineBusy,
  onEnterMultiplayer,
}: LandingScreenProps) {
  return <main className="ahd-screen ahd-landing"><div className="ahd-container ahd-landing-layout">
    <section className="ahd-landing-hero" aria-label="Begin your career">
      <LandingGlobe reducedMotion={reducedMotion} />
      <div className="ahd-landing-intro">
        <img className="ahd-landing-logo" src="ahd-logo.png" alt="" width={96} height={96} decoding="async" />
        <p className="ahd-eyebrow">Singleplayer · Offline</p>
        <h1 className="ahd-h1 ahd-landing-title">A House Divided</h1>
        <p className="ahd-muted ahd-landing-dek">Build your political career. Your world stays on this device.</p>
        {eras.length > 0 && (
          <ul className="ahd-era-chips" aria-label="Available eras">
            {eras.map(era => <li key={era.id}>{era.id}</li>)}
          </ul>
        )}
        {error && <p className="ahd-alert" role="alert">{error}</p>}
        {message && !error && <p className="ahd-notice" role="status">{message}</p>}
        {error && !eras.length && <button className="ahd-btn" onClick={onReload}>Reload app</button>}
        <div className="ahd-landing-actions">
          <button className="ahd-btn ahd-btn-primary ahd-landing-primary" disabled={busy || !eras.length} onClick={() => { onNew(); }}>New game</button>
          <button className="ahd-btn" disabled={busy || onlineBusy} onClick={onEnterMultiplayer}>
            {onlineBusy ? "Opening multiplayer..." : "Enter multiplayer"}
          </button>
          <p className="ahd-muted" style={{ margin: 0, fontSize: "0.78rem" }}>Local games do not need an account.</p>
          <div className="ahd-landing-secondary">
            <button className="ahd-btn" onClick={onHelp}>Help</button>
            <button className="ahd-btn" onClick={onSettings}>Settings</button>
          </div>
          {worldActive && <button className="ahd-btn" disabled={busy} onClick={onReturn}>Return to game</button>}
        </div>
        <p className="ahd-muted ahd-landing-build" style={{ fontSize: '0.75rem' }} aria-label="Build version">{buildLabel}</p>
      </div>
    </section>
    <section className="ahd-landing-saves" aria-label="Saved games">
      <label className="ahd-field">
        <span className="ahd-label">Import saved game</span>
        <input type="file" accept=".json,application/json" disabled={busy} onChange={event => {
          const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
          if (file) onImport(file);
        }} />
      </label>
      <h2 className="ahd-h2" style={{ marginTop: '1.5rem' }}>Saved games</h2>
      {!saves.length && <p className="ahd-muted">Your saved worlds will appear here.</p>}
      {saves.map(saved => {
        const isPending = pendingDelete?.slotId === saved.slotId;
        return <article className="ahd-card ahd-card-pad" key={saved.slotId} style={{ marginTop: '.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem' }}>{saved.playerName}</h3><p className="ahd-muted" style={{ margin: '0.2rem 0 0', fontSize: '0.78rem' }}>{saved.countryId} · Turn {saved.turn} · {new Date(saved.savedAt).toLocaleString()}</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
            <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => onLoad(saved)} aria-label={`Continue ${saved.playerName}`}>Continue</button>
            <button className="ahd-btn ahd-btn-sm ahd-btn-ghost" disabled={busy} id={`delete-request-${saved.slotId}`} onClick={() => onRequestDelete(saved)} aria-label={`Delete ${saved.playerName}`}>Delete</button>
          </div>
          {isPending && (
            <div
              role="dialog"
              aria-labelledby={`delete-title-${saved.slotId}`}
              aria-describedby={`delete-desc-${saved.slotId}`}
              style={{
                marginTop: '0.75rem',
                border: '1px solid var(--ahd-border)',
                borderRadius: 'var(--ahd-radius-sm)',
                background: 'var(--ahd-card-elevated)',
                padding: '0.75rem',
              }}
            >
              <h4 id={`delete-title-${saved.slotId}`} style={{ margin: 0, fontSize: '0.88rem', fontWeight: 750 }}>
                Delete {saved.playerName} · {saved.countryId} Turn {saved.turn}?
              </h4>
              <p id={`delete-desc-${saved.slotId}`} className="ahd-muted" style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', lineHeight: 1.5 }}>
                This will permanently delete this saved game. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  id={`delete-cancel-${saved.slotId}`}
                  className="ahd-btn ahd-btn-sm"
                  disabled={busy}
                  onClick={onCancelDelete}
                  autoFocus
                >
                  Cancel
                </button>
                <button
                  className="ahd-btn ahd-btn-sm ahd-btn-primary"
                  disabled={busy}
                  onClick={onConfirmDelete}
                  aria-label={`Confirm delete ${saved.playerName}`}
                >
                  {busy ? <span className="ahd-spinner" aria-hidden /> : null}
                  Confirm delete
                </button>
              </div>
            </div>
          )}
        </article>;
      })}
    </section>
    {busy && <p role="status">Loading your world...</p>}
  </div></main>;
}
