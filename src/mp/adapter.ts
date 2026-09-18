import { mpFetch, mpMutate, type MpBridgeHost, type MpCallResult } from "./bridge";
import {
  parseCabinetDetail,
  parseCharacterMe,
  parseClientNav,
  parseCorporationDetail,
  parseElectionDetail,
  parseExecuteResult,
  parseInbox,
  parseLogoutAck,
  parseMailInbox,
  parseMailSent,
  parseMutationAck,
  parsePlayersOnline,
  parseSessionProbe,
  parseTurnStatus,
  parseUnionDetail,
  validateCabinetRef,
  validateCorporationId,
  validateElectionId,
  validateExecuteArgs,
  validateMailId,
  validateMailSend,
  validateNotificationId,
  validateNotificationPreference,
  validateSnoozeMinutes,
  validateUnionId,
  type MpCabinetDetailView,
  type MpCapabilitiesView,
  type MpCharacterView,
  type MpCorporationDetailView,
  type MpElectionDetailView,
  type MpInboxView,
  type MpMailInbox,
  type MpMailSent,
  type MpPresenceView,
  type MpTurnView,
  type MpUnionDetailView,
} from "./validators";
import type { MpMutateOpId } from "./endpoints";

/**
 * Native multiplayer mode session (#359). The server owns all state: this
 * adapter projects authenticated reads into view models, sends explicitly
 * modeled mutations, and refreshes authoritative reads before the UI claims
 * a mutation completed. No MP data ever enters the local SP engine, and no
 * remote state is persisted anywhere (memory only, cleared on exit or
 * account switch).
 */

export type MpPhase =
  | "idle"
  | "loading"
  | "session-required"
  | "signed-out"
  | "ready"
  | "auth-expired"
  | "offline"
  | "rate-limited"
  | "server-error";

export interface MpSnapshot {
  phase: MpPhase;
  userId: string | null;
  username: string | null;
  character: MpCharacterView | null;
  turn: MpTurnView | null;
  /** Server-derived navigation capabilities (client-nav projection). */
  capabilities: MpCapabilitiesView | null;
  /** Active-election detail; loaded on demand, never on enter or refresh. */
  electionDetail: MpElectionDetailView | null;
  /** Standing corporation detail; loaded on demand, never on enter or refresh. */
  corporationDetail: MpCorporationDetailView | null;
  /** Standing union detail; loaded on demand, never on enter or refresh. */
  unionDetail: MpUnionDetailView | null;
  /** Standing cabinet-office briefing; loaded on demand, never on enter or refresh. */
  cabinetDetail: MpCabinetDetailView | null;
  inbox: MpInboxView | null;
  /** Received player mail page; loaded on demand, never on enter. */
  mailInbox: MpMailInbox | null;
  /** Sent player mail page; loaded on demand, never on enter. */
  mailSent: MpMailSent | null;
  /**
   * Players-online presence (#359 presence slice). Loaded independently via
   * loadPresence, never as part of enter/refresh: like the reference
   * StatusBar, a failed presence fetch keeps the last good value (or stays
   * absent) without touching phase or error state.
   */
  presence: MpPresenceView | null;
  /** Last server-confirmed notice (action result); cleared on next load. */
  notice: string | null;
  /** Last human-readable failure; cleared when a call succeeds. */
  error: string | null;
  /** Retry-After seconds from the last 429, if any. */
  retryAfter: number | null;
}

const INITIAL_SNAPSHOT: MpSnapshot = {
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
  inbox: null,
  mailInbox: null,
  mailSent: null,
  presence: null,
  notice: null,
  error: null,
  retryAfter: null,
};

export const MP_INBOX_LIMIT = 25;

/**
 * Audited mail page size (#359 chat slice): the mail routes accept limit
 * 1..50, and Native always reads the widest page so the inbox/sent views
 * match the reference without paging controls.
 */
export const MP_MAIL_LIMIT = 50;

function emptyAuthed(): Pick<
  MpSnapshot,
  "character" | "turn" | "capabilities" | "electionDetail" | "corporationDetail" | "unionDetail" | "cabinetDetail" | "inbox" | "mailInbox" | "mailSent" | "presence"
> {
  return { character: null, turn: null, capabilities: null, electionDetail: null, corporationDetail: null, unionDetail: null, cabinetDetail: null, inbox: null, mailInbox: null, mailSent: null, presence: null };
}

export class MpModeSession {
  private snapshot: MpSnapshot = { ...INITIAL_SNAPSHOT };

  constructor(private readonly host: MpBridgeHost) {}

  get(): MpSnapshot {
    return { ...this.snapshot };
  }

  private set(patch: Partial<MpSnapshot>): MpSnapshot {
    this.snapshot = { ...this.snapshot, ...patch };
    return this.get();
  }

  /** Drop all remote state: mode exit and account switches land here. */
  exit(): MpSnapshot {
    this.snapshot = { ...INITIAL_SNAPSHOT };
    return this.get();
  }

  /** Full authenticated load: probe, then player/turn/capabilities/inbox in order. */
  async enter(): Promise<MpSnapshot> {
    this.set({ ...emptyAuthed(), phase: "loading", notice: null, error: null, retryAfter: null });
    return this.refreshAuthed();
  }

  /**
   * Re-read authoritative state; used for manual refresh, reconnect, and the
   * post-mutation refresh. The probe runs first every time so an account
   * switch or expiry is caught here too, never just on entry.
   */
  async refresh(): Promise<MpSnapshot> {
    this.set({ phase: "loading", notice: null, error: null, retryAfter: null });
    return this.refreshAuthed();
  }

  /** Begin a provider OAuth round trip, then reload authoritative state. */
  async signIn(provider: "discord" | "google"): Promise<MpSnapshot> {
    try {
      await this.host.beginSignIn(provider);
    } catch {
      return this.set({ phase: "offline", error: "Sign-in could not be started. Check your connection and try again." });
    }
    return this.enter();
  }

  /**
   * Unlink the current account (#149 mobile unlink). The server owns the
   * session, so local state clears only once POST /api/auth/logout confirms
   * (or proves the session already dead: 401, or no bridge session at all).
   * A failed unlink keeps the signed-in session with retry: clearing
   * locally while the server session lives would strand the player signed
   * out here yet still linked on the device. Clearing drops every authed
   * view; the sign-in card (switch-account path) is what remains. Nothing
   * here touches the local SP engine or saves.
   */
  async signOut(): Promise<MpSnapshot> {
    if (!this.snapshot.userId) {
      return this.set({ ...emptyAuthed(), userId: null, username: null, phase: "signed-out", notice: null, error: null, retryAfter: null });
    }
    this.set({ error: null, notice: null, retryAfter: null });
    const result = await mpMutate(this.host, "auth-logout", {});
    if (result.kind === "ok") {
      if (!parseLogoutAck(result.bodyText)) {
        return this.set({ phase: "server-error", error: "The sign-out answered in an unexpected shape. State was kept; check before retrying." });
      }
      return this.set({ ...emptyAuthed(), userId: null, username: null, phase: "signed-out", notice: "Signed out. Choose a provider to link a different account.", error: null, retryAfter: null });
    }
    if (result.kind === "remote" && result.http === 401) {
      // The session is already dead server-side: unlink achieved.
      return this.set({ ...emptyAuthed(), userId: null, username: null, phase: "signed-out", notice: "Signed out. Choose a provider to link a different account.", error: null, retryAfter: null });
    }
    if (result.kind === "transport" && result.code === "session-unavailable") {
      // No bridge session to end (jar already empty): unlink locally.
      return this.set({ ...emptyAuthed(), userId: null, username: null, phase: "signed-out", notice: "Signed out. Choose a provider to link a different account.", error: null, retryAfter: null });
    }
    if (result.kind === "remote" && result.http === 429) {
      return this.set({
        phase: "rate-limited",
        retryAfter: result.retryAfter || null,
        error: `Rate limited: ${result.message}`,
      });
    }
    if (result.kind === "remote" && result.http >= 500) {
      return this.set({ phase: "server-error", error: result.message });
    }
    return this.set({ phase: "offline", error: "Sign-out failed. Your account is still linked; check your connection and try again." });
  }

  async performAction(args: {
    actionType: unknown;
    targetState?: unknown;
    convertAmount?: unknown;
    count?: unknown;
  }): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.enter();
    const validated = validateExecuteArgs(args);
    if (!validated.ok) {
      return this.set({ error: validated.reason });
    }
    this.set({ error: null, notice: null, retryAfter: null });
    const result = await mpMutate(this.host, "execute-action", validated.body);
    if (result.kind === "ok") {
      const message = parseExecuteResult(result.bodyText);
      if (message === null) {
        return this.set({ phase: "server-error", error: "The server answered in an unexpected shape. State was refreshed; check before retrying." });
      }
      // Authoritative post-mutation refresh BEFORE claiming completion.
      const refreshed = await this.refreshAuthed();
      if (refreshed.phase !== "ready") return refreshed;
      return this.set({ notice: message });
    }
    return this.applyRemoteFailure(result, "action");
  }

  async markNotificationRead(id: unknown): Promise<MpSnapshot> {
    return this.notificationIdMutation("notification-read", id, "Notification marked as read.");
  }

  async archiveNotification(id: unknown): Promise<MpSnapshot> {
    return this.notificationIdMutation("notification-archive", id, "Notification archived.");
  }

  async unsnoozeNotification(id: unknown): Promise<MpSnapshot> {
    return this.notificationIdMutation("notification-unsnooze", id, "Notification unsnoozed.");
  }

  async unarchiveNotification(id: unknown): Promise<MpSnapshot> {
    return this.notificationIdMutation("notification-unarchive", id, "Notification unarchived.");
  }

  async snoozeNotification(id: unknown, minutes?: unknown): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.enter();
    const validatedId = validateNotificationId(id);
    if (!validatedId.ok) {
      return this.set({ error: validatedId.reason });
    }
    const validatedMinutes = validateSnoozeMinutes(minutes);
    if (!validatedMinutes.ok) {
      return this.set({ error: validatedMinutes.reason });
    }
    return this.notificationAckMutation(
      "notification-snooze",
      { id: validatedId.id, snoozeMinutes: validatedMinutes.minutes },
      `Notification snoozed for ${validatedMinutes.minutes} minutes.`,
    );
  }

  async setNotificationPreference(action: unknown, type: unknown): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.enter();
    const validated = validateNotificationPreference({ action, type });
    if (!validated.ok) {
      return this.set({ error: validated.reason });
    }
    return this.notificationAckMutation(
      "notification-preference",
      { action: validated.body.action, type: validated.body.type },
      "Notification preference updated.",
    );
  }

  async markAllNotificationsRead(): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.enter();
    this.set({ error: null, notice: null, retryAfter: null });
    const result = await mpMutate(this.host, "notification-mark-all-read", {});
    if (result.kind === "ok") {
      if (!parseMutationAck(result.bodyText)) {
        return this.set({ phase: "server-error", error: "The server answered in an unexpected shape." });
      }
      const refreshed = await this.refreshAuthed();
      if (refreshed.phase !== "ready") return refreshed;
      return this.set({ notice: "All notifications marked as read." });
    }
    return this.applyRemoteFailure(result, "action");
  }

  /**
   * Load both player-mail pages on demand (#359 chat slice). Enter and
   * refresh never fetch mail: the inbox/sent pages load here, and every
   * mail mutation refreshes them before claiming completion.
   */
  async loadMail(): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.enter();
    this.set({ error: null, notice: null, retryAfter: null });
    const inboxResult = await mpFetch(this.host, "mail-inbox", MP_MAIL_LIMIT, 0);
    if (inboxResult.kind !== "ok") return this.applyMailReadFailure(inboxResult);
    const mailInbox = parseMailInbox(inboxResult.bodyText);
    if (!mailInbox) {
      return this.set({ phase: "server-error", mailInbox: null, error: "The mail inbox answered in an unexpected shape." });
    }
    const sentResult = await mpFetch(this.host, "mail-sent", MP_MAIL_LIMIT, 0);
    if (sentResult.kind !== "ok") {
      // The inbox page parsed but the sent page failed: keep the fresh inbox
      // unless the session itself expired, and report honestly.
      if (sentResult.kind === "remote" && sentResult.http === 401) {
        return this.applyMailReadFailure(sentResult);
      }
      const failure = this.applyMailReadFailure(sentResult);
      return this.set({ ...failure, mailInbox });
    }
    const mailSent = parseMailSent(sentResult.bodyText);
    if (!mailSent) {
      return this.set({ phase: "server-error", mailSent: null, error: "The sent mail answered in an unexpected shape." });
    }
    return this.set({ phase: "ready", mailInbox, mailSent, error: null, retryAfter: null });
  }

  /**
   * Load players-online presence on its own cadence (#359 presence slice).
   * Deliberately outside enter/refresh: the endpoint is public, its failures
   * (refusal, rate limit, malformed, offline, even a surprising 401) mean
   * absent, never zero, and must never expire the session or touch phase,
   * error, or the other views. A failed load keeps the last good value so a
   * reconnect shows stale-or-absent honestly; the screen re-calls this on
   * mount, manual refresh, reconnect, and foreground return for freshness.
   * Never throws: an unexpected host failure keeps the current snapshot.
   */
  async loadPresence(): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.get();
    try {
      const result = await mpFetch(this.host, "players-online");
      if (result.kind !== "ok") return this.get();
      const presence = parsePlayersOnline(result.bodyText);
      if (!presence) return this.get();
      return this.set({ presence });
    } catch {
      return this.get();
    }
  }

  /**
   * Load the Standing active-election detail on demand (#359 election
   * slice). Enter and refresh never fetch it: the Standing row offers the
   * drill-in, and this reads GET /api/elections?id={seatId ?? id}&view=
   * summary through the first-party session. The id is pre-checked against
   * the audited reference shape (24-hex or bounded seatId) and the Rust
   * bridge re-validates before anything is sent. Expiry evicts the detail
   * with every other authed projection; a 404 means the race is gone
   * server-side and reports the server's message with prior detail kept;
   * other failures keep prior detail with an honest error, never stale
   * success. Nothing here touches the local SP engine or saves.
   */
  async loadElectionDetail(id: unknown): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.enter();
    const validated = validateElectionId(id);
    if (!validated.ok) {
      return this.set({ error: validated.reason });
    }
    this.set({ error: null, notice: null, retryAfter: null });
    const result = await mpFetch(this.host, "election-detail", undefined, undefined, validated.id);
    if (result.kind === "remote" && result.http === 404) {
      // The referenced race no longer resolves server-side: say so with the
      // server's message and keep the last loaded detail, never blank it.
      return this.set({ phase: "offline", error: result.message });
    }
    if (result.kind !== "ok") return this.applyAuthedReadFailure(result);
    const electionDetail = parseElectionDetail(result.bodyText);
    if (!electionDetail) {
      return this.set({ phase: "server-error", electionDetail: null, error: "The election record answered in an unexpected shape." });
    }
    return this.set({ phase: "ready", electionDetail, error: null, retryAfter: null });
  }

  /**
   * Load the Standing corporation detail on demand (#359 corporation
   * slice). Enter and refresh never fetch it: the Standing row offers the
   * drill-in, and this reads GET /api/corporations/[id] through the
   * first-party session. The id is pre-checked against the audited reference
   * shape (sequential numeric id or 24-hex ObjectId) and the Rust bridge
   * re-validates before anything is sent. Expiry evicts the detail with
   * every other authed projection; a 404 means the company is gone
   * server-side and reports the server's message with prior detail kept;
   * other failures keep prior detail with an honest error, never stale
   * success. Nothing here touches the local SP engine or saves.
   */
  async loadCorporationDetail(id: unknown): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.enter();
    const validated = validateCorporationId(id);
    if (!validated.ok) {
      return this.set({ error: validated.reason });
    }
    this.set({ error: null, notice: null, retryAfter: null });
    const result = await mpFetch(this.host, "corporation-detail", undefined, undefined, undefined, validated.id);
    if (result.kind === "remote" && result.http === 404) {
      // The referenced company no longer resolves server-side: say so with
      // the server's message and keep the last loaded detail, never blank it.
      return this.set({ phase: "offline", error: result.message });
    }
    if (result.kind !== "ok") return this.applyAuthedReadFailure(result);
    const corporationDetail = parseCorporationDetail(result.bodyText);
    if (!corporationDetail) {
      return this.set({ phase: "server-error", corporationDetail: null, error: "The corporation record answered in an unexpected shape." });
    }
    return this.set({ phase: "ready", corporationDetail, error: null, retryAfter: null });
  }

  /**
   * Load the Standing union detail on demand (#359 union slice). Enter and
   * refresh never fetch it: the Standing row offers the drill-in, and this
   * reads GET /api/unions/[id] through the first-party session. The id is
   * pre-checked against the audited reference shape (strict 24-hex
   * ObjectId, the only shape client-nav `myUnionId` carries) and the Rust
   * bridge re-validates before anything is sent. Expiry evicts the detail
   * with every other authed projection; a 404 means the union is gone
   * server-side and a 403 means the labour system is disabled: both report
   * the server's message with prior detail kept. Every other failure maps
   * through the shared read-failure contract with prior detail kept and an
   * honest error, never stale success. Nothing here touches the local SP
   * engine or saves.
   */
  async loadUnionDetail(id: unknown): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.enter();
    const validated = validateUnionId(id);
    if (!validated.ok) {
      return this.set({ error: validated.reason });
    }
    this.set({ error: null, notice: null, retryAfter: null });
    const result = await mpFetch(this.host, "union-detail", undefined, undefined, undefined, undefined, validated.id);
    if (result.kind === "remote" && (result.http === 404 || result.http === 403)) {
      // The referenced union no longer resolves server-side, or the labour
      // system is disabled: say so with the server's message and keep the
      // last loaded detail, never blank it.
      return this.set({ phase: "offline", error: result.message });
    }
    if (result.kind !== "ok") return this.applyAuthedReadFailure(result);
    const unionDetail = parseUnionDetail(result.bodyText);
    if (!unionDetail) {
      return this.set({ phase: "server-error", unionDetail: null, error: "The union record answered in an unexpected shape." });
    }
    return this.set({ phase: "ready", unionDetail, error: null, retryAfter: null });
  }

  /**
   * Load the Standing cabinet-office briefing on demand (#359 cabinet
   * slice). Enter and refresh never fetch it: the Standing row offers the
   * drill-in, and this reads GET
   * /api/country/[code]/executive/cabinet/[positionId]/briefing through
   * the first-party session. The reference is pre-checked against the
   * audited shape (lowercase 2-3 letter country key plus snake_case seat
   * slug from client-nav `cabinetOffice`) and the Rust bridge re-validates
   * before anything is sent. Expiry evicts the briefing with every other
   * authed projection; a 404 means the seat is gone server-side and
   * reports the server's message with prior detail kept. A withheld
   * office ({canView:false}) is a 200 with roster facts plus restriction
   * titles, not an error; a vacant seat is a 200 with member null. Every
   * other failure maps through the shared read-failure contract with
   * prior detail kept and an honest error, never stale success. Nothing
   * here touches the local SP engine or saves.
   */
  async loadCabinetDetail(countryCode: unknown, positionId: unknown): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.enter();
    const validated = validateCabinetRef({ countryCode, positionId });
    if (!validated.ok) {
      return this.set({ error: validated.reason });
    }
    this.set({ error: null, notice: null, retryAfter: null });
    const result = await mpFetch(this.host, "cabinet-detail", undefined, undefined, undefined, undefined, undefined, validated.countryCode, validated.positionId);
    if (result.kind === "remote" && result.http === 404) {
      // The referenced seat no longer resolves server-side: say so with
      // the server's message and keep the last loaded briefing, never
      // blank it.
      return this.set({ phase: "offline", error: result.message });
    }
    if (result.kind !== "ok") return this.applyAuthedReadFailure(result);
    const cabinetDetail = parseCabinetDetail(result.bodyText);
    if (!cabinetDetail) {
      return this.set({ phase: "server-error", cabinetDetail: null, error: "The cabinet briefing answered in an unexpected shape." });
    }
    return this.set({ phase: "ready", cabinetDetail, error: null, retryAfter: null });
  }

  /**
   * Send player mail, then refresh both mail pages before claiming
   * completion. No optimistic send is modeled.
   */
  async sendMail(args: { toCharacterId: unknown; subject: unknown; body: unknown }): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.enter();
    const validated = validateMailSend(args);
    if (!validated.ok) {
      return this.set({ error: validated.reason });
    }
    this.set({ error: null, notice: null, retryAfter: null });
    const result = await mpMutate(this.host, "mail-send", validated.body);
    if (result.kind === "ok") {
      if (!parseMutationAck(result.bodyText)) {
        return this.set({ phase: "server-error", error: "The server answered in an unexpected shape." });
      }
      const refreshed = await this.loadMail();
      if (refreshed.phase !== "ready") return refreshed;
      return this.set({ notice: "Mail sent." });
    }
    return this.applyRemoteFailure(result, "action");
  }

  /** Mark one received mail read, then refresh before claiming completion. */
  async markMailRead(id: unknown): Promise<MpSnapshot> {
    return this.mailIdMutation("mail-read", id, "Mail marked as read.");
  }

  /** Soft-delete the recipient copy of one received mail, then refresh. */
  async deleteMail(id: unknown): Promise<MpSnapshot> {
    return this.mailIdMutation("mail-delete", id, "Mail deleted.");
  }

  /** Soft-delete the sender copy of one sent mail, then refresh. */
  async deleteSentMail(id: unknown): Promise<MpSnapshot> {
    return this.mailIdMutation("mail-sent-delete", id, "Sent mail deleted.");
  }

  /** Report one received mail for moderator review, then refresh. */
  async reportMail(id: unknown): Promise<MpSnapshot> {
    return this.mailIdMutation("mail-report", id, "Mail reported. Moderators will review it.");
  }

  /** One ack-shaped mail mutation with the same mutate-then-refresh contract. */
  private async mailIdMutation(
    op: "mail-read" | "mail-delete" | "mail-sent-delete" | "mail-report",
    id: unknown,
    notice: string,
  ): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.enter();
    const validated = validateMailId(id);
    if (!validated.ok) {
      return this.set({ error: validated.reason });
    }
    this.set({ error: null, notice: null, retryAfter: null });
    const result = await mpMutate(this.host, op, { id: validated.id });
    if (result.kind === "ok") {
      if (!parseMutationAck(result.bodyText)) {
        return this.set({ phase: "server-error", error: "The server answered in an unexpected shape." });
      }
      const refreshed = await this.loadMail();
      if (refreshed.phase !== "ready") return refreshed;
      return this.set({ notice });
    }
    return this.applyRemoteFailure(result, "action");
  }

  /** Map a mail-read failure without claiming any state change. */
  private applyMailReadFailure(result: MpCallResult): MpSnapshot {
    if (result.kind === "remote" && result.http === 401) {
      // Auth expired mid-session: drop authed state, keep the last identity
      // label out of the authed views.
      return this.set({ ...emptyAuthed(), phase: "auth-expired", error: "Your multiplayer session expired. Reconnect to continue." });
    }
    if (result.kind === "remote" && result.http === 429) {
      return this.set({
        phase: "rate-limited",
        retryAfter: result.retryAfter || null,
        error: `Rate limited: ${result.message}`,
      });
    }
    if (result.kind === "remote" && result.http >= 500) {
      return this.set({ phase: "server-error", error: result.message });
    }
    if (result.kind === "transport" && result.code === "session-unavailable") {
      return this.set({ phase: "offline", error: "The live-site session closed. Reconnect to continue." });
    }
    return this.set({ phase: "offline", error: "Multiplayer is unreachable. Check your connection and retry." });
  }

  private async notificationIdMutation(
    op: "notification-read" | "notification-archive" | "notification-unsnooze" | "notification-unarchive",
    id: unknown,
    notice: string,
  ): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.enter();
    const validated = validateNotificationId(id);
    if (!validated.ok) {
      return this.set({ error: validated.reason });
    }
    return this.notificationAckMutation(op, { id: validated.id }, notice);
  }

  /** One ack-shaped inbox mutation with the same mutate-then-refresh contract. */
  private async notificationAckMutation(
    op: MpMutateOpId,
    body: Record<string, unknown>,
    notice: string,
  ): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.enter();
    this.set({ error: null, notice: null, retryAfter: null });
    const result = await mpMutate(this.host, op, body);
    if (result.kind === "ok") {
      if (!parseMutationAck(result.bodyText)) {
        return this.set({ phase: "server-error", error: "The server answered in an unexpected shape." });
      }
      const refreshed = await this.refreshAuthed();
      if (refreshed.phase !== "ready") return refreshed;
      return this.set({ notice });
    }
    return this.applyRemoteFailure(result, "action");
  }

  /** Returns "signed-in" when the probe proved a session, else sets a phase. */
  private applyProbe(result: MpCallResult): "signed-in" | "not-signed-in" {
    if (result.kind === "ok") {
      const probe = parseSessionProbe(result.bodyText);
      if (!probe) {
        this.set({ phase: "server-error", error: "The session check answered in an unexpected shape." });
        return "not-signed-in";
      }
      if (!probe.active || !probe.userId || !probe.username) {
        this.set({ ...emptyAuthed(), userId: null, username: null, phase: "signed-out" });
        return "not-signed-in";
      }
      // Account switch mid-mode: drop everything cached for the old account.
      if (this.snapshot.userId && this.snapshot.userId !== probe.userId) {
        this.snapshot = { ...INITIAL_SNAPSHOT };
      }
      this.set({ userId: probe.userId, username: probe.username });
      return "signed-in";
    }
    if (result.kind === "remote" && result.http === 401) {
      if (this.snapshot.userId) {
        // The probe proved nothing, but a previous load named an account:
        // the session expired mid-mode, not a fresh signed-out entry.
        this.set({ ...emptyAuthed(), phase: "auth-expired", error: "Your multiplayer session expired. Reconnect to continue." });
      } else {
        this.set({ ...emptyAuthed(), userId: null, username: null, phase: "signed-out" });
      }
      return "not-signed-in";
    }
    if (result.kind === "remote" && result.http >= 500) {
      this.set({ phase: "server-error", error: result.message });
      return "not-signed-in";
    }
    if (result.kind === "transport" && result.code === "session-unavailable") {
      // No live-site window/session to bridge through: sign-in path, not data.
      const phase = this.snapshot.userId ? "offline" : "session-required";
      this.set({ phase });
      return "not-signed-in";
    }
    this.set({ phase: "offline", error: "Multiplayer is unreachable. Check your connection and retry." });
    return "not-signed-in";
  }

  /**
   * Read probe + character + turn + capabilities + inbox; the leading probe
   * keeps every refresh (manual, reconnect, post-mutation) isolated per
   * account. Any 401 expires the session.
   */
  private async refreshAuthed(): Promise<MpSnapshot> {
    const probe = await mpFetch(this.host, "auth-session");
    if (this.applyProbe(probe) !== "signed-in") return this.get();
    const me = await mpFetch(this.host, "character-me");
    if (me.kind !== "ok") return this.applyAuthedReadFailure(me);
    const character = parseCharacterMe(me.bodyText);
    if (!character) {
      return this.set({ phase: "server-error", error: "The player record answered in an unexpected shape." });
    }
    const turnResult = await mpFetch(this.host, "turn-status");
    if (turnResult.kind !== "ok") return this.applyAuthedReadFailure(turnResult);
    const turn = parseTurnStatus(turnResult.bodyText);
    if (!turn) {
      return this.set({ phase: "server-error", error: "The turn record answered in an unexpected shape." });
    }
    const capsResult = await mpFetch(this.host, "client-nav");
    if (capsResult.kind !== "ok") return this.applyAuthedReadFailure(capsResult);
    const capabilities = parseClientNav(capsResult.bodyText);
    if (!capabilities) {
      return this.set({ phase: "server-error", error: "The capabilities record answered in an unexpected shape." });
    }
    const inboxResult = await mpFetch(this.host, "notifications", MP_INBOX_LIMIT, 0);
    if (inboxResult.kind !== "ok") return this.applyAuthedReadFailure(inboxResult);
    const inbox = parseInbox(inboxResult.bodyText);
    if (!inbox) {
      return this.set({ phase: "server-error", error: "The inbox answered in an unexpected shape." });
    }
    return this.set({ phase: "ready", character, turn, capabilities, inbox, error: null, retryAfter: null });
  }

  private applyAuthedReadFailure(result: MpCallResult): MpSnapshot {
    if (result.kind === "remote" && result.http === 401) {
      // Auth expired mid-session: drop authed state, keep the last identity
      // label out of the authed views.
      return this.set({ ...emptyAuthed(), phase: "auth-expired", error: "Your multiplayer session expired. Reconnect to continue." });
    }
    if (result.kind === "remote" && result.http === 429) {
      return this.set({
        phase: "rate-limited",
        retryAfter: result.retryAfter || null,
        error: `Rate limited: ${result.message}`,
      });
    }
    if (result.kind === "remote" && result.http >= 500) {
      return this.set({ phase: "server-error", error: result.message });
    }
    if (result.kind === "transport" && result.code === "session-unavailable") {
      return this.set({ phase: "offline", error: "The live-site session closed. Reconnect to continue." });
    }
    return this.set({ phase: "offline", error: "Multiplayer is unreachable. Check your connection and retry." });
  }

  /** Map a mutation failure without claiming any state change. */
  private applyRemoteFailure(result: MpCallResult, _context: "action"): MpSnapshot {
    if (result.kind === "remote") {
      if (result.http === 401) {
        return this.set({ ...emptyAuthed(), phase: "auth-expired", error: "Your multiplayer session expired. Reconnect to continue." });
      }
      if (result.http === 429) {
        return this.set({
          phase: "rate-limited",
          retryAfter: result.retryAfter || null,
          error: `Rate limited: ${result.message}`,
        });
      }
      if (result.http === 409) {
        // Conflict (e.g. paused world): refusal with the server's message,
        // previously loaded state left intact.
        return this.set({ phase: "ready", error: result.message });
      }
      if (result.http >= 500) {
        return this.set({ phase: "server-error", error: result.message });
      }
      // 400/403/404: validation, authorization, or missing character — the
      // server's message is the whole story; prior state stands.
      return this.set({ phase: this.snapshot.userId ? "ready" : "signed-out", error: result.message });
    }
    if (result.kind === "transport" && result.code === "session-unavailable") {
      return this.set({ phase: "offline", error: "The live-site session closed. Reconnect to continue." });
    }
    if (result.kind === "transport" && (result.code === "bad-arg" || result.code === "unsupported-op")) {
      return this.set({ phase: "server-error", error: "The request was rejected before it was sent." });
    }
    return this.set({ phase: "offline", error: "Multiplayer is unreachable. Check your connection and retry." });
  }
}
