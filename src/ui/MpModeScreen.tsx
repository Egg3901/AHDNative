import { useEffect, useRef, useState } from "react";
import {
  ASK_ICON_PATH,
  BOTTOM_TABS,
  MENU_ICON_PATH,
  NavIcon,
} from "./MobileNavigation";
import { MpModeSession, type MpSnapshot } from "../mp/adapter";
import { tauriMpBridgeHost, type MpBridgeHost } from "../mp/bridge";
import { isCabinetCountryCode, isCabinetPositionId, isCorporationId, isElectionId, isGovernorCountryCode, isGovernorStateId, isUnionId } from "../mp/validators";
import { MP_EXECUTE_ACTIONS, MP_NOTIFICATION_TYPES, MP_SNOOZE_MINUTES_DEFAULT } from "../mp/endpoints";
import { formatTurnCountdown } from "../mp/validators";
import { MpAdminScreen } from "./MpAdminScreen";
import { installFooterClearance } from "./footerClearance";
import "./ui.css";

/* Native multiplayer mode screen (#359). Renders authoritative server state
 * through the shared React UI: the MpModeSession adapter loads the player,
 * turn, inbox, and on-demand player mail, sends explicitly modeled
 * mutations, and refreshes authoritative reads before claiming completion.
 * Read-only admin status is a separate authority-gated surface. This
 * screen never touches the local SP engine or saves: unsupported actions
 * are absent, not inert.
 */

export interface MpModeScreenProps {
  host?: MpBridgeHost;
  onAsk?: () => void;
  onExit: () => void;
}

/* Presence freshness cadence (#359 presence slice): mirrors the reference
 * StatusBar, which re-polls GET /api/players/online every 5 minutes plus on
 * visibility return. loadPresence never touches phase or error state, so a
 * failed poll stays absent without disturbing the session; the adapter
 * no-ops entirely without a signed-in session. */
const PRESENCE_POLL_MS = 300_000;

const IDLE: MpSnapshot = {
  phase: "idle",
  userId: null,
  username: null,
  character: null,
  turn: null,
  capabilities: null,
  electionDetail: null,
  corporationDetail: null,
  unionDetail: null,
  cabinetDetail: null,
  governorDetail: null,
  inbox: null,
  mailInbox: null,
  mailSent: null,
  presence: null,
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

/**
 * Chain an independent presence load after a refresh that landed ready
 * (#359 presence slice). Presence never blocks the refresh and never fails
 * it: loadPresence keeps the last good value (or stays absent) on any
 * failure, so reconnect freshness arrives without risking the core views.
 */
function withPresenceRefresh(session: MpModeSession, base: Promise<MpSnapshot>): Promise<MpSnapshot> {
  return base.then((next) => {
    if (next.phase === "ready" && next.userId) return session.loadPresence();
    return next;
  });
}

export function MpModeScreen({ host, onAsk, onExit }: MpModeScreenProps) {
  const sessionRef = useRef<MpModeSession | null>(null);
  if (!sessionRef.current) sessionRef.current = new MpModeSession(host ?? tauriMpBridgeHost());
  const screenRef = useRef<HTMLElement | null>(null);
  const footerRef = useRef<HTMLElement | null>(null);
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
  const [adminOpen, setAdminOpen] = useState(false);
  /* Election detail drill-in (#359 election slice): opened only with a loaded
   * detail behind it, closed by the Back row or by auth expiry. */
  const [electionOpen, setElectionOpen] = useState(false);
  /* Corporation detail drill-in (#359 corporation slice): same contract as
   * the election panel, one company at a time. */
  const [corporationOpen, setCorporationOpen] = useState(false);
  /* Union detail drill-in (#359 union slice): same contract as the
   * election and corporation panels, one union at a time. */
  const [unionOpen, setUnionOpen] = useState(false);
  /* Cabinet briefing drill-in (#359 cabinet slice): same contract as the
   * election, corporation, and union panels, one office at a time. */
  const [cabinetOpen, setCabinetOpen] = useState(false);
  /* Governor roster drill-in (#359 governor slice): same contract as the
   * election, corporation, union, and cabinet panels, one office at a time. */
  const [governorOpen, setGovernorOpen] = useState(false);

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
      // Presence rides the same mount freshness without joining the
      // enter/refresh contract: a failed presence load stays absent.
      if (next.phase === "ready" && next.userId) return session.loadPresence();
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

  /* Desktop post-callback restore (#149): the provider round trip finishes
   * in the separate persistent online window, so coming back to the main
   * window re-probes while the screen waits for a session. A completed
   * callback lands without another click; cancellation, failure, and expiry
   * keep the signed-out card with retry. Gated to needs-session phases so a
   * focused ready or blocked screen never replays the load chain. Mirrors
   * the AskPanel focus re-probe; one in-flight probe at a time. */
  const focusProbeRef = useRef(false);
  useEffect(() => {
    const probeReturn = () => {
      const session = sessionRef.current!;
      const phase = session.get().phase;
      if (phase !== "signed-out" && phase !== "session-required" && phase !== "auth-expired") return;
      if (focusProbeRef.current) return;
      focusProbeRef.current = true;
      setBusy(true);
      void withPresenceRefresh(session, session.refresh()).then((next) => {
        setSnapshot(next);
      }).finally(() => {
        focusProbeRef.current = false;
        setBusy(false);
      });
    };
    // Single-view phones suspend the webview for the provider step, so the
    // foreground return surfaces as visibilitychange (visible), not window
    // focus. Both events share one in-flight probe.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      probeReturn();
    };
    window.addEventListener("focus", probeReturn);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", probeReturn);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /* Presence re-poll (#359 presence slice): the mount chain loads presence
   * once, but a long-open screen would otherwise go stale. Like the
   * reference StatusBar this re-polls on a visible-only interval plus on
   * foreground return, including in the ready phase (the focus re-probe
   * above only fires while waiting for a session). loadPresence keeps the
   * last good value on any failure, so these polls can never disturb the
   * session or its views. */
  useEffect(() => {
    const session = sessionRef.current!;
    let live = true;
    const pollPresence = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void session.loadPresence().then((next) => {
        if (live) setSnapshot(next);
      });
    };
    const onVisiblePresence = () => {
      if (document.visibilityState === "visible") pollPresence();
    };
    const intervalId = setInterval(pollPresence, PRESENCE_POLL_MS);
    document.addEventListener("visibilitychange", onVisiblePresence);
    return () => {
      live = false;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisiblePresence);
    };
  }, []);

  function runGeneral(operation: (session: MpModeSession) => Promise<MpSnapshot>) {
    setNoticeScope("general");
    void run(operation);
  }

  /* Standing active-election drill-in target: the live-site
   * /elections/[seatId ?? id] reference, gated on a valid election id. An
   * invalid or absent reference keeps the row display-only: no control, no
   * request. The adapter and the Rust bridge re-validate before sending. */
  const electionTarget = (() => {
    const target = snapshot.capabilities?.activeElectionSeatId
      ?? snapshot.capabilities?.activeElectionId
      ?? null;
    return target !== null && isElectionId(target) ? target : null;
  })();

  /* Standing corporation drill-in target: the live-site /corporation/[id]
   * reference, gated on a valid corporation id. An invalid or absent
   * reference keeps the row display-only: no control, no request. The
   * adapter and the Rust bridge re-validate before sending. */
  const corporationTarget = (() => {
    const raw = snapshot.capabilities?.corporationId ?? null;
    if (raw === null) return null;
    const target = String(raw);
    return isCorporationId(target) ? target : null;
  })();

  /* Standing union drill-in target: the live-site /unions/[id] reference,
   * gated on a valid union id. An invalid or absent reference keeps the
   * row display-only: no control, no request. The adapter and the Rust
   * bridge re-validate before sending. */
  const unionTarget = (() => {
    const target = snapshot.capabilities?.unionId ?? null;
    return target !== null && isUnionId(target) ? target : null;
  })();

  /* Standing cabinet drill-in target: the live-site
   * /country/[code]/executive/cabinet/[positionId]/office reference,
   * gated on a valid country-plus-seat pair. A half-valid pair (or an
   * absent one) keeps the row display-only: no control, no request. The
   * adapter and the Rust bridge re-validate before sending. */
  const cabinetTarget = (() => {
    const countryCode = snapshot.capabilities?.cabinetCountryCode ?? null;
    const positionId = snapshot.capabilities?.cabinetPositionId ?? null;
    return countryCode !== null
      && positionId !== null
      && isCabinetCountryCode(countryCode)
      && isCabinetPositionId(positionId)
      ? { countryCode, positionId }
      : null;
  })();

  /* Standing governor drill-in target: the live-site
   * /country/[code]/region/[stateId]/office reference, gated on a valid
   * country-plus-region pair. A half-valid pair (or an absent one) keeps
   * the row display-only: no control, no request. The adapter and the
   * Rust bridge re-validate before sending. */
  const governorTarget = (() => {
    const countryCode = snapshot.capabilities?.governorCountryCode ?? null;
    const stateId = snapshot.capabilities?.governorStateId ?? null;
    return countryCode !== null
      && stateId !== null
      && isGovernorCountryCode(countryCode)
      && isGovernorStateId(stateId)
      ? { countryCode, stateId }
      : null;
  })();

  /* The five Standing drill-ins share one detail slot below the profile
   * section (the SP single-detail model): opening one closes the other four,
   * so two detail articles and two "Back to Standing" buttons never stack.
   * Back closes the visible panel and returns to Standing. */
  function closeDetailPanels() {
    setElectionOpen(false);
    setCorporationOpen(false);
    setUnionOpen(false);
    setCabinetOpen(false);
    setGovernorOpen(false);
  }

  /* The detail panel opens only once the authoritative summary is loaded;
   * failures stay on the shared error display with Standing intact. */
  function openElection(target: string) {
    setNoticeScope("general");
    void run((s) => s.loadElectionDetail(target)).then((next) => {
      if (next?.electionDetail) {
        closeDetailPanels();
        setElectionOpen(true);
        window.setTimeout(() => jumpTo("mp-election"), 0);
      }
    });
  }

  /* The company panel opens only once the authoritative summary is loaded;
   * failures stay on the shared error display with Standing intact. */
  function openCorporation(target: string) {
    setNoticeScope("general");
    void run((s) => s.loadCorporationDetail(target)).then((next) => {
      if (next?.corporationDetail) {
        closeDetailPanels();
        setCorporationOpen(true);
        window.setTimeout(() => jumpTo("mp-corporation"), 0);
      }
    });
  }

  /* The union panel opens only once the authoritative summary is loaded;
   * failures stay on the shared error display with Standing intact. */
  function openUnion(target: string) {
    setNoticeScope("general");
    void run((s) => s.loadUnionDetail(target)).then((next) => {
      if (next?.unionDetail) {
        closeDetailPanels();
        setUnionOpen(true);
        window.setTimeout(() => jumpTo("mp-union"), 0);
      }
    });
  }

  /* The cabinet panel opens only once the authoritative briefing is
   * loaded; failures stay on the shared error display with Standing
   * intact. A 404 keeps the last loaded briefing, so the panel opens
   * only when fresh detail is behind it. */
  function openCabinet(target: { countryCode: string; positionId: string }) {
    setNoticeScope("general");
    void run((s) => s.loadCabinetDetail(target.countryCode, target.positionId)).then((next) => {
      if (next?.cabinetDetail) {
        closeDetailPanels();
        setCabinetOpen(true);
        window.setTimeout(() => jumpTo("mp-cabinet"), 0);
      }
    });
  }

  /* The governor panel opens only once the authoritative roster is
   * loaded; failures stay on the shared error display with Standing
   * intact. A 404 keeps the last loaded roster, so the panel opens
   * only when fresh detail is behind it. */
  function openGovernor(target: { countryCode: string; stateId: string }) {
    setNoticeScope("general");
    void run((s) => s.loadGovernorDetail(target.countryCode, target.stateId)).then((next) => {
      if (next?.governorDetail) {
        closeDetailPanels();
        setGovernorOpen(true);
        window.setTimeout(() => jumpTo("mp-governor"), 0);
      }
    });
  }

  function runMail(operation: (session: MpModeSession) => Promise<MpSnapshot>): Promise<MpSnapshot | null> {
    setNoticeScope("mail");
    return run(operation);
  }

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
  /* Sessionless offline (#362 single-view join): the provider step can fail
   * to start, or entry transport can fail, before any identity exists. That
   * is a sign-in state, not a mid-session loss: route it to the sign-in
   * card so the provider choices, Retry, and Back stay reachable with the
   * error. Offline WITH an identity keeps the blocked kept-state card. */
  const showSignIn = needsSession || (phase === "offline" && !snapshot.userId);

  /* Auth expiry evicts the details with every other authed projection, so
   * an open panel closes itself instead of showing a stale race, company,
   * union, cabinet office, or governorship. Above the admin early-return:
   * every render runs the same hooks. */
  useEffect(() => {
    if (needsSession && electionOpen) setElectionOpen(false);
  }, [needsSession, electionOpen]);
  useEffect(() => {
    if (needsSession && corporationOpen) setCorporationOpen(false);
  }, [needsSession, corporationOpen]);
  useEffect(() => {
    if (needsSession && unionOpen) setUnionOpen(false);
  }, [needsSession, unionOpen]);
  useEffect(() => {
    if (needsSession && cabinetOpen) setCabinetOpen(false);
  }, [needsSession, cabinetOpen]);
  useEffect(() => {
    if (needsSession && governorOpen) setGovernorOpen(false);
  }, [needsSession, governorOpen]);

  /* Account-boundary residue (#149, #363): the reference logs out to `/`,
   * dropping every in-memory draft with the navigation. This screen stays
   * mounted across unlink and switch, so per-account form state (mail
   * reader selection, compose draft, action inputs, admin panel) must reset
   * when the linked account ends or changes. Otherwise the next account on
   * a shared phone reopens the previous player's mail and draft. Detail
   * panels already close on needsSession above; this covers the form state
   * they miss. Fires only when a previously linked account ends: a fresh
   * link (null to account) and steady state clear nothing. */
  const accountKey = snapshot.userId;
  const prevAccountRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevAccountRef.current;
    prevAccountRef.current = accountKey;
    if (prev === undefined || prev === null || prev === accountKey) return;
    setOpenMailId(null);
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setRegion("");
    setAmount("");
    setSnooze("");
    setAdminOpen(false);
  }, [accountKey]);

  useEffect(() => {
    // MP content clearance (#436): the fixed footer grows with the home
    // indicator and large text, so publish its measured height for
    // .ahd-mp-layout to clear via the shared footerClearance helper (also
    // publishes to documentElement for the document scroll-padding rule).
    // The measurement includes the footer's own safe-area padding, so the
    // layout adds only breathing room on top of it. Re-runs on adminOpen
    // because Admin status swaps the whole main element out and Back mounts
    // a fresh one a mount-only effect would never measure.
    return installFooterClearance(footerRef.current, screenRef.current);
  }, [adminOpen]);

  if (adminOpen) {
    return <MpAdminScreen host={host} onBack={() => setAdminOpen(false)} />;
  }
  const blocked = phase === "offline" || phase === "server-error" || phase === "rate-limited";
  /* Authoritative timing projection (#359 presence slice): the countdown is
   * computed from the server's nextScheduledTurn at render, exactly like the
   * reference StatusBar. Null means no claim, never a synthesized time. */
  const turnCountdown = snapshot.turn
    ? formatTurnCountdown(snapshot.turn.nextScheduledTurn, snapshot.turn.paused)
    : null;
  const turnPlayerPaced = !!snapshot.turn
    && !turnCountdown
    && !snapshot.turn.isProcessing
    && !snapshot.turn.paused
    && snapshot.turn.isActive !== false;

  const visibleElection = !needsSession && electionOpen ? snapshot.electionDetail : null;
  const visibleCorporation = !needsSession && corporationOpen ? snapshot.corporationDetail : null;
  const visibleUnion = !needsSession && unionOpen ? snapshot.unionDetail : null;
  const visibleCabinet = !needsSession && cabinetOpen ? snapshot.cabinetDetail : null;
  const visibleGovernor = !needsSession && governorOpen ? snapshot.governorDetail : null;
  const electionPhaseLabel = visibleElection
    ? visibleElection.isEnded
      ? "Ended"
      : visibleElection.inPrimary
        ? "Primary"
        : visibleElection.inGeneral
          ? "General"
          : visibleElection.isUpcoming
            ? "Upcoming"
            : visibleElection.status
    : null;

  return (
    <main ref={screenRef} className="ahd-screen ahd-mp">
      <div className="ahd-container ahd-mp-layout">
        <header className="ahd-mp-row" aria-label="Multiplayer header">
          <div style={{ minWidth: 0 }}>
            <p className="ahd-eyebrow">Multiplayer · Native</p>
            <h1 className="ahd-h1" id="mp-top" tabIndex={-1}>Multiplayer</h1>
            {snapshot.username && <p className="ahd-muted" style={{ margin: 0 }}>Playing as {snapshot.username}</p>}
          </div>
          <div className="ahd-mp-row" style={{ marginLeft: "auto" }}>
            <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => void runGeneral((s) => withPresenceRefresh(s, s.refresh()))}>
              Refresh
            </button>
            <button className="ahd-btn ahd-btn-sm" disabled={busy} onClick={() => setAdminOpen(true)}>
              Admin status
            </button>
            <button
              className="ahd-btn ahd-btn-sm"
              disabled={busy}
              title="Unlink this account on this device. The next sign-in can link a different account."
              onClick={() => void runGeneral((s) => s.signOut())}
            >
              Sign out
            </button>
            <button className="ahd-btn ahd-btn-sm" onClick={onExit}>Exit multiplayer</button>
          </div>
        </header>

        {snapshot.character && (
          <nav className="ahd-mp-row ahd-mp-sections" aria-label="Multiplayer sections">
            <span className="ahd-label">Sections</span>
            <button className="ahd-btn ahd-btn-sm" onClick={() => jumpTo("mp-profile")}>
              Status
            </button>
            <button className="ahd-btn ahd-btn-sm" onClick={() => jumpTo("mp-actions")}>
              Actions
            </button>
            <button className="ahd-btn ahd-btn-sm" onClick={() => jumpTo("mp-wallet")}>
              Wallet
            </button>
            {snapshot.inbox && (
              <button className="ahd-btn ahd-btn-sm" onClick={() => jumpTo("mp-inbox")}>
                Inbox{snapshot.inbox.unreadCount > 0 ? ` (${snapshot.inbox.unreadCount} unread)` : ""}
              </button>
            )}
            <button className="ahd-btn ahd-btn-sm" onClick={() => jumpTo("mp-mail")}>
              Mail
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

        {showSignIn && (
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
              <button className="ahd-btn" disabled={busy} onClick={() => void runGeneral((s) => withPresenceRefresh(s, s.refresh()))}>
                Retry
              </button>
              <button className="ahd-btn ahd-btn-ghost" onClick={onExit}>
                Back
              </button>
            </div>
          </section>
        )}

        {blocked && !showSignIn && (
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
              <button className="ahd-btn ahd-btn-primary" disabled={busy} onClick={() => void runGeneral((s) => withPresenceRefresh(s, s.refresh()))}>
                Reconnect
              </button>
            </div>
          </section>
        )}

        {snapshot.character && (
          <>
          <section id="mp-profile" className="ahd-mp-grid" aria-label="Multiplayer status" tabIndex={-1}>
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
            {/* Standing capability audit (#359/#510, docs/NAVIGATION-PARITY.md
              * section 12): the reference links each row at a live-site
              * destination (My Corporation -> /corporation/[id], My Union ->
              * /unions/[id], My election -> /elections/[seatId ?? id],
              * cabinet -> /country/[cc]/executive/cabinet/[position]/office,
              * governor -> /country/[cc]/region/[state]/office). The
              * election, corporation, union, cabinet, and governor rows are
              * real drill-ins: the election-detail read
              * (GET /api/elections?id=&view=summary), the
              * corporation-detail read (GET /api/corporations/[id]), the
              * union-detail read (GET /api/unions/[id]), the
              * cabinet-detail read (GET
              * /api/country/[code]/executive/cabinet/[positionId]/briefing),
              * and the governor-detail read (GET
              * /api/country/[code]/region/[id]/officials) are allowlisted
              * and have Native MP surfaces below. A row without an
              * allowlisted read and a Native surface stays display-only:
              * no dead controls, no links into local SP state. */}
            {snapshot.capabilities && (
              <article className="ahd-card ahd-card-pad" aria-label="Standing">
                <h2 className="ahd-h2">Standing</h2>
                {(snapshot.capabilities.corporationId !== null ||
                  snapshot.capabilities.unionId ||
                  snapshot.capabilities.activeElectionLabel ||
                  snapshot.capabilities.cabinetOffice ||
                  snapshot.capabilities.governorOffice) ? (
                  <dl className="ahd-mp-facts">
                    {snapshot.capabilities.corporationId !== null && (
                      <><dt>Corporation</dt><dd>
                        #{snapshot.capabilities.corporationId}
                        {corporationTarget && (
                          <>
                            {" "}
                            <button
                              className="ahd-btn ahd-btn-sm"
                              disabled={busy}
                              onClick={() => openCorporation(corporationTarget)}
                            >
                              View company
                            </button>
                          </>
                        )}
                      </dd></>
                    )}
                    {snapshot.capabilities.unionId && (
                      <><dt>Union</dt><dd>
                        {snapshot.capabilities.unionId}
                        {unionTarget && (
                          <>
                            {" "}
                            <button
                              className="ahd-btn ahd-btn-sm"
                              disabled={busy}
                              onClick={() => openUnion(unionTarget)}
                            >
                              View union
                            </button>
                          </>
                        )}
                      </dd></>
                    )}
                    {snapshot.capabilities.activeElectionLabel && (
                      <><dt>Election</dt><dd>
                        {snapshot.capabilities.activeElectionLabel}
                        {electionTarget && (
                          <>
                            {" "}
                            <button
                              className="ahd-btn ahd-btn-sm"
                              disabled={busy}
                              onClick={() => openElection(electionTarget)}
                            >
                              View race
                            </button>
                          </>
                        )}
                      </dd></>
                    )}
                    {snapshot.capabilities.cabinetOffice && (
                      <><dt>Cabinet</dt><dd>
                        {snapshot.capabilities.cabinetOffice}
                        {cabinetTarget && (
                          <>
                            {" "}
                            <button
                              className="ahd-btn ahd-btn-sm"
                              disabled={busy}
                              onClick={() => openCabinet(cabinetTarget)}
                            >
                              View office
                            </button>
                          </>
                        )}
                      </dd></>
                    )}
                    {snapshot.capabilities.governorOffice && (
                      <><dt>Governor</dt><dd>
                        {snapshot.capabilities.governorOffice}
                        {governorTarget && (
                          <>
                            {" "}
                            <button
                              className="ahd-btn ahd-btn-sm"
                              disabled={busy}
                              onClick={() => openGovernor(governorTarget)}
                            >
                              View governorship
                            </button>
                          </>
                        )}
                      </dd></>
                    )}
                  </dl>
                ) : (
                  <p className="ahd-muted" style={{ margin: 0 }}>No offices, candidacies, or company standing.</p>
                )}
              </article>
            )}
            {snapshot.turn && (
              <article className="ahd-card ahd-card-pad" aria-label="World turn">
                <h2 className="ahd-h2">Turn {snapshot.turn.currentTurn} · {snapshot.turn.currentYear}</h2>
                <dl className="ahd-mp-facts">
                  <dt>Status</dt>
                  <dd>
                    {snapshot.turn.isProcessing
                      ? `Processing${snapshot.turn.processingLabel ? `: ${snapshot.turn.processingLabel}` : ""}${snapshot.turn.processingProgress !== null ? ` (${Math.round(snapshot.turn.processingProgress)}%)` : ""}`
                      : snapshot.turn.paused
                        ? `Paused${snapshot.turn.pauseReason ? `: ${snapshot.turn.pauseReason}` : ""}`
                        : snapshot.turn.isActive === false
                          ? "Paused"
                          : "Live"}
                  </dd>
                  {turnCountdown ? (
                    <><dt>Schedule</dt><dd>{turnCountdown}</dd></>
                  ) : turnPlayerPaced ? (
                    <><dt>Schedule</dt><dd>Player paced</dd></>
                  ) : null}
                  {snapshot.turn.isProcessing && snapshot.turn.processingTargetTurn !== null && (
                    <><dt>Target</dt><dd>Turn {snapshot.turn.processingTargetTurn}</dd></>
                  )}
                  {snapshot.presence && (
                    <><dt>Online</dt><dd>{snapshot.presence.online} player{snapshot.presence.online !== 1 ? "s" : ""} online</dd></>
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

        {/* Election detail drill-in (#359 election slice): authoritative
          * summary for the Standing active election, opened only with data
          * loaded. Read-only: candidacy, campaigns, and every write stay
          * absent. Back returns to Standing, never into local SP state. */}
        {visibleElection && electionPhaseLabel && (
          <>
          <article id="mp-election" className="ahd-card ahd-card-pad" aria-label="Election detail" tabIndex={-1}>
            <h2 className="ahd-h2">{snapshot.capabilities?.activeElectionLabel ?? `${visibleElection.electionType} · ${visibleElection.state ?? visibleElection.countryId}`}</h2>
            <dl className="ahd-mp-facts">
              <dt>Phase</dt><dd>{electionPhaseLabel}</dd>
              <dt>Status</dt><dd>{visibleElection.status}</dd>
              <dt>Field</dt><dd>{visibleElection.candidateCount === 1 ? "1 candidate" : `${visibleElection.candidateCount} candidates`}</dd>
              <dt>Leader</dt><dd>{visibleElection.leaderName ?? "No polling yet"}{visibleElection.leaderParty ? ` · ${visibleElection.leaderParty}` : ""}</dd>
              <dt>Incumbent</dt><dd>{visibleElection.incumbentName ?? "None listed"}{visibleElection.incumbentParty ? ` · ${visibleElection.incumbentParty}` : ""}</dd>
              {visibleElection.state && (<><dt>State</dt><dd>{visibleElection.state}</dd></>)}
              <dt>Cycle</dt><dd>{visibleElection.cycle}</dd>
            </dl>
          </article>
          <div className="ahd-mp-row ahd-mp-back">
            <button
              className="ahd-btn ahd-btn-sm ahd-btn-ghost"
              onClick={() => {
                setElectionOpen(false);
                jumpTo("mp-profile");
              }}
            >
              Back to Standing
            </button>
          </div>
          </>
        )}

        {/* Corporation detail drill-in (#359 corporation slice):
          * authoritative summary for the Standing corporation, opened only
          * with data loaded. Read-only: financials, the balance sheet, and
          * every write stay absent. Back returns to Standing, never into
          * local SP state. */}
        {visibleCorporation && (
          <>
          <article id="mp-corporation" className="ahd-card ahd-card-pad" aria-label="Corporation detail" tabIndex={-1}>
            <h2 className="ahd-h2">{visibleCorporation.name}</h2>
            <dl className="ahd-mp-facts">
              {visibleCorporation.tickerSymbol && (<><dt>Ticker</dt><dd>{visibleCorporation.tickerSymbol}</dd></>)}
              {visibleCorporation.typeLabel && (<><dt>Type</dt><dd>{visibleCorporation.typeLabel}</dd></>)}
              {visibleCorporation.headquarters && (<><dt>Headquarters</dt><dd>{visibleCorporation.headquarters}</dd></>)}
              <dt>Country</dt><dd>{visibleCorporation.countryId}</dd>
              <dt>Ownership</dt><dd>{visibleCorporation.isPrivate === true ? "Private" : visibleCorporation.isPrivate === false ? "Public" : "Unknown"}</dd>
              <dt>CEO</dt><dd>{visibleCorporation.ceoName ?? "Vacant or undisclosed"}</dd>
              <dt>Scale</dt><dd>{visibleCorporation.sectorCount === 1 ? "1 sector" : `${visibleCorporation.sectorCount} sectors`}</dd>
              {visibleCorporation.sequentialId !== null && (<><dt>Company no.</dt><dd>#{visibleCorporation.sequentialId}</dd></>)}
            </dl>
          </article>
          <div className="ahd-mp-row ahd-mp-back">
            <button
              className="ahd-btn ahd-btn-sm ahd-btn-ghost"
              onClick={() => {
                setCorporationOpen(false);
                jumpTo("mp-profile");
              }}
            >
              Back to Standing
            </button>
          </div>
          </>
        )}

        {/* Union detail drill-in (#359 union slice): authoritative summary
          * for the Standing union, opened only with data loaded. Read-only:
          * bargaining, dues/services, pension, endorsements, and every write
          * stay absent. Back returns to Standing, never into local SP
          * state. */}
        {visibleUnion && (
          <>
          <article id="mp-union" className="ahd-card ahd-card-pad" aria-label="Union detail" tabIndex={-1}>
            <h2 className="ahd-h2">{visibleUnion.name}</h2>
            <dl className="ahd-mp-facts">
              {(visibleUnion.sectorLabel ?? visibleUnion.sectorType) && (<><dt>Sector</dt><dd>{visibleUnion.sectorLabel ?? visibleUnion.sectorType}</dd></>)}
              <dt>Country</dt><dd>{visibleUnion.countryName ?? visibleUnion.countryId}</dd>
              <dt>Leadership</dt><dd>{visibleUnion.electionOpen === true ? "Election open" : visibleUnion.electionOpen === false ? "Settled" : "Unknown"}</dd>
              <dt>Members</dt><dd>{visibleUnion.members ?? "Not yet priced"}</dd>
              <dt>Approval</dt><dd>{visibleUnion.approval ?? "Not yet priced"}</dd>
              <dt>Treasury</dt><dd>{visibleUnion.treasury ?? "Not yet priced"}</dd>
              <dt>Scale</dt><dd>{visibleUnion.sectorCount === 1 ? "1 sector" : `${visibleUnion.sectorCount} sectors`}</dd>
              {visibleUnion.suspended === true && (<><dt>Status</dt><dd>Suspended in this country</dd></>)}
            </dl>
          </article>
          <div className="ahd-mp-row ahd-mp-back">
            <button
              className="ahd-btn ahd-btn-sm ahd-btn-ghost"
              onClick={() => {
                setUnionOpen(false);
                jumpTo("mp-profile");
              }}
            >
              Back to Standing
            </button>
          </div>
          </>
        )}

        {/* Cabinet briefing drill-in (#359 cabinet slice): the letterhead
          * plus roster facts for the Standing office, opened only with a
          * loaded briefing. Read-only: mechanics, settings, orders,
          * metrics, budgets, military, monetary, and every write stay
          * absent. A withheld office shows the restriction titles instead
          * of departmental record; a vacant seat names no holder. Back
          * returns to Standing, never into local SP state. */}
        {visibleCabinet && (
          <>
          <article id="mp-cabinet" className="ahd-card ahd-card-pad" aria-label="Cabinet detail" tabIndex={-1}>
            <h2 className="ahd-h2">{visibleCabinet.positionName ?? visibleCabinet.positionId}</h2>
            <dl className="ahd-mp-facts">
              {visibleCabinet.department && (<><dt>Department</dt><dd>{visibleCabinet.department}</dd></>)}
              {visibleCabinet.liveYear !== null && (<><dt>Year</dt><dd>{visibleCabinet.liveYear}</dd></>)}
              <dt>Seat</dt><dd>{visibleCabinet.positionId}</dd>
              <dt>Holder</dt><dd>{visibleCabinet.member?.characterName ?? "Vacant"}</dd>
              {visibleCabinet.member?.partyName && (<><dt>Party</dt><dd>{visibleCabinet.member.partyName}</dd></>)}
              {visibleCabinet.member && (
                <><dt>Tenure</dt><dd>{visibleCabinet.member.acting === true
                  ? `Acting${visibleCabinet.member.actingExpiresOnTurn !== null ? ` until turn ${visibleCabinet.member.actingExpiresOnTurn}` : ""}`
                  : visibleCabinet.member.acting === false
                    ? "Substantive"
                    : "Undisclosed"}</dd></>
              )}
              {!visibleCabinet.canView && visibleCabinet.restriction && (
                <><dt>Viewers</dt><dd>{visibleCabinet.restriction.allowedTitles.join(", ")}{visibleCabinet.restriction.countryName ? ` · ${visibleCabinet.restriction.countryName}` : ""}</dd></>
              )}
              {visibleCabinet.canView && !visibleCabinet.canAct && (
                <><dt>Role</dt><dd>Read-only: you may view this office but not work it</dd></>
              )}
            </dl>
          </article>
          <div className="ahd-mp-row ahd-mp-back">
            <button
              className="ahd-btn ahd-btn-sm ahd-btn-ghost"
              onClick={() => {
                setCabinetOpen(false);
                jumpTo("mp-profile");
              }}
            >
              Back to Standing
            </button>
          </div>
          </>
        )}

        {/* Governor roster drill-in (#359 governor slice): state identity
          * plus the office holder for the Standing governorship, opened
          * only with a loaded roster. Read-only: sibling benches, the
          * stored holder party key, and every write stay absent. A vacant
          * seat, or a holder redacted to a null character, names no
          * holder. Back returns to Standing, never into local SP state. */}
        {visibleGovernor && (
          <>
          <article id="mp-governor" className="ahd-card ahd-card-pad" aria-label="Governor detail" tabIndex={-1}>
            <h2 className="ahd-h2">{visibleGovernor.stateName}</h2>
            <dl className="ahd-mp-facts">
              {visibleGovernor.officeType && (<><dt>Office</dt><dd>{visibleGovernor.officeType}</dd></>)}
              <dt>Holder</dt><dd>{visibleGovernor.holderName ?? "Vacant or undisclosed"}</dd>
              <dt>State</dt><dd>{visibleGovernor.state}</dd>
              <dt>Country</dt><dd>{visibleGovernor.countryId}</dd>
            </dl>
          </article>
          <div className="ahd-mp-row ahd-mp-back">
            <button
              className="ahd-btn ahd-btn-sm ahd-btn-ghost"
              onClick={() => {
                setGovernorOpen(false);
                jumpTo("mp-profile");
              }}
            >
              Back to Standing
            </button>
          </div>
          </>
        )}

        {snapshot.character && (
          <>
          <section id="mp-actions" className="ahd-card ahd-card-pad" aria-label="Player actions" tabIndex={-1}>
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

        {/* Wallet reachability slice (#507, #84): the only audited
          * multiplayer money figure is character-me `cashOnHand`, already
          * loaded with the session, so this section projects it with no new
          * endpoint. Savings, holdings, trends, and deposit/withdraw have no
          * allowlisted bridge read (finance surfaces are deliberately absent
          * in src/mp/endpoints.ts) and stay named-absent, never SP values.
          * Back returns to the section list, never into local SP state. */}
        {snapshot.character && (
          <>
          <section id="mp-wallet" className="ahd-card ahd-card-pad" aria-label="Wallet" tabIndex={-1}>
            <h2 className="ahd-h2">Wallet</h2>
            <p className="ahd-muted" style={{ marginTop: 0 }}>
              Live cash balance from your character record. Savings, stock
              holdings, portfolio trends, and deposit/withdraw have no
              multiplayer read in this build, so only cash on hand is shown.
            </p>
            <dl className="ahd-mp-facts">
              <dt>Cash on hand</dt>
              <dd>{snapshot.character.cashOnHand !== null ? snapshot.character.cashOnHand : "Not reported by the server"}</dd>
            </dl>
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
      <footer ref={footerRef} className="ahd-footer ahd-mp-footer" aria-label="Multiplayer navigation">
        <div className="ahd-container ahd-footer-inner">
          <nav className="ahd-bottomnav ahd-mp-bottomnav" aria-label="Primary">
            <a
              className="ahd-bottomnav-item"
              aria-label="Profile"
              href="#mp-profile"
              onClick={(event) => {
                // Plain anchors scroll without moving DOM focus, stranding
                // keyboard and screen-reader users in the footer. Route
                // through the same focus-moving jump-nav as the in-screen
                // section buttons; href stays as the fallback identity.
                event.preventDefault();
                jumpTo("mp-profile");
              }}
            >
              <NavIcon path={BOTTOM_TABS[0].path} label="" /><span>Profile</span>
            </a>
            <a
              className="ahd-bottomnav-item"
              aria-label="Actions"
              href="#mp-actions"
              onClick={(event) => {
                event.preventDefault();
                jumpTo("mp-actions");
              }}
            >
              <NavIcon path={BOTTOM_TABS[1].path} label="" /><span>Actions</span>
            </a>
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
