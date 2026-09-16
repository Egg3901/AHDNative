import { mpFetch, mpMutate, type MpBridgeHost, type MpCallResult } from "./bridge";
import {
  parseCharacterMe,
  parseExecuteResult,
  parseInbox,
  parseMutationAck,
  parseSessionProbe,
  parseTurnStatus,
  validateExecuteArgs,
  validateNotificationId,
  validateNotificationPreference,
  validateSnoozeMinutes,
  type MpCharacterView,
  type MpInboxView,
  type MpTurnView,
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
  inbox: MpInboxView | null;
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
  inbox: null,
  notice: null,
  error: null,
  retryAfter: null,
};

export const MP_INBOX_LIMIT = 25;

function emptyAuthed(): Pick<MpSnapshot, "character" | "turn" | "inbox"> {
  return { character: null, turn: null, inbox: null };
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

  /** Full authenticated load: probe, then player/turn/inbox in order. */
  async enter(): Promise<MpSnapshot> {
    this.set({ ...emptyAuthed(), phase: "loading", notice: null, error: null, retryAfter: null });
    const probe = await mpFetch(this.host, "auth-session");
    const probeOutcome = this.applyProbe(probe);
    if (probeOutcome !== "signed-in") return this.get();
    return this.refreshAuthed();
  }

  /** Re-read authoritative state; used for manual refresh and reconnect. */
  async refresh(): Promise<MpSnapshot> {
    if (!this.snapshot.userId) return this.enter();
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
      this.set({ ...emptyAuthed(), userId: null, username: null, phase: "signed-out" });
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

  /** Read character + turn + inbox; any 401 expires the session. */
  private async refreshAuthed(): Promise<MpSnapshot> {
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
    const inboxResult = await mpFetch(this.host, "notifications", MP_INBOX_LIMIT, 0);
    if (inboxResult.kind !== "ok") return this.applyAuthedReadFailure(inboxResult);
    const inbox = parseInbox(inboxResult.bodyText);
    if (!inbox) {
      return this.set({ phase: "server-error", error: "The inbox answered in an unexpected shape." });
    }
    return this.set({ phase: "ready", character, turn, inbox, error: null, retryAfter: null });
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
