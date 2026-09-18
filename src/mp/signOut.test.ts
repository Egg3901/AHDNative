import { describe, expect, it, vi } from "vitest";
import { MpModeSession } from "./adapter";
import type { MpBridgeHost } from "./bridge";

/* Mobile unlink / switch-account boundary (#149): Native links an account
 * but offers no way to unlink it. exit() clears only in-memory state while
 * the platform cookie jar keeps the session, so the next enter() silently
 * re-links the same account. On a phone (single WebView, possibly shared)
 * the player is stuck: they can neither unlink for privacy nor switch to a
 * different account. The bridge must model the real server contract
 * (POST /api/auth/logout clears the cookie and revokes issued tokens) and
 * the adapter must clear local state only once the server confirms, so a
 * failed unlink keeps the signed-in session with retry instead of stranding
 * the player signed out locally while the server session lives on.
 */

const USER = "507f1f77bcf86cd799439011";
const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const signedOutProbe = JSON.stringify({ active: false });
const me = JSON.stringify({
  character: { _id: "c1", name: "Ada", party: "Labor", homeState: "CA", cashOnHand: 1000, actions: 3, countryId: "US" },
  corporation: null,
});
const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null });
const caps = JSON.stringify({ user: { id: USER, username: "Ada", isAdmin: false }, hasCharacter: true });
const inbox = JSON.stringify({ notifications: [], unreadCount: 0, total: 0, hasMore: false });
const logoutAck = JSON.stringify({ ok: true });

interface Script {
  fetch?: Record<string, Array<string | { reject: string }>>;
  mutate?: Record<string, Array<string | { reject: string }>>;
}

function fakeHost(
  script: Script,
  beginSignIn: MpBridgeHost["beginSignIn"] = async () => {},
): { host: MpBridgeHost; mutateSpy: ReturnType<typeof vi.fn>; beginSpy: ReturnType<typeof vi.fn> } {
  const fetchQueues = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(script.fetch ?? {})) fetchQueues.set(`fetch:${op}`, [...items]);
  const mutateQueues = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(script.mutate ?? {})) mutateQueues.set(`mutate:${op}`, [...items]);
  const mutateSpy = vi.fn(async (op: string) => {
    const item = mutateQueues.get(`mutate:${op}`)?.shift();
    if (typeof item === "string") return item;
    if (item) throw new Error(item.reject);
    throw new Error(`unexpected mutate ${op}`);
  });
  const beginSpy = vi.fn(beginSignIn);
  return {
    mutateSpy,
    beginSpy,
    host: {
      fetch: async (op: string) => {
        const item = fetchQueues.get(`fetch:${op}`)?.shift();
        if (typeof item === "string") return item;
        if (item) throw new Error(item.reject);
        throw new Error(`unexpected fetch ${op}`);
      },
      mutate: mutateSpy,
      beginSignIn: beginSpy,
    },
  };
}

function readyFetches(firstProbe: Array<string | { reject: string }> = [probe]): Script["fetch"] {
  return {
    "auth-session": firstProbe,
    "character-me": [me],
    "turn-status": [turn],
    "client-nav": [caps],
    notifications: [inbox],
  };
}

async function readySession(host: MpBridgeHost): Promise<MpModeSession> {
  const session = new MpModeSession(host);
  const entered = await session.enter();
  expect(entered.phase).toBe("ready");
  return session;
}

describe("MpModeSession signOut unlink", () => {
  it("confirmed unlink clears identity and offers the sign-in path", async () => {
    const { host, mutateSpy } = fakeHost({
      fetch: readyFetches(),
      mutate: { "auth-logout": [logoutAck] },
    });
    const session = await readySession(host);
    const next = await session.signOut();
    expect(mutateSpy).toHaveBeenCalledWith("auth-logout", {});
    expect(next.phase).toBe("signed-out");
    expect(next.userId).toBeNull();
    expect(next.username).toBeNull();
    expect(next.character).toBeNull();
    expect(next.inbox).toBeNull();
    expect(next.error).toBeNull();
    expect(next.notice).toMatch(/signed out/i);
  });

  it("relaunch after unlink stays signed out without native carryover", async () => {
    const { host } = fakeHost({
      fetch: readyFetches(),
      mutate: { "auth-logout": [logoutAck] },
    });
    const session = await readySession(host);
    await session.signOut();
    // A fresh adapter re-probes the platform jar: the server cleared the
    // cookie, so the probe reports signed out and nothing is re-linked.
    const relaunched = new MpModeSession(fakeHost({ fetch: readyFetches([signedOutProbe]) }).host);
    const snapshot = await relaunched.enter();
    expect(snapshot.phase).toBe("signed-out");
    expect(snapshot.userId).toBeNull();
  });

  it("failed unlink keeps the signed-in session with retry", async () => {
    const { host } = fakeHost({
      fetch: readyFetches(),
      mutate: { "auth-logout": [{ reject: "session-transport" }] },
    });
    const session = await readySession(host);
    const next = await session.signOut();
    expect(next.phase).toBe("offline");
    expect(next.userId).toBe(USER);
    expect(next.character?.name).toBe("Ada");
    expect(next.error).toMatch(/try again|retry|unreachable/i);
  });

  it("missing bridge session unlinks locally without inventing a logout", async () => {
    const { host, mutateSpy } = fakeHost({
      fetch: readyFetches(),
      mutate: { "auth-logout": [{ reject: "session-unavailable" }] },
    });
    const session = await readySession(host);
    const next = await session.signOut();
    expect(mutateSpy).toHaveBeenCalledWith("auth-logout", {});
    expect(next.phase).toBe("signed-out");
    expect(next.userId).toBeNull();
    expect(next.character).toBeNull();
  });

  it("server-rejected session unlinks locally on 401", async () => {
    const { host } = fakeHost({
      fetch: readyFetches(),
      mutate: { "auth-logout": [{ reject: "remote-error:401:0:Authentication required" }] },
    });
    const session = await readySession(host);
    const next = await session.signOut();
    expect(next.phase).toBe("signed-out");
    expect(next.userId).toBeNull();
    expect(next.character).toBeNull();
  });

  it("sign-out while already signed out performs no bridge call", async () => {
    const { host, mutateSpy } = fakeHost({
      fetch: readyFetches([{ reject: "remote-error:401:0:Authentication required" }]),
    });
    const session = new MpModeSession(host);
    const entered = await session.enter();
    expect(entered.phase).toBe("signed-out");
    const next = await session.signOut();
    expect(mutateSpy).not.toHaveBeenCalled();
    expect(next.phase).toBe("signed-out");
    expect(next.userId).toBeNull();
  });
});

/* Unlink-to-switch acceptance (#149, #363): unlinking must end in a state
 * from which a different account can link on the same session object with
 * no residue from the previous identity — no stale userId, character,
 * capabilities, or inbox, and no leftover notice or error. A failed switch
 * trip must keep the signed-out state with retry instead of stranding or
 * partially linking.
 */
describe("MpModeSession unlink-to-switch acceptance", () => {
  const USER_B = "507f1f77bcf86cd799439012";
  const probeBo = JSON.stringify({ active: true, sub: USER_B, username: "Bo" });
  const meBo = JSON.stringify({
    character: { _id: "c2", name: "Bo", party: "Whig", homeState: "NY", cashOnHand: 5, actions: 2, countryId: "US" },
    corporation: null,
  });
  const capsBo = JSON.stringify({ user: { id: USER_B, username: "Bo", isAdmin: false }, hasCharacter: true });
  const inboxBo = JSON.stringify({ notifications: [], unreadCount: 0, total: 0, hasMore: false });

  function switchScript(): Script {
    return {
      fetch: {
        "auth-session": [probe, probeBo],
        "character-me": [me, meBo],
        "turn-status": [turn, turn],
        "client-nav": [caps, capsBo],
        notifications: [inbox, inboxBo],
      },
      mutate: { "auth-logout": [logoutAck] },
    };
  }

  it("unlink then link as a different account carries no state across the switch", async () => {
    const { host, beginSpy } = fakeHost(switchScript(), async () => {});
    const session = new MpModeSession(host);
    const entered = await session.enter();
    expect(entered.phase).toBe("ready");
    expect(entered.username).toBe("Ada");

    const unlinked = await session.signOut();
    expect(unlinked.phase).toBe("signed-out");
    expect(unlinked.userId).toBeNull();

    const switched = await session.signIn("google");
    expect(beginSpy).toHaveBeenCalledTimes(1);
    expect(beginSpy).toHaveBeenCalledWith("google");
    expect(switched.phase).toBe("ready");
    expect(switched.userId).toBe(USER_B);
    expect(switched.username).toBe("Bo");
    expect(switched.character?.name).toBe("Bo");
    expect(switched.character?.cashOnHand).toBe(5);
    expect(switched.inbox?.unreadCount).toBe(0);
    expect(switched.notice).toBeNull();
    expect(switched.error).toBeNull();
  });

  it("failed switch trip after unlink stays signed out with retry", async () => {
    const { host, beginSpy } = fakeHost(switchScript(), async () => {
      throw new Error("main webview is unavailable");
    });
    const session = new MpModeSession(host);
    expect((await session.enter()).username).toBe("Ada");
    expect((await session.signOut()).phase).toBe("signed-out");

    const failed = await session.signIn("google");
    expect(beginSpy).toHaveBeenCalledWith("google");
    expect(failed.phase).toBe("offline");
    expect(failed.userId).toBeNull();
    expect(failed.character).toBeNull();
    expect(failed.error).toBeTruthy();

    // Retry links the new account cleanly: no probe was spent on the failed
    // trip, so the queued session answers the retry.
    beginSpy.mockImplementationOnce(async () => {});
    const retried = await session.signIn("discord");
    expect(retried.phase).toBe("ready");
    expect(retried.userId).toBe(USER_B);
    expect(retried.username).toBe("Bo");
    expect(retried.character?.name).toBe("Bo");
    expect(retried.error).toBeNull();
  });
});
