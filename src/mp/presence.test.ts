import { describe, expect, it, vi } from "vitest";
import { MpModeSession } from "./adapter";
import type { MpBridgeHost } from "./bridge";

/**
 * Presence/countdown authority slice (#359). The players-online endpoint is
 * public and polled independently: its failures mean absent, never zero,
 * and must never expire the session or disturb phase, error, or the other
 * views. Enter/refresh keep their exact five-read contract; presence rides
 * a separate loadPresence the screen chains on mount, refresh, reconnect,
 * and foreground return.
 */

const USER_A = "507f1f77bcf86cd799439011";
const NOTE_ID = "607f1f77bcf86cd799439011";

const probeA = JSON.stringify({ active: true, sub: USER_A, username: "Ada" });
const meA = JSON.stringify({
  character: { _id: "c1", name: "Ada", party: "Labor", homeState: "CA", cashOnHand: 1000, actions: 3, countryId: "US" },
  corporation: null,
});
const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null });
const capsGuest = JSON.stringify({ user: null, hasCharacter: false });
const inbox = JSON.stringify({
  notifications: [{ _id: NOTE_ID, title: "Turn processed", message: "Done", read: false }],
  unreadCount: 1,
  total: 1,
  hasMore: false,
});
const presence = (online: number) =>
  JSON.stringify({ online, asOf: "2026-09-17T12:00:00.000Z" });

function scriptedHost(scripts: {
  fetch?: Record<string, Array<string | { reject: string }>>;
}): { host: MpBridgeHost; calls: string[] } {
  const calls: string[] = [];
  const queues = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(scripts.fetch ?? {})) queues.set(`fetch:${op}`, [...items]);
  return {
    calls,
    host: {
      fetch: vi.fn(async (op: string) => {
        calls.push(`fetch:${op}`);
        const item = queues.get(`fetch:${op}`)?.shift();
        if (typeof item === "string") return item;
        if (item) throw new Error(item.reject);
        throw new Error(`unexpected call fetch:${op}`);
      }),
      mutate: vi.fn(async () => {
        throw new Error("unexpected mutate");
      }),
      beginSignIn: vi.fn(async () => {}),
    },
  };
}

function enterScripts(extra?: Record<string, Array<string | { reject: string }>>) {
  return {
    fetch: {
      "auth-session": [probeA],
      "character-me": [meA],
      "turn-status": [turn],
      "client-nav": [capsGuest],
      notifications: [inbox],
      ...extra,
    },
  };
}

describe("MpModeSession loadPresence", () => {
  it("projects the authoritative count and freshness timestamp", async () => {
    const { host, calls } = scriptedHost(enterScripts({ "players-online": [presence(123)] }));
    const session = new MpModeSession(host);
    expect((await session.enter()).presence).toBeNull();
    const snapshot = await session.loadPresence();
    expect(snapshot.presence).toEqual({ online: 123, asOf: "2026-09-17T12:00:00.000Z" });
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.error).toBeNull();
    expect(calls).toEqual([
      "fetch:auth-session",
      "fetch:character-me",
      "fetch:turn-status",
      "fetch:client-nav",
      "fetch:notifications",
      "fetch:players-online",
    ]);
  });

  it("keeps enter and refresh on the exact five-read contract", async () => {
    const { host, calls } = scriptedHost({
      fetch: {
        "auth-session": [probeA, probeA],
        "character-me": [meA, meA],
        "turn-status": [turn, turn],
        "client-nav": [capsGuest, capsGuest],
        notifications: [inbox, inbox],
      },
    });
    const session = new MpModeSession(host);
    await session.enter();
    await session.refresh();
    expect(calls).toEqual([
      "fetch:auth-session",
      "fetch:character-me",
      "fetch:turn-status",
      "fetch:client-nav",
      "fetch:notifications",
      "fetch:auth-session",
      "fetch:character-me",
      "fetch:turn-status",
      "fetch:client-nav",
      "fetch:notifications",
    ]);
  });

  it("makes no call without a signed-in session", async () => {
    const { host, calls } = scriptedHost({});
    const session = new MpModeSession(host);
    const snapshot = await session.loadPresence();
    expect(snapshot.presence).toBeNull();
    expect(calls).toEqual([]);
  });

  it("keeps the last good value on malformed bodies", async () => {
    const { host } = scriptedHost(
      enterScripts({ "players-online": [presence(42), JSON.stringify({ online: "lots" })] }),
    );
    const session = new MpModeSession(host);
    await session.enter();
    expect((await session.loadPresence()).presence).toMatchObject({ online: 42 });
    const kept = await session.loadPresence();
    expect(kept.presence).toMatchObject({ online: 42 });
    expect(kept.phase).toBe("ready");
    expect(kept.error).toBeNull();
  });

  it("treats rate limits as absent without disturbing the ready session", async () => {
    const { host } = scriptedHost(
      enterScripts({ "players-online": [{ reject: "remote-error:429:60:Rate limited" }] }),
    );
    const session = new MpModeSession(host);
    await session.enter();
    const snapshot = await session.loadPresence();
    expect(snapshot.presence).toBeNull();
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.error).toBeNull();
    expect(snapshot.retryAfter).toBeNull();
    expect(snapshot.character?.name).toBe("Ada");
  });

  it("never expires the session on a surprising 401 from the public endpoint", async () => {
    const { host } = scriptedHost(
      enterScripts({ "players-online": [presence(9), { reject: "remote-error:401:0:Authentication required" }] }),
    );
    const session = new MpModeSession(host);
    await session.enter();
    expect((await session.loadPresence()).presence).toMatchObject({ online: 9 });
    const snapshot = await session.loadPresence();
    expect(snapshot.presence).toMatchObject({ online: 9 });
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.character?.name).toBe("Ada");
  });

  it("keeps prior presence when the live-site session drops", async () => {
    const { host } = scriptedHost(
      enterScripts({ "players-online": [presence(5), { reject: "session-unavailable" }] }),
    );
    const session = new MpModeSession(host);
    await session.enter();
    expect((await session.loadPresence()).presence).toMatchObject({ online: 5 });
    const snapshot = await session.loadPresence();
    expect(snapshot.presence).toMatchObject({ online: 5 });
    expect(snapshot.phase).toBe("ready");
  });

  it("drops presence on exit and account switch", async () => {
    const probeB = JSON.stringify({ active: true, sub: "507f1f77bcf86cd799439012", username: "Bo" });
    const { host } = scriptedHost({
      fetch: {
        "auth-session": [probeA, probeB, probeB],
        "character-me": [meA, meA, meA],
        "turn-status": [turn, turn, turn],
        "client-nav": [capsGuest, capsGuest, capsGuest],
        notifications: [inbox, inbox, inbox],
        "players-online": [presence(11)],
      },
    });
    const session = new MpModeSession(host);
    await session.enter();
    expect((await session.loadPresence()).presence).toMatchObject({ online: 11 });
    expect(session.exit().presence).toBeNull();
    await session.enter();
    const afterSwitch = await session.refresh();
    expect(afterSwitch.phase).toBe("ready");
    expect(session.get().presence).toBeNull();
    expect(session.get().username).toBe("Bo");
  });
});
