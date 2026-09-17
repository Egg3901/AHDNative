import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MpModeSession } from "./adapter";
import type { MpBridgeHost } from "./bridge";

/* Persistent account-session lifecycle (#149): the live AHDGame site owns
 * authentication and the platform cookie profile owns session material, so
 * every boundary below must resolve through the bridge probe alone — no
 * in-memory carryover, no native credentials, no token store.
 *
 * Reference: AHDGame `src/app/api/auth/session/route.ts` (401
 * `{active:false}` signed out, `{active:true, sub, username}` signed in;
 * logout clears the cookie and revokes issued tokens) and
 * `src/lib/authCookieName.ts` (`auth-token-<deployment-tag>`).
 */

const USER = "507f1f77bcf86cd799439011";
const NOTE = "607f1f77bcf86cd799439011";

const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const me = JSON.stringify({
  character: { _id: "c1", name: "Ada", party: "Labor", homeState: "CA", cashOnHand: 1000, actions: 3, countryId: "US" },
  corporation: null,
});
const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null });
const caps = JSON.stringify({ user: { id: USER, username: "Ada", isAdmin: false }, hasCharacter: true });
const inbox = JSON.stringify({ notifications: [{ _id: NOTE, title: "Turn processed", message: "Done", read: false }], unreadCount: 1, total: 1, hasMore: false });

interface Script {
  fetch?: Record<string, Array<string | { reject: string }>>;
}

function fakeHost(script: Script, beginSignIn?: MpBridgeHost["beginSignIn"]): { host: MpBridgeHost; beginSpy: ReturnType<typeof vi.fn> } {
  const queues = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(script.fetch ?? {})) queues.set(`fetch:${op}`, [...items]);
  const beginSpy = vi.fn(beginSignIn ?? (async () => {}));
  return {
    beginSpy,
    host: {
      fetch: async (op: string) => {
        const item = queues.get(`fetch:${op}`)?.shift();
        if (typeof item === "string") return item;
        if (item) throw new Error(item.reject);
        throw new Error(`unexpected fetch ${op}`);
      },
      mutate: async () => {
        throw new Error("unexpected mutate");
      },
      beginSignIn: beginSpy,
    },
  };
}

function readyFetches(): Record<string, Array<string | { reject: string }>> {
  return {
    "auth-session": [probe],
    "character-me": [me],
    "turn-status": [turn],
    "client-nav": [caps],
    notifications: [inbox],
  };
}

describe("MpModeSession persistent account lifecycle", () => {
  it("completed provider callback restores the session without relinking", async () => {
    // The bounce opens but the callback has not landed yet: first probe 401.
    const { host, beginSpy } = fakeHost({
      fetch: {
        ...readyFetches(),
        "auth-session": [{ reject: 'remote-error:401:0:{"active":false}' }, probe],
      },
    });
    const session = new MpModeSession(host);
    const pending = await session.signIn("discord");
    expect(pending.phase).toBe("signed-out");
    expect(beginSpy).toHaveBeenCalledTimes(1);
    expect(beginSpy).toHaveBeenCalledWith("discord");

    // The callback lands the platform cookie; the retry restores authoriative
    // state through the probe alone, with no second provider round trip.
    const restored = await session.refresh();
    expect(restored.phase).toBe("ready");
    expect(restored.username).toBe("Ada");
    expect(restored.character?.name).toBe("Ada");
    expect(beginSpy).toHaveBeenCalledTimes(1);
  });

  it("full process relaunch restores from the platform profile alone", async () => {
    // A fresh adapter holds no memory of the previous process: restore must
    // come from the cookie-backed bridge, never from a native credential.
    const { host, beginSpy } = fakeHost({ fetch: readyFetches() });
    const relaunched = new MpModeSession(host);
    const snapshot = await relaunched.enter();
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.username).toBe("Ada");
    expect(snapshot.character?.name).toBe("Ada");
    expect(beginSpy).not.toHaveBeenCalled();
  });

  it("logout or expiry evicts the recognized session on the next probe", async () => {
    const { host } = fakeHost({
      fetch: {
        ...readyFetches(),
        "auth-session": [probe, { reject: 'remote-error:401:0:{"active":false}' }],
      },
    });
    const session = new MpModeSession(host);
    const ready = await session.enter();
    expect(ready.phase).toBe("ready");

    // Server cleared the cookie (logout) or revoked/expired the token: the
    // next probe expires the mode and drops every authed projection.
    const expired = await session.refresh();
    expect(expired.phase).toBe("auth-expired");
    expect(expired.character).toBeNull();
    expect(expired.turn).toBeNull();
    expect(expired.capabilities).toBeNull();
    expect(expired.inbox).toBeNull();
    expect(expired.error).toMatch(/reconnect/i);
  });

  it("provider cancellation or link failure stays recoverable without throwing", async () => {
    const { host, beginSpy } = fakeHost({ fetch: readyFetches() }, async () => {
      throw new Error("main webview is unavailable");
    });
    const session = new MpModeSession(host);
    const failed = await session.signIn("google");
    expect(failed.phase).toBe("offline");
    expect(failed.error).toBeTruthy();
    expect(beginSpy).toHaveBeenCalledWith("google");

    // Retry stays available: a later attempt reloads authoritative state.
    const retryHost = fakeHost({ fetch: readyFetches() });
    const retrySession = new MpModeSession(retryHost.host);
    const recovered = await retrySession.enter();
    expect(recovered.phase).toBe("ready");
  });

  it("network failure mid-mode keeps the last loaded state with retry", async () => {
    const { host } = fakeHost({
      fetch: {
        ...readyFetches(),
        "auth-session": [probe, { reject: "session-transport" }],
      },
    });
    const session = new MpModeSession(host);
    const ready = await session.enter();
    expect(ready.phase).toBe("ready");

    const offline = await session.refresh();
    expect(offline.phase).toBe("offline");
    expect(offline.error).toMatch(/retry|connection/i);
    expect(offline.character?.name).toBe("Ada");
  });

  it("never persists session material in web storage", () => {
    for (const file of ["adapter.ts", "bridge.ts", "endpoints.ts", "validators.ts"]) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source).not.toContain("localStorage");
      expect(source).not.toContain("sessionStorage");
      expect(source).not.toMatch(/document\.cookie/i);
    }
  });
});
