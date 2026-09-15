import { useEffect, useRef, useState } from "react";
import { MpModeSession, type MpSnapshot } from "../mp/adapter";
import { tauriMpBridgeHost, type MpBridgeHost } from "../mp/bridge";
import { MP_EXECUTE_ACTIONS } from "../mp/endpoints";
import "./ui.css";

/* Native multiplayer mode screen (#359). Renders authoritative server state
 * through the shared React UI: the MpModeSession adapter loads the player,
 * turn, and inbox, sends explicitly modeled mutations, and refreshes
 * authoritative reads before claiming completion. This screen never touches
 * the local SP engine or saves: unsupported actions are absent, not inert.
 */

export interface MpModeScreenProps {
  host?: MpBridgeHost;
  onAsk?: () => void;
  onExit: () => void;
}

const IDLE: MpSnapshot = {
  phase: "idle",
  userId: null,
  username: null,
  character: null,
  turn: null,
  inbox: null,
  notice: null,
  error: null,
  retryAfter: null,
};

function formatCountdown(iso: string | null): string | null {
  if (!iso) return null;
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return null;
  const minutes = Math.max(0, Math.round((target - Date.now()) / 60000));
  if (minutes < 60) return `Next turn in ~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `Next turn in ~${hours}h ${rest}m`;
}

export function MpModeScreen({ host, onAsk, onExit }: MpModeScreenProps) {
  const sessionRef = useRef<MpModeSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new MpModeSession(host ?? tauriMpBridgeHost());
  const [snapshot, setSnapshot] = useState<MpSnapshot>(IDLE);
  const [busy, setBusy] = useState(false);
  const [region, setRegion] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    const session = sessionRef.current!;
    let live = true;
    setBusy(true);
    void session.enter().then((next) => {
      if (live) setSnapshot(next);
    }).finally(() => {
      if (live) setBusy(false);
    });
    return () => {
      live = false;
      session.exit();
    };
  }, []);

  async function run(operation: (session: MpModeSession) => Promise<MpSnapshot>) {
    if (busy) return;
    setBusy(true);
    try {
      setSnapshot(await operation(sessionRef.current!));
    } finally {
      setBusy(false);
    }
  }

  const session = sessionRef.current;
  const phase = snapshot.phase;
  const needsSession = phase === "idle" || phase === "loading" || phase === "session-required" || phase === "signed-out" || phase === "auth-expired";
  const blocked = phase === "offline" || phase === "server-error" || phase === "rate-limited";

  return (
    <main className="ahd-screen ahd-mp">
      <div className="ahd-container ahd-mp-layout">
        <header className="ahd-mp-row" aria-label="Multiplayer header">
          <div style={{ minWidth: 0 }}>
            <p className="ahd-eyebrow">Multiplayer · Native</p>
            <h1 className="ahd-h1">Multiplayer</h1>
            {snapshot.username && <p className="ahd-muted" style={{ margin: 0 }}>Playing as {snapshot.username}</p>}
          </div>
          <div className="ahd-mp-row" style={{ marginLeft: "auto" }}>
            <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => void run((s) => s.refresh())}>
              Refresh
            </button>
            <button className="ahd-btn ahd-btn-sm" onClick={onExit}>Exit multiplayer</button>
          </div>
        </header>

        {snapshot.notice && <p className="ahd-notice" role="status">{snapshot.notice}</p>}
        {snapshot.error && <p className="ahd-alert" role="alert">{snapshot.error}</p>}
        {(phase === "rate-limited" && snapshot.retryAfter !== null) && (
          <p className="ahd-muted" role="status">Try again in about {snapshot.retryAfter} seconds.</p>
        )}
        {busy && <p role="status">Talking to the live game...</p>}

        {(phase === "idle" || phase === "loading") && !snapshot.error && (
          <p role="status">Loading your multiplayer game...</p>
        )}

        {(phase === "session-required" || phase === "signed-out" || phase === "auth-expired") && (
          <section className="ahd-card ahd-card-pad" aria-label="Sign in required">
            <h2 className="ahd-h2">
              {phase === "auth-expired" ? "Session expired" : "Sign in to play multiplayer"}
            </h2>
            <p className="ahd-muted">
              {phase === "auth-expired"
                ? "Your multiplayer session expired. Choose your account provider to reconnect securely."
                : "Choose your account provider. Native opens only the provider's secure authorization step and returns here automatically."}
            </p>
            <div className="ahd-mp-row">
              <button className="ahd-btn ahd-btn-primary" disabled={busy} onClick={() => void run((s) => s.signIn("discord"))}>
                Continue with Discord
              </button>
              <button className="ahd-btn" disabled={busy} onClick={() => void run((s) => s.signIn("google"))}>
                Continue with Google
              </button>
              <button className="ahd-btn" disabled={busy} onClick={() => void run((s) => s.refresh())}>
                Retry
              </button>
            </div>
          </section>
        )}

        {blocked && !needsSession && (
          <section className="ahd-card ahd-card-pad" aria-label="Connection issue">
            <h2 className="ahd-h2">
              {phase === "rate-limited" ? "Slow down" : phase === "server-error" ? "Live game hiccup" : "Connection lost"}
            </h2>
            <p className="ahd-muted">
              {phase === "rate-limited"
                ? "You sent requests too quickly. Wait a moment, then retry."
                : "Your last loaded state is kept below. Retry to reconnect and continue."}
            </p>
            <div className="ahd-mp-row">
              <button className="ahd-btn ahd-btn-primary" disabled={busy} onClick={() => void run((s) => s.refresh())}>
                Reconnect
              </button>
            </div>
          </section>
        )}

        {snapshot.character && (
          <section className="ahd-mp-grid" aria-label="Multiplayer status">
            <article className="ahd-card ahd-card-pad" aria-label="Player">
              <h2 className="ahd-h2">{snapshot.character.name}</h2>
              <dl className="ahd-mp-facts">
                {snapshot.character.party && (<><dt>Party</dt><dd>{snapshot.character.party}</dd></>)}
                {snapshot.character.homeState && (<><dt>Home</dt><dd>{snapshot.character.homeState}</dd></>)}
                {snapshot.character.countryId && (<><dt>Country</dt><dd>{snapshot.character.countryId}</dd></>)}
                {snapshot.character.actions !== null && (<><dt>Action points</dt><dd>{snapshot.character.actions}</dd></>)}
                {snapshot.character.cashOnHand !== null && (<><dt>Cash on hand</dt><dd>{snapshot.character.cashOnHand}</dd></>)}
                {snapshot.character.corporationName && (<><dt>Corporation</dt><dd>{snapshot.character.corporationName}</dd></>)}
              </dl>
            </article>
            {snapshot.turn && (
              <article className="ahd-card ahd-card-pad" aria-label="World turn">
                <h2 className="ahd-h2">Turn {snapshot.turn.currentTurn} · {snapshot.turn.currentYear}</h2>
                <dl className="ahd-mp-facts">
                  <dt>Status</dt>
                  <dd>
                    {snapshot.turn.isProcessing
                      ? `Processing${snapshot.turn.processingLabel ? `: ${snapshot.turn.processingLabel}` : ""}`
                      : snapshot.turn.paused
                        ? `Paused${snapshot.turn.pauseReason ? `: ${snapshot.turn.pauseReason}` : ""}`
                        : "Live"}
                  </dd>
                  {formatCountdown(snapshot.turn.nextScheduledTurn) && (
                    <><dt>Schedule</dt><dd>{formatCountdown(snapshot.turn.nextScheduledTurn)}</dd></>
                  )}
                </dl>
              </article>
            )}
          </section>
        )}

        {snapshot.character && (
          <section className="ahd-card ahd-card-pad" aria-label="Player actions">
            <h2 className="ahd-h2">Take action</h2>
            <p className="ahd-muted" style={{ marginTop: 0 }}>
              Actions run on the live game. Costs and refusals come from the server.
            </p>
            <div className="ahd-mp-row">
              <label className="ahd-field ahd-mp-input">
                <span className="ahd-label">Region (optional)</span>
                <input
                  value={region}
                  disabled={busy}
                  placeholder="e.g. CA"
                  onChange={(event) => setRegion(event.currentTarget.value)}
                />
              </label>
              <label className="ahd-field ahd-mp-input">
                <span className="ahd-label">Convert amount (donation only)</span>
                <input
                  value={amount}
                  disabled={busy}
                  inputMode="decimal"
                  placeholder="e.g. 250"
                  onChange={(event) => setAmount(event.currentTarget.value)}
                />
              </label>
            </div>
            <div className="ahd-mp-actions">
              {MP_EXECUTE_ACTIONS.map((action) => (
                <button
                  key={action.type}
                  className="ahd-btn"
                  disabled={busy}
                  title={action.description}
                  aria-label={`${action.name}: ${action.description}`}
                  onClick={() => {
                    const targetState = region.trim() ? region.trim() : undefined;
                    const convertAmount = amount.trim() ? Number(amount.trim()) : undefined;
                    void run((s) => s.performAction({ actionType: action.type, targetState, convertAmount }));
                  }}
                >
                  {action.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {snapshot.inbox && (
          <section className="ahd-card ahd-card-pad" aria-label="Notifications">
            <div className="ahd-mp-row">
              <h2 className="ahd-h2" style={{ margin: 0 }}>
                Inbox{snapshot.inbox.unreadCount > 0 ? ` (${snapshot.inbox.unreadCount} unread)` : ""}
              </h2>
              <button
                className="ahd-btn ahd-btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={busy || snapshot.inbox.unreadCount === 0}
                onClick={() => void run((s) => s.markAllNotificationsRead())}
              >
                Mark all read
              </button>
            </div>
            {snapshot.inbox.notifications.length === 0 && <p className="ahd-muted">No notifications.</p>}
            <ul className="ahd-mp-inbox">
              {snapshot.inbox.notifications.map((note) => (
                <li key={note.id} className="ahd-mp-inbox-row">
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: note.read ? 400 : 700 }}>
                      {note.title ?? "(no subject)"}{note.read ? "" : " · unread"}
                    </p>
                    {note.message && <p className="ahd-muted" style={{ margin: "0.2rem 0 0" }}>{note.message}</p>}
                  </div>
                  <div className="ahd-mp-row">
                    {!note.read && (
                      <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => void run((s) => s.markNotificationRead(note.id))}>
                        Mark read
                      </button>
                    )}
                    <button className="ahd-btn ahd-btn-sm ahd-btn-ghost" disabled={busy} onClick={() => void run((s) => s.archiveNotification(note.id))}>
                      Archive
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <footer className="ahd-footer ahd-mp-footer" aria-label="Multiplayer navigation">
        <div className="ahd-container ahd-footer-inner">
          <nav className="ahd-bottomnav ahd-mp-bottomnav" aria-label="Primary">
            <button type="button" className="ahd-bottomnav-item" data-active="true" aria-current="page" aria-label="Multiplayer">
              <span aria-hidden="true">●</span><span>Multiplayer</span>
            </button>
            <button type="button" className="ahd-bottomnav-item" aria-label="Ask" onClick={onAsk}>
              <span aria-hidden="true">?</span><span>Ask</span>
            </button>
            <button type="button" className="ahd-bottomnav-item" aria-label="Menu" onClick={onExit}>
              <span aria-hidden="true">☰</span><span>Menu</span>
            </button>
          </nav>
        </div>
      </footer>
    </main>
  );
}
