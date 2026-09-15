import { describe, expect, it, vi } from "vitest";
import { MpModeSession, MP_INBOX_LIMIT } from "./adapter";
import type { MpBridgeHost } from "./bridge";

const USER_A = "507f1f77bcf86cd799439011";
const USER_B = "507f1f77bcf86cd799439012";
const NOTE_ID = "607f1f77bcf86cd799439011";

const probeA = JSON.stringify({ active: true, sub: USER_A, username: "Ada" });
const probeB = JSON.stringify({ active: true, sub: USER_B, username: "Bo" });
const meA = (cash: number) =>
  JSON.stringify({
    character: { _id: "c1", name: "Ada", party: "Labor", homeState: "CA", cashOnHand: cash, actions: 3, countryId: "US" },
    corporation: null,
  });
const turn = (currentTurn = 12) =>
  JSON.stringify({ currentTurn, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null });
const inbox = (unread = 1) =>
  JSON.stringify({
    notifications: [{ _id: NOTE_ID, title: "Turn processed", message: "Done", read: false }],
    unreadCount: unread,
    total: 1,
    hasMore: false,
  });

interface Call {
  kind: "fetch" | "mutate";
  op: string;
  arg?: unknown;
}

/** Fake host with per-op scripted bodies/rejections; records call order. */
function scriptedHost(scripts: {
  fetch?: Record<string, Array<string | { reject: string }>>;
  mutate?: Record<string, Array<string | { reject: string }>>;
}): { host: MpBridgeHost; calls: Call[] } {
  const calls: Call[] = [];
  const queues = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(scripts.fetch ?? {})) queues.set(`fetch:${op}`, [...items]);
  for (const [op, items] of Object.entries(scripts.mutate ?? {})) queues.set(`mutate:${op}`, [...items]);
  const next = (key: string): string => {
    const queue = queues.get(key);
    const item = queue?.shift();
    if (typeof item === "string") return item;
    if (item) throw new Error(item.reject);
    throw new Error(`unexpected call ${key}`);
  };
  return {
    calls,
    host: {
      fetch: vi.fn(async (op: string, limit?: number, offset?: number) => {
        calls.push({ kind: "fetch", op, arg: [limit, offset] });
        return next(`fetch:${op}`);
      }),
      mutate: vi.fn(async (op: string, payload: unknown) => {
        calls.push({ kind: "mutate", op, arg: payload });
        return next(`mutate:${op}`);
      }),
      beginSignIn: vi.fn(async () => {}),
    },
  };
}

function readyScripts() {
  return {
    fetch: { "auth-session": [probeA], "character-me": [meA(1000)], "turn-status": [turn()], notifications: [inbox()] },
  };
}

describe("MpModeSession enter", () => {
  it("loads probe, player, turn, and inbox in order and goes ready", async () => {
    const { host, calls } = scriptedHost(readyScripts());
    const session = new MpModeSession(host);
    const snapshot = await session.enter();
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.username).toBe("Ada");
    expect(snapshot.character).toMatchObject({ name: "Ada", cashOnHand: 1000 });
    expect(snapshot.turn).toMatchObject({ currentTurn: 12, currentYear: 1862 });
    expect(snapshot.inbox?.unreadCount).toBe(1);
    expect(calls.map((call) => `${call.kind}:${call.op}`)).toEqual([
      "fetch:auth-session",
      "fetch:character-me",
      "fetch:turn-status",
      "fetch:notifications",
    ]);
    expect(calls[3]?.arg).toEqual([MP_INBOX_LIMIT, 0]);
  });

  it("reports signed-out on a 401 probe and keeps no authed state", async () => {
    const { host } = scriptedHost({ fetch: { "auth-session": [{ reject: "remote-error:401:0:Authentication required" }] } });
    const snapshot = await new MpModeSession(host).enter();
    expect(snapshot.phase).toBe("signed-out");
    expect(snapshot.character).toBeNull();
    expect(snapshot.turn).toBeNull();
    expect(snapshot.inbox).toBeNull();
  });

  it("reports session-required when no live-site window exists", async () => {
    const { host } = scriptedHost({ fetch: { "auth-session": [{ reject: "session-unavailable" }] } });
    expect((await new MpModeSession(host).enter()).phase).toBe("session-required");
  });

  it("reports server-error on a malformed probe", async () => {
    const { host } = scriptedHost({ fetch: { "auth-session": ["{oops"] } });
    expect((await new MpModeSession(host).enter()).phase).toBe("server-error");
  });

  it("expires the session when reads 401 after a signed-in probe", async () => {
    const { host } = scriptedHost({
      fetch: { "auth-session": [probeA], "character-me": [{ reject: "remote-error:401:0:Authentication required" }] },
    });
    const snapshot = await new MpModeSession(host).enter();
    expect(snapshot.phase).toBe("auth-expired");
    expect(snapshot.character).toBeNull();
    expect(snapshot.error).toMatch(/expired/i);
  });

  it("resets cached state on account switch", async () => {
    const { host, calls } = scriptedHost({
      fetch: {
        "auth-session": [probeA, probeB],
        "character-me": [meA(1000), meA(5)],
        "turn-status": [turn(), turn()],
        notifications: [inbox(), inbox(0)],
      },
    });
    const session = new MpModeSession(host);
    expect((await session.enter()).character?.cashOnHand).toBe(1000);
    const second = await session.enter();
    expect(second.username).toBe("Bo");
    expect(second.character?.cashOnHand).toBe(5);
    expect(second.inbox?.unreadCount).toBe(0);
    expect(calls).toHaveLength(8);
  });

  it("clears everything on exit", async () => {
    const { host } = scriptedHost(readyScripts());
    const session = new MpModeSession(host);
    await session.enter();
    expect(session.exit()).toEqual({
      phase: "idle",
      userId: null,
      username: null,
      character: null,
      turn: null,
      inbox: null,
      notice: null,
      error: null,
      retryAfter: null,
    });
  });
});

describe("MpModeSession performAction", () => {
  it("refreshes authoritative reads after the mutation before claiming completion", async () => {
    const { host, calls } = scriptedHost({
      fetch: {
        "auth-session": [probeA],
        "character-me": [meA(1000), meA(1250)],
        "turn-status": [turn(), turn(13)],
        notifications: [inbox(), inbox(0)],
      },
      mutate: { "execute-action": [JSON.stringify({ success: true, message: "Raised 250 from donors!" })] },
    });
    const session = new MpModeSession(host);
    await session.enter();
    calls.length = 0;
    const snapshot = await session.performAction({ actionType: "fundraise" });
    expect(calls.map((call) => `${call.kind}:${call.op}`)).toEqual([
      "mutate:execute-action",
      "fetch:character-me",
      "fetch:turn-status",
      "fetch:notifications",
    ]);
    expect(calls[0]?.arg).toEqual({ actionType: "fundraise" });
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.notice).toBe("Raised 250 from donors!");
    expect(snapshot.character?.cashOnHand).toBe(1250);
    expect(snapshot.turn?.currentTurn).toBe(13);
  });

  it("surfaces server refusal with prior state intact and no refresh claimed", async () => {
    const { host, calls } = scriptedHost({
      fetch: { "auth-session": [probeA], "character-me": [meA(1000)], "turn-status": [turn()], notifications: [inbox()] },
      mutate: { "execute-action": [{ reject: 'remote-error:400:0:{"error":"Not enough funds."}' }] },
    });
    const session = new MpModeSession(host);
    await session.enter();
    calls.length = 0;
    const snapshot = await session.performAction({ actionType: "campaign", targetState: "CA" });
    expect(calls).toHaveLength(1);
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.error).toBe("Not enough funds.");
    expect(snapshot.notice).toBeNull();
    expect(snapshot.character?.cashOnHand).toBe(1000);
  });

  it("maps conflicts, rate limits, auth expiry, and outages", async () => {
    const cases: Array<{ reject: string; phase: string; match: RegExp; cleared: boolean }> = [
      { reject: "remote-error:409:0:The game is currently paused.", phase: "ready", match: /paused/, cleared: false },
      { reject: 'remote-error:429:45:{"error":"too quick","code":"rate_limited"}', phase: "rate-limited", match: /too quick/, cleared: false },
      { reject: "remote-error:401:0:Authentication required", phase: "auth-expired", match: /expired/, cleared: true },
      { reject: 'remote-error:500:0:{"error":"Down for maintenance"}', phase: "server-error", match: /maintenance/, cleared: false },
    ];
    for (const { reject, phase, match, cleared } of cases) {
      const { host } = scriptedHost({
        fetch: { "auth-session": [probeA], "character-me": [meA(1000)], "turn-status": [turn()], notifications: [inbox()] },
        mutate: { "execute-action": [{ reject }] },
      });
      const session = new MpModeSession(host);
      await session.enter();
      const snapshot = await session.performAction({ actionType: "rest" });
      expect(snapshot.phase, reject).toBe(phase);
      expect(snapshot.error, reject).toMatch(match);
      expect(snapshot.character === null, reject).toBe(cleared);
      if (phase === "rate-limited") expect(snapshot.retryAfter).toBe(45);
    }
  });

  it("treats transport loss as offline with state intact", async () => {
    const { host } = scriptedHost({
      fetch: { "auth-session": [probeA], "character-me": [meA(1000)], "turn-status": [turn()], notifications: [inbox()] },
      mutate: { "execute-action": [{ reject: "session-transport" }] },
    });
    const session = new MpModeSession(host);
    await session.enter();
    const snapshot = await session.performAction({ actionType: "rest" });
    expect(snapshot.phase).toBe("offline");
    expect(snapshot.character?.cashOnHand).toBe(1000);
  });

  it("never sends client-invalid payloads", async () => {
    const { host, calls } = scriptedHost(readyScripts());
    const session = new MpModeSession(host);
    await session.enter();
    calls.length = 0;
    for (const args of [
      { actionType: "nuke" },
      { actionType: "fundraise", convertAmount: 10 },
      { actionType: "convertCash", convertAmount: 0 },
    ]) {
      const snapshot = await session.performAction(args);
      expect(snapshot.error).toBeTruthy();
    }
    expect(calls).toHaveLength(0);
  });
});

describe("MpModeSession inbox mutations", () => {
  it("marks read and archives with post-mutation refresh", async () => {
    const { host, calls } = scriptedHost({
      fetch: {
        "auth-session": [probeA, probeA],
        "character-me": [meA(1000), meA(1000), meA(1000)],
        "turn-status": [turn(), turn(), turn()],
        notifications: [inbox(2), inbox(1), inbox(1)],
      },
      mutate: {
        "notification-read": [JSON.stringify({ success: true })],
        "notification-archive": [JSON.stringify({ success: true })],
      },
    });
    const session = new MpModeSession(host);
    await session.enter();
    calls.length = 0;
    const read = await session.markNotificationRead(NOTE_ID);
    expect(read.notice).toMatch(/marked as read/);
    expect(read.inbox?.unreadCount).toBe(1);
    expect(calls[0]).toMatchObject({ kind: "mutate", op: "notification-read", arg: { id: NOTE_ID } });

    calls.length = 0;
    const archived = await session.archiveNotification(NOTE_ID);
    expect(archived.notice).toMatch(/archived/);
    expect(calls[0]).toMatchObject({ kind: "mutate", op: "notification-archive" });
  });

  it("rejects bad ids client-side and marks all read in scope", async () => {
    const { host, calls } = scriptedHost({
      fetch: {
        "auth-session": [probeA],
        "character-me": [meA(1000), meA(1000)],
        "turn-status": [turn(), turn()],
        notifications: [inbox(2), inbox(0)],
      },
      mutate: { "notification-mark-all-read": [JSON.stringify({ success: true })] },
    });
    const session = new MpModeSession(host);
    await session.enter();
    calls.length = 0;
    expect((await session.markNotificationRead("short")).error).toBeTruthy();
    expect(calls).toHaveLength(0);
    const all = await session.markAllNotificationsRead();
    expect(all.notice).toMatch(/All notifications marked as read/);
    expect(all.inbox?.unreadCount).toBe(0);
  });
});

describe("MpModeSession reconnect", () => {
  it("refresh re-enters when identity is gone and recovers after loss", async () => {
    const { host } = scriptedHost({
      fetch: {
        "auth-session": [probeA],
        "character-me": [{ reject: "session-transport" }, meA(1000)],
        "turn-status": [turn()],
        notifications: [inbox()],
      },
    });
    const session = new MpModeSession(host);
    expect((await session.enter()).phase).toBe("offline");
    expect((await session.refresh()).phase).toBe("ready");
  });
});
