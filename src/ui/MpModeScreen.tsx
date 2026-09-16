import { useEffect, useRef, useState } from "react";
import {
  ASK_ICON_PATH,
  MENU_ICON_PATH,
  MULTIPLAYER_ICON_PATH,
  NavIcon,
} from "./MobileNavigation";
import { MpModeSession, type MpSnapshot } from "../mp/adapter";
import { tauriMpBridgeHost, type MpBridgeHost } from "../mp/bridge";
import { MP_EXECUTE_ACTIONS, MP_NOTIFICATION_TYPES, MP_SNOOZE_MINUTES_DEFAULT } from "../mp/endpoints";
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
  mailInbox: null,
  mailSent: null,
  notice: null,
  error: null,
  retryAfter: null,
};

/* Single-view drill-in (#362): the ready screen stays fully mounted (one
 * scroll, no hidden state) while the overview jump-nav moves focus to a
 * section and each section offers a sibling back row. Buttons live outside
 * the audited regions so the action set stays exactly the server set.
 */
function jumpTo(id: string) {
  window.location.hash = id;
  const target = document.getElementById(id);
  target?.focus({ preventScroll: true });
  target?.scrollIntoView?.();
}

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
  const [runs, setRuns] = useState<1 | 5 | 10>(1);
  const [snooze, setSnooze] = useState("");
  const [prefType, setPrefType] = useState<string>("turn_advance");
  /* Player mail slice: which pane owns the single notice/error display, the
   * open reader message, and the compose draft. The notice/error pair renders
   * exactly once: inside Player mail after a mail op, globally otherwise.
   */
  const [noticeScope, setNoticeScope] = useState<"general" | "mail">("general");
  const [openMailId, setOpenMailId] = useState<string | null>(null);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  useEffect(() => {
    const session = sessionRef.current!;
    let live = true;
    setBusy(true);
    setNoticeScope("general");
    void session.enter().then((next) => {
      // Mail pages load on demand, never on enter: opening this screen is
      // the demand, so chain one loadMail before the first paint. Chaining
      // keeps the initial call order deterministic for the call-order tests.
      if (next.phase === "ready" && next.userId) return session.loadMail();
      return next;
    }).then((next) => {
      if (live) setSnapshot(next);
    }).finally(() => {
      if (live) setBusy(false);
    });
    return () => {
      live = false;
      session.exit();
    };
  }, []);

  async function run(operation: (session: MpModeSession) => Promise<MpSnapshot>): Promise<MpSnapshot | null> {
    if (busy) return null;
    setBusy(true);
    try {
      const next = await operation(sessionRef.current!);
      setSnapshot(next);
      return next;
    } finally {
      setBusy(false);
    }
  }

  function runGeneral(operation: (session: MpModeSession) => Promise<MpSnapshot>) {
    setNoticeScope("general");
    void run(operation);
  }

  function runMail(operation: (session: MpModeSession) => Promise<MpSnapshot>): Promise<MpSnapshot | null> {
    setNoticeScope("mail");
    return run(operation);
  }

  const session = sessionRef.current;
  /* Reader lookup runs against the loaded pages: there is no single-mail
   * fetch endpoint, so an id missing from both pages closes the reader. */
  const inboxMails = snapshot.mailInbox?.mails ?? [];
  const sentMails = snapshot.mailSent?.mails ?? [];
  const openInboxMail = openMailId ? (inboxMails.find((mail) => mail.id === openMailId) ?? null) : null;
  const openSentMail = openMailId && !openInboxMail
    ? (sentMails.find((mail) => mail.id === openMailId) ?? null)
    : null;
  const openMail = openInboxMail ?? openSentMail;

  function replyToOpenMail() {
    if (!openInboxMail?.fromCharacterId) return;
    setComposeTo(openInboxMail.fromCharacterId);
    setComposeSubject(
      /^re:/i.test(openInboxMail.subject) ? openInboxMail.subject : `Re: ${openInboxMail.subject}`,
    );
    setComposeBody("");
  }

  function sendComposedMail() {
    const toCharacterId = composeTo;
    const subject = composeSubject;
    const body = composeBody;
    void runMail((s) => s.sendMail({ toCharacterId, subject, body })).then((next) => {
      if (next?.notice === "Mail sent.") {
        setComposeTo("");
        setComposeSubject("");
        setComposeBody("");
      }
    });
  }

  const phase = snapshot.phase;
  const needsSession = phase === "idle" || phase === "loading" || phase === "session-required" || phase === "signed-out" || phase === "auth-expired";
  const blocked = phase === "offline" || phase === "server-error" || phase === "rate-limited";

  return (
    <main className="ahd-screen ahd-mp">
      <div className="ahd-container ahd-mp-layout">
        <header className="ahd-mp-row" aria-label="Multiplayer header">
          <div style={{ minWidth: 0 }}>
            <p className="ahd-eyebrow">Multiplayer · Native</p>
            <h1 className="ahd-h1" id="mp-top" tabIndex={-1}>Multiplayer</h1>
            {snapshot.username && <p className="ahd-muted" style={{ margin: 0 }}>Playing as {snapshot.username}</p>}
          </div>
          <div className="ahd-mp-row" style={{ marginLeft: "auto" }}>
            <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => void runGeneral((s) => s.refresh())}>
              Refresh
            </button>
            <button className="ahd-btn ahd-btn-sm" onClick={onExit}>Exit multiplayer</button>
          </div>
        </header>

        {snapshot.character && (
          <nav className="ahd-mp-row ahd-mp-sections" aria-label="Multiplayer sections">
            <span className="ahd-label">Sections</span>
            <button className="ahd-btn ahd-btn-sm" onClick={() => jumpTo("mp-status")}>
              Status
            </button>
            <button className="ahd-btn ahd-btn-sm" onClick={() => jumpTo("mp-actions")}>
              Actions
            </button>
            <button className="ahd-btn ahd-btn-sm" onClick={() => jumpTo("mp-inbox")}>
              Inbox{snapshot.inbox && snapshot.inbox.unreadCount > 0 ? ` (${snapshot.inbox.unreadCount} unread)` : ""}
            </button>
            <button className="ahd-btn ahd-btn-sm" onClick={() => jumpTo("mp-mail")}>
              Player mail{snapshot.mailInbox && snapshot.mailInbox.unreadCount > 0 ? ` (${snapshot.mailInbox.unreadCount} unread)` : ""}
            </button>
          </nav>
        )}

        {noticeScope !== "mail" && snapshot.notice && <p className="ahd-notice" role="status">{snapshot.notice}</p>}
        {noticeScope !== "mail" && snapshot.error && <p className="ahd-alert" role="alert">{snapshot.error}</p>}
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
            <p className="ahd-muted">
              On a phone or other single-view device this step briefly leaves this screen and comes
              straight back after you approve. Multiplayer stays fully native.
            </p>
            <div className="ahd-mp-row">
              <button className="ahd-btn ahd-btn-primary" disabled={busy} onClick={() => void runGeneral((s) => s.signIn("discord"))}>
                Continue with Discord
              </button>
              <button className="ahd-btn" disabled={busy} onClick={() => void runGeneral((s) => s.signIn("google"))}>
                Continue with Google
              </button>
              <button className="ahd-btn" disabled={busy} onClick={() => void runGeneral((s) => s.refresh())}>
                Retry
              </button>
              <button className="ahd-btn ahd-btn-ghost" onClick={onExit}>
                Back
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
              <button className="ahd-btn ahd-btn-primary" disabled={busy} onClick={() => void runGeneral((s) => s.refresh())}>
                Reconnect
              </button>
            </div>
          </section>
        )}

        {snapshot.character && (
          <>
          <section className="ahd-mp-grid" aria-label="Multiplayer status" id="mp-status" tabIndex={-1}>
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
          <div className="ahd-mp-row ahd-mp-back">
            <button className="ahd-btn ahd-btn-sm ahd-btn-ghost" onClick={() => jumpTo("mp-top")}>
              Back to sections
            </button>
          </div>
          </>
        )}

        {snapshot.character && (
          <>
          <section className="ahd-card ahd-card-pad" aria-label="Player actions" id="mp-actions" tabIndex={-1}>
            <h2 className="ahd-h2">Take action</h2>
            <p className="ahd-muted" style={{ marginTop: 0 }}>
              Actions run on the live game. Costs and refusals come from the server.
            </p>
            <div className="ahd-mp-row" role="group" aria-label="Batch runs">
              <span className="ahd-label">Runs</span>
              {([1, 5, 10] as const).map((count) => (
                <button
                  key={count}
                  className="ahd-btn ahd-btn-sm"
                  disabled={busy}
                  aria-pressed={runs === count}
                  aria-label={`×${count}`}
                  onClick={() => setRuns(count)}
                >
                  ×{count}
                </button>
              ))}
            </div>
            <p className="ahd-muted" style={{ marginBottom: 0 }}>
              Batch ×5 and ×10 run on Fundraise, Campaign, Run Advertisements, Build Donor
              Network, and the two polls. Other actions always run once.
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
                    void runGeneral((s) => s.performAction({ actionType: action.type, targetState, convertAmount, count: runs }));
                  }}
                >
                  {action.name}
                </button>
              ))}
            </div>
          </section>
          <div className="ahd-mp-row ahd-mp-back">
            <button className="ahd-btn ahd-btn-sm ahd-btn-ghost" onClick={() => jumpTo("mp-top")}>
              Back to sections
            </button>
          </div>
          </>
        )}

        {snapshot.inbox && (
          <>
          <section className="ahd-card ahd-card-pad" aria-label="Notifications" id="mp-inbox" tabIndex={-1}>
            <div className="ahd-mp-row">
              <h2 className="ahd-h2" style={{ margin: 0 }}>
                Inbox{snapshot.inbox.unreadCount > 0 ? ` (${snapshot.inbox.unreadCount} unread)` : ""}
              </h2>
              <button
                className="ahd-btn ahd-btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={busy || snapshot.inbox.unreadCount === 0}
                onClick={() => void runGeneral((s) => s.markAllNotificationsRead())}
              >
                Mark all read
              </button>
            </div>
            {snapshot.inbox.notifications.length === 0 && <p className="ahd-muted">No notifications.</p>}
            <div className="ahd-mp-row">
              <label className="ahd-field ahd-mp-input">
                <span className="ahd-label">Snooze length (minutes, default {MP_SNOOZE_MINUTES_DEFAULT})</span>
                <input
                  value={snooze}
                  disabled={busy}
                  inputMode="numeric"
                  placeholder={String(MP_SNOOZE_MINUTES_DEFAULT)}
                  onChange={(event) => setSnooze(event.currentTarget.value)}
                />
              </label>
            </div>
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
                      <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => void runGeneral((s) => s.markNotificationRead(note.id))}>
                        Mark read
                      </button>
                    )}
                    <button
                      className="ahd-btn ahd-btn-sm"
                      disabled={busy}
                      onClick={() => {
                        const trimmed = snooze.trim();
                        const minutes = trimmed ? Number(trimmed) : undefined;
                        void runGeneral((s) => s.snoozeNotification(note.id, minutes));
                      }}
                    >
                      Snooze
                    </button>
                    <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => void runGeneral((s) => s.unsnoozeNotification(note.id))}>
                      Unsnooze
                    </button>
                    <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => void runGeneral((s) => s.unarchiveNotification(note.id))}>
                      Unarchive
                    </button>
                    <button className="ahd-btn ahd-btn-sm ahd-btn-ghost" disabled={busy} onClick={() => void runGeneral((s) => s.archiveNotification(note.id))}>
                      Archive
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="ahd-mp-row" style={{ marginTop: "0.6rem" }}>
              <label className="ahd-field ahd-mp-input">
                <span className="ahd-label">Notification type</span>
                <select
                  value={prefType}
                  disabled={busy}
                  onChange={(event) => setPrefType(event.currentTarget.value)}
                >
                  {MP_NOTIFICATION_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
              <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => void runGeneral((s) => s.setNotificationPreference("mute", prefType))}>
                Mute
              </button>
              <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => void runGeneral((s) => s.setNotificationPreference("unmute", prefType))}>
                Unmute
              </button>
            </div>
          </section>
          <div className="ahd-mp-row ahd-mp-back">
            <button className="ahd-btn ahd-btn-sm ahd-btn-ghost" onClick={() => jumpTo("mp-top")}>
              Back to sections
            </button>
          </div>
          </>
        )}

        {snapshot.character && (
          <>
          <section className="ahd-card ahd-card-pad" aria-label="Player mail" id="mp-mail" tabIndex={-1}>
            <div className="ahd-mp-row">
              <h2 className="ahd-h2" style={{ margin: 0 }}>Player mail</h2>
              <button
                className="ahd-btn ahd-btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={busy}
                onClick={() => void runMail((s) => s.loadMail())}
              >
                Refresh mail
              </button>
            </div>
            {snapshot.mailInbox && (
              <p className="ahd-muted" style={{ marginBottom: 0 }}>
                {snapshot.mailInbox.unreadCount > 0
                  ? `${snapshot.mailInbox.unreadCount} unread`
                  : "No unread mail"}
              </p>
            )}
            {noticeScope === "mail" && snapshot.notice && <p className="ahd-notice" role="status">{snapshot.notice}</p>}
            {noticeScope === "mail" && snapshot.error && <p className="ahd-alert" role="alert">{snapshot.error}</p>}
            {!snapshot.mailInbox || !snapshot.mailSent ? (
              <p className="ahd-muted">Player mail is loading...</p>
            ) : (
              <>
                <h3 className="ahd-h2">Inbox</h3>
                {inboxMails.length === 0 && <p className="ahd-muted">No received mail.</p>}
                <ul className="ahd-mp-inbox">
                  {inboxMails.map((mail) => (
                    <li key={mail.id} className="ahd-mp-inbox-row">
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: mail.read ? 400 : 700 }}>
                          <span>{mail.subject}</span>{mail.read ? "" : " · unread"}
                        </p>
                        <p className="ahd-muted" style={{ margin: "0.2rem 0 0" }}>
                          {mail.fromName ? `from ${mail.fromName}` : "system mail"}
                        </p>
                      </div>
                      <div className="ahd-mp-row">
                        <button
                          className="ahd-btn ahd-btn-sm"
                          disabled={busy}
                          aria-label={`Open ${mail.subject} from ${mail.fromName ?? "system mail"}`}
                          onClick={() => setOpenMailId(mail.id)}
                        >
                          Open
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <h3 className="ahd-h2">Sent</h3>
                {sentMails.length === 0 && <p className="ahd-muted">No sent mail.</p>}
                <ul className="ahd-mp-inbox">
                  {sentMails.map((mail) => (
                    <li key={mail.id} className="ahd-mp-inbox-row">
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0 }}>{mail.subject}</p>
                        <p className="ahd-muted" style={{ margin: "0.2rem 0 0" }}>
                          {mail.toName ? `to ${mail.toName}` : "to recipient"}
                        </p>
                      </div>
                      <div className="ahd-mp-row">
                        <button
                          className="ahd-btn ahd-btn-sm"
                          disabled={busy}
                          aria-label={`Open ${mail.subject} to ${mail.toName ?? "recipient"}`}
                          onClick={() => setOpenMailId(mail.id)}
                        >
                          Open
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {openMail && (
              <article className="ahd-card ahd-card-pad" aria-label="Open mail">
                <h3 className="ahd-h2" style={{ marginTop: 0 }}>{openMail.subject}</h3>
                <p className="ahd-muted" style={{ marginTop: 0 }}>
                  {openSentMail
                    ? (openMail.toName ? `To ${openMail.toName}` : "To recipient")
                    : (openMail.fromName ? `From ${openMail.fromName}` : "System mail")}
                </p>
                <p style={{ whiteSpace: "pre-wrap" }}>{openMail.body}</p>
                <div className="ahd-mp-row">
                  {openInboxMail?.fromCharacterId && (
                    <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={replyToOpenMail}>
                      Reply
                    </button>
                  )}
                  {openInboxMail && !openInboxMail.read && (
                    <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => void runMail((s) => s.markMailRead(openMail.id))}>
                      Mark read
                    </button>
                  )}
                  {openInboxMail && (
                    <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => void runMail((s) => s.reportMail(openMail.id))}>
                      Report mail
                    </button>
                  )}
                  <button
                    className="ahd-btn ahd-btn-sm ahd-btn-ghost"
                    disabled={busy}
                    onClick={() => void runMail((s) => (openSentMail ? s.deleteSentMail(openMail.id) : s.deleteMail(openMail.id)))}
                  >
                    Remove
                  </button>
                  <button className="ahd-btn ahd-btn-sm ahd-btn-ghost" onClick={() => setOpenMailId(null)}>
                    Close
                  </button>
                </div>
              </article>
            )}
            <h3 className="ahd-h2">Compose</h3>
            <p className="ahd-muted" style={{ marginTop: 0 }}>
              Send player mail with a pasted 24-character recipient character ID.
            </p>
            <div className="ahd-mp-row">
              <label className="ahd-field ahd-mp-input">
                <span className="ahd-label">Recipient character ID</span>
                <input
                  value={composeTo}
                  disabled={busy}
                  placeholder="e.g. 507f1f77bcf86cd799439012"
                  onChange={(event) => setComposeTo(event.currentTarget.value)}
                />
              </label>
              <label className="ahd-field ahd-mp-input">
                <span className="ahd-label">Subject</span>
                <input
                  value={composeSubject}
                  disabled={busy}
                  placeholder="Subject"
                  onChange={(event) => setComposeSubject(event.currentTarget.value)}
                />
              </label>
            </div>
            <div className="ahd-mp-row">
              <label className="ahd-field ahd-mp-input">
                <span className="ahd-label">Message</span>
                <textarea
                  value={composeBody}
                  disabled={busy}
                  placeholder="Write your message"
                  onChange={(event) => setComposeBody(event.currentTarget.value)}
                />
              </label>
            </div>
            <div className="ahd-mp-row">
              <button className="ahd-btn ahd-btn-sm ahd-btn-primary" disabled={busy} onClick={sendComposedMail}>
                Send mail
              </button>
            </div>
          </section>
          <div className="ahd-mp-row ahd-mp-back">
            <button className="ahd-btn ahd-btn-sm ahd-btn-ghost" onClick={() => jumpTo("mp-top")}>
              Back to sections
            </button>
          </div>
          </>
        )}
      </div>
      <footer className="ahd-footer ahd-mp-footer" aria-label="Multiplayer navigation">
        <div className="ahd-container ahd-footer-inner">
          <nav className="ahd-bottomnav ahd-mp-bottomnav" aria-label="Primary">
            <button type="button" className="ahd-bottomnav-item" data-active="true" aria-current="page" aria-label="Multiplayer">
              <NavIcon path={MULTIPLAYER_ICON_PATH} label="" /><span>Multiplayer</span>
            </button>
            <button type="button" className="ahd-bottomnav-item" aria-label="Ask" onClick={onAsk}>
              <NavIcon path={ASK_ICON_PATH} label="" /><span>Ask</span>
            </button>
            <button type="button" className="ahd-bottomnav-item" aria-label="Menu" onClick={onExit}>
              <NavIcon path={MENU_ICON_PATH} label="" /><span>Menu</span>
            </button>
          </nav>
        </div>
      </footer>
    </main>
  );
}
