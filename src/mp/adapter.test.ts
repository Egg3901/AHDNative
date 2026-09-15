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
const caps = () =>
  JSON.stringify({
    user: { id: USER_A, username: "Ada", isAdmin: false },
    hasCharacter: true,
    characterCountryId: "US",
    characterName: "Ada",
    unreadCount: 1,
    unreadMailCount: 2,
    myCorporationId: 7,
    myUnionId: null,
    activeElection: { id: "68a000000000000000000001", label: "President — National" },
    cabinetOffice: { positionId: "sec-state", positionName: "Secretary of State", countryCode: "us" },
    governorOffice: null,
  });
const capsGuest = () => JSON.stringify({ user: null, hasCharacter: false });

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
    fetch: {
      "auth-session": [probeA],
      "character-me": [meA(1000)],
      "turn-status": [turn()],
      "client-nav": [caps()],
      notifications: [inbox()],
    },
  };
}

describe("MpModeSession enter", () => {
  it("loads probe, player, turn, capabilities, and inbox in order and goes ready", async () => {
    const { host, calls } = scriptedHost(readyScripts());
    const session = new MpModeSession(host);
    const snapshot = await session.enter();
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.username).toBe("Ada");
    expect(snapshot.character).toMatchObject({ name: "Ada", cashOnHand: 1000 });
    expect(snapshot.turn).toMatchObject({ currentTurn: 12, currentYear: 1862 });
    expect(snapshot.capabilities).toMatchObject({ hasCharacter: true, characterName: "Ada" });
    expect(snapshot.inbox?.unreadCount).toBe(1);
    expect(calls.map((call) => `${call.kind}:${call.op}`)).toEqual([
      "fetch:auth-session",
      "fetch:character-me",
      "fetch:turn-status",
      "fetch:client-nav",
      "fetch:notifications",
    ]);
    expect(calls[4]?.arg).toEqual([MP_INBOX_LIMIT, 0]);
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
        "client-nav": [caps(), capsGuest()],
        notifications: [inbox(), inbox(0)],
      },
    });
    const session = new MpModeSession(host);
    expect((await session.enter()).character?.cashOnHand).toBe(1000);
    const second = await session.enter();
    expect(second.username).toBe("Bo");
    expect(second.character?.cashOnHand).toBe(5);
    expect(second.inbox?.unreadCount).toBe(0);
    expect(calls).toHaveLength(10);
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
      capabilities: null,
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
        "auth-session": [probeA, probeA],
        "character-me": [meA(1000), meA(1250)],
        "turn-status": [turn(), turn(13)],
        "client-nav": [caps(), caps()],
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
      "fetch:auth-session",
      "fetch:character-me",
      "fetch:turn-status",
      "fetch:client-nav",
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
      fetch: {
        "auth-session": [probeA],
        "character-me": [meA(1000)],
        "turn-status": [turn()],
        "client-nav": [caps()],
        notifications: [inbox()],
      },
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
        fetch: {
          "auth-session": [probeA],
          "character-me": [meA(1000)],
          "turn-status": [turn()],
          "client-nav": [caps()],
          notifications: [inbox()],
        },
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
      fetch: {
        "auth-session": [probeA],
        "character-me": [meA(1000)],
        "turn-status": [turn()],
        "client-nav": [caps()],
        notifications: [inbox()],
      },
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
        "auth-session": [probeA, probeA, probeA],
        "character-me": [meA(1000), meA(1000), meA(1000)],
        "turn-status": [turn(), turn(), turn()],
        "client-nav": [caps(), caps(), caps()],
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
        "auth-session": [probeA, probeA],
        "character-me": [meA(1000), meA(1000)],
        "turn-status": [turn(), turn()],
        "client-nav": [caps(), caps()],
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

describe("MpModeSession batch actions (#361)", () => {
  function batchScripts() {
    return {
      fetch: {
        "auth-session": [probeA],
        "character-me": [meA(1000), meA(900)],
        "turn-status": [turn(), turn()],
        notifications: [inbox(), inbox()],
      },
      mutate: { "execute-action": [JSON.stringify({ success: true, message: "Ran 5 times!" })] },
    };
  }

  it("sends the batch count, then refreshes before claiming completion", async () => {
    const { host, calls } = scriptedHost(batchScripts());
    const session = new MpModeSession(host);
    await session.enter();
    calls.length = 0;
    const snapshot = await session.performAction({ actionType: "fundraise", count: 5 });
    expect(calls.map((call) => `${call.kind}:${call.op}`)).toEqual([
      "mutate:execute-action",
      "fetch:character-me",
      "fetch:turn-status",
      "fetch:notifications",
    ]);
    expect(calls[0]?.arg).toEqual({ actionType: "fundraise", count: 5 });
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.notice).toBe("Ran 5 times!");
    expect(snapshot.character?.cashOnHand).toBe(900);
  });

  it("never sends batch runs for convertCash or count mixed with an amount", async () => {
    const { host, calls } = scriptedHost(readyScripts());
    const session = new MpModeSession(host);
    await session.enter();
    calls.length = 0;
    for (const args of [
      { actionType: "convertCash", count: 5 },
      { actionType: "convertCash", count: 10 },
      { actionType: "rest", count: 10 },
      { actionType: "fundraise", count: 5, convertAmount: 10 },
      { actionType: "fundraise", count: 7 },
    ]) {
      const snapshot = await session.performAction(args);
      expect(snapshot.error, JSON.stringify(args)).toBeTruthy();
      expect(snapshot.notice, JSON.stringify(args)).toBeNull();
    }
    expect(calls).toHaveLength(0);
  });

  it("maps the server batch refusal honestly with prior state intact", async () => {
    const { host, calls } = scriptedHost({
      fetch: { "auth-session": [probeA], "character-me": [meA(1000)], "turn-status": [turn()], notifications: [inbox()] },
      mutate: {
        "execute-action": [{ reject: 'remote-error:400:0:{"error":"Batch execution is not available for this action."}' }],
      },
    });
    const session = new MpModeSession(host);
    await session.enter();
    calls.length = 0;
    // Client-valid batch the server still refuses (drift or world state):
    // the refusal surfaces verbatim with prior state intact.
    const snapshot = await session.performAction({ actionType: "fundraise", count: 5 });
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.error).toBe("Batch execution is not available for this action.");
    expect(snapshot.notice).toBeNull();
    expect(snapshot.character?.cashOnHand).toBe(1000);
    // No authoritative refresh is claimed after a refusal.
    expect(calls).toHaveLength(1);
  });
});

describe("MpModeSession inbox snooze/unarchive/preferences (#361)", () => {
  function inboxScripts(extraMutate: Record<string, Array<string | { reject: string }>>) {
    return {
      fetch: {
        "auth-session": [probeA],
        "character-me": [meA(1000), meA(1000), meA(1000)],
        "turn-status": [turn(), turn(), turn()],
        notifications: [inbox(2), inbox(1), inbox(1)],
      },
      mutate: extraMutate,
    };
  }

  it("snoozes with an explicit length, defaulting to 720, mutating before refresh", async () => {
    const { host, calls } = scriptedHost(
      inboxScripts({ "notification-snooze": [JSON.stringify({ success: true }), JSON.stringify({ success: true })] }),
    );
    const session = new MpModeSession(host);
    await session.enter();
    calls.length = 0;
    const snoozed = await session.snoozeNotification(NOTE_ID, 60);
    expect(calls.map((call) => `${call.kind}:${call.op}`)).toEqual([
      "mutate:notification-snooze",
      "fetch:character-me",
      "fetch:turn-status",
      "fetch:notifications",
    ]);
    expect(calls[0]?.arg).toEqual({ id: NOTE_ID, snoozeMinutes: 60 });
    expect(snoozed.notice).toMatch(/snoozed for 60 minutes/);
    expect(snoozed.inbox?.unreadCount).toBe(1);

    calls.length = 0;
    const defaulted = await session.snoozeNotification(NOTE_ID);
    expect(calls[0]?.arg).toEqual({ id: NOTE_ID, snoozeMinutes: 720 });
    expect(defaulted.notice).toMatch(/snoozed for 720 minutes/);
  });

  it("rejects bad snooze lengths and ids client-side", async () => {
    const { host, calls } = scriptedHost(readyScripts());
    const session = new MpModeSession(host);
    await session.enter();
    calls.length = 0;
    for (const args of [[NOTE_ID, 4], [NOTE_ID, 10081], [NOTE_ID, "60"], ["short", 60]] as const) {
      const snapshot = await session.snoozeNotification(args[0], args[1]);
      expect(snapshot.error, JSON.stringify(args)).toBeTruthy();
    }
    expect(calls).toHaveLength(0);
  });

  it("unsnoozes and unarchives with post-mutation refresh", async () => {
    const { host, calls } = scriptedHost(
      inboxScripts({
        "notification-unsnooze": [JSON.stringify({ success: true })],
        "notification-unarchive": [JSON.stringify({ success: true })],
      }),
    );
    const session = new MpModeSession(host);
    await session.enter();
    calls.length = 0;
    const unsnoozed = await session.unsnoozeNotification(NOTE_ID);
    expect(calls[0]).toMatchObject({ kind: "mutate", op: "notification-unsnooze", arg: { id: NOTE_ID } });
    expect(unsnoozed.notice).toMatch(/unsnoozed/);
    calls.length = 0;
    const unarchived = await session.unarchiveNotification(NOTE_ID);
    expect(calls[0]).toMatchObject({ kind: "mutate", op: "notification-unarchive", arg: { id: NOTE_ID } });
    expect(unarchived.notice).toMatch(/unarchived/);
  });

  it("mutes and unmutes preferences with exact payloads", async () => {
    const { host, calls } = scriptedHost(
      inboxScripts({
        "notification-preference": [JSON.stringify({ success: true }), JSON.stringify({ success: true })],
      }),
    );
    const session = new MpModeSession(host);
    await session.enter();
    calls.length = 0;
    const muted = await session.setNotificationPreference("mute", "turn_advance");
    expect(calls.map((call) => `${call.kind}:${call.op}`)).toEqual([
      "mutate:notification-preference",
      "fetch:character-me",
      "fetch:turn-status",
      "fetch:notifications",
    ]);
    expect(calls[0]?.arg).toEqual({ action: "mute", type: "turn_advance" });
    expect(muted.notice).toMatch(/preference updated/);
    calls.length = 0;
    const unmuted = await session.setNotificationPreference("unmute", "system");
    expect(calls[0]?.arg).toEqual({ action: "unmute", type: "system" });
    expect(unmuted.notice).toMatch(/preference updated/);
  });

  it("rejects bad preference payloads client-side", async () => {
    const { host, calls } = scriptedHost(readyScripts());
    const session = new MpModeSession(host);
    await session.enter();
    calls.length = 0;
    for (const args of [
      ["snooze", "system"],
      ["mute", "nuke"],
      ["mute", ""],
      [null, "system"],
    ] as const) {
      const snapshot = await session.setNotificationPreference(args[0], args[1]);
      expect(snapshot.error, JSON.stringify(args)).toBeTruthy();
    }
    expect(calls).toHaveLength(0);
  });
});

describe("MpModeSession capabilities", () => {
  it("loads client-nav between turn and inbox and projects standing", async () => {
    const { host, calls } = scriptedHost({
      fetch: {
        "auth-session": [probeA],
        "character-me": [meA(1000)],
        "turn-status": [turn()],
        "client-nav": [caps()],
        notifications: [inbox()],
      },
    });
    const snapshot = await new MpModeSession(host).enter();
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.capabilities).toMatchObject({
      hasCharacter: true,
      characterName: "Ada",
      characterCountryId: "US",
      unreadMailCount: 2,
      corporationId: 7,
      activeElectionLabel: "President — National",
      cabinetOffice: "Secretary of State",
    });
    expect(calls.map((call) => `${call.kind}:${call.op}`)).toEqual([
      "fetch:auth-session",
      "fetch:character-me",
      "fetch:turn-status",
      "fetch:client-nav",
      "fetch:notifications",
    ]);
  });

  it("fails closed on malformed capabilities with prior state intact", async () => {
    const { host } = scriptedHost({
      fetch: {
        "auth-session": [probeA, probeA],
        "character-me": [meA(1000), meA(1000)],
        "turn-status": [turn(), turn()],
        "client-nav": [caps(), "{oops"],
        notifications: [inbox()],
      },
    });
    const session = new MpModeSession(host);
    expect((await session.enter()).phase).toBe("ready");
    const failed = await session.refresh();
    expect(failed.phase).toBe("server-error");
    expect(failed.error).toMatch(/capabilities/);
    expect(failed.character?.cashOnHand).toBe(1000);
    expect(failed.capabilities).toMatchObject({ hasCharacter: true });
  });

  it("tolerates the guest capabilities shape without leaving ready", async () => {
    const { host } = scriptedHost({
      fetch: {
        "auth-session": [probeA],
        "character-me": [meA(1000)],
        "turn-status": [turn()],
        "client-nav": [capsGuest()],
        notifications: [inbox()],
      },
    });
    const snapshot = await new MpModeSession(host).enter();
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.capabilities).toMatchObject({ hasCharacter: false });
  });
});

describe("MpModeSession refresh isolation", () => {
  it("detects an account switch on refresh, not just enter", async () => {
    const { host } = scriptedHost({
      fetch: {
        "auth-session": [probeA, probeB],
        "character-me": [meA(1000), meA(5)],
        "turn-status": [turn(), turn()],
        "client-nav": [caps(), capsGuest()],
        notifications: [inbox(), inbox(0)],
      },
    });
    const session = new MpModeSession(host);
    expect((await session.enter()).username).toBe("Ada");
    const second = await session.refresh();
    expect(second.phase).toBe("ready");
    expect(second.username).toBe("Bo");
    expect(second.character?.cashOnHand).toBe(5);
    expect(second.capabilities).toMatchObject({ hasCharacter: false });
    expect(second.inbox?.unreadCount).toBe(0);
  });

  it("re-probes before post-mutation refresh and never claims success when expired", async () => {
    const { host, calls } = scriptedHost({
      fetch: {
        "auth-session": [probeA, { reject: "remote-error:401:0:Authentication required" }],
        "character-me": [meA(1000)],
        "turn-status": [turn()],
        "client-nav": [caps()],
        notifications: [inbox()],
      },
      mutate: { "execute-action": [JSON.stringify({ success: true, message: "Raised 250!" })] },
    });
    const session = new MpModeSession(host);
    await session.enter();
    calls.length = 0;
    const snapshot = await session.performAction({ actionType: "fundraise" });
    expect(snapshot.phase).toBe("auth-expired");
    expect(snapshot.notice).toBeNull();
    expect(calls.map((call) => `${call.kind}:${call.op}`)).toEqual([
      "mutate:execute-action",
      "fetch:auth-session",
    ]);
  });
});

describe("MpModeSession reconnect", () => {
  it("refresh re-probes and recovers after loss", async () => {
    const { host } = scriptedHost({
      fetch: {
        "auth-session": [probeA, probeA],
        "character-me": [{ reject: "session-transport" }, meA(1000)],
        "turn-status": [turn()],
        "client-nav": [caps()],
        notifications: [inbox()],
      },
    });
    const session = new MpModeSession(host);
    expect((await session.enter()).phase).toBe("offline");
    expect((await session.refresh()).phase).toBe("ready");
  });
});
