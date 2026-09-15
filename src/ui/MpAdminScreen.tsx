import { useEffect, useRef, useState } from "react";
import { MpAdminSession, type MpAdminSnapshot } from "../mp/admin";
import { tauriMpBridgeHost, type MpBridgeHost } from "../mp/bridge";
import "./ui.css";

/* Read-only Native admin status screen (#359 admin slice). Gated by the
 * server-returned client-nav admin flag: non-admins see a denial, never
 * admin data. Shows the maintenance status only; nothing here mutates,
 * embeds, or links to another client app.
 */

export interface MpAdminScreenProps {
  host?: MpBridgeHost;
  onBack: () => void;
}

const IDLE: MpAdminSnapshot = {
  phase: "idle",
  isAdmin: false,
  isModerator: false,
  status: null,
  notice: null,
  error: null,
};

export function MpAdminScreen({ host, onBack }: MpAdminScreenProps) {
  const sessionRef = useRef<MpAdminSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new MpAdminSession(host ?? tauriMpBridgeHost());
  const [snapshot, setSnapshot] = useState<MpAdminSnapshot>(IDLE);
  const [busy, setBusy] = useState(false);

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

  async function run(operation: (session: MpAdminSession) => Promise<MpAdminSnapshot>) {
    if (busy) return;
    setBusy(true);
    try {
      setSnapshot(await operation(sessionRef.current!));
    } finally {
      setBusy(false);
    }
  }

  const phase = snapshot.phase;

  return (
    <main className="ahd-screen ahd-mp">
      <div className="ahd-container ahd-mp-layout">
        <header className="ahd-mp-row" aria-label="Admin header">
          <div style={{ minWidth: 0 }}>
            <p className="ahd-eyebrow">Admin · Native</p>
            <h1 className="ahd-h1" id="mp-admin-top" tabIndex={-1}>Admin status</h1>
            <p className="ahd-muted" style={{ margin: 0 }}>Read-only site triage for live-game admins.</p>
          </div>
          <div className="ahd-mp-row" style={{ marginLeft: "auto" }}>
            <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => void run((s) => s.refresh())}>
              Refresh
            </button>
            <button className="ahd-btn ahd-btn-sm" onClick={onBack}>Back</button>
          </div>
        </header>

        {snapshot.error && <p className="ahd-alert" role="alert">{snapshot.error}</p>}
        {busy && <p role="status">Talking to the live game...</p>}

        {(phase === "idle" || phase === "loading") && !snapshot.error && (
          <p role="status">Checking admin access...</p>
        )}

        {phase === "denied" && (
          <section className="ahd-card ahd-card-pad" aria-label="Access denied">
            <h2 className="ahd-h2">Not an admin</h2>
            <p className="ahd-muted">
              The live game reports this account is not an admin, so there is no admin data to show here.
            </p>
          </section>
        )}

        {(phase === "signed-out" || phase === "offline" || phase === "server-error") && (
          <section className="ahd-card ahd-card-pad" aria-label="Connection issue">
            <h2 className="ahd-h2">
              {phase === "signed-out" ? "Session expired" : phase === "server-error" ? "Live game hiccup" : "Connection lost"}
            </h2>
            <div className="ahd-mp-row">
              <button className="ahd-btn ahd-btn-primary" disabled={busy} onClick={() => void run((s) => s.refresh())}>
                Reconnect
              </button>
            </div>
          </section>
        )}

        {phase === "ready" && snapshot.status && (
          <section className="ahd-card ahd-card-pad" aria-label="Site status">
            <h2 className="ahd-h2">Site status</h2>
            <dl className="ahd-mp-facts">
              <dt>Mode</dt><dd>{snapshot.status.mode}</dd>
              <dt>State</dt><dd>{snapshot.status.enabled ? "Maintenance on" : "Maintenance off"}</dd>
              {snapshot.status.reason && (<><dt>Reason</dt><dd>{snapshot.status.reason}</dd></>)}
              {snapshot.status.expectedEnd && (<><dt>Expected end</dt><dd>{snapshot.status.expectedEnd}</dd></>)}
              {snapshot.status.enabledBy && (<><dt>Set by</dt><dd>{snapshot.status.enabledBy}</dd></>)}
              {snapshot.status.enabledAt && (<><dt>Set at</dt><dd>{snapshot.status.enabledAt}</dd></>)}
            </dl>
          </section>
        )}
      </div>
    </main>
  );
}
