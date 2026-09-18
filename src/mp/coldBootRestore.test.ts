import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MpModeSession } from "./adapter";
import type { MpBridgeHost } from "./bridge";

/* Desktop cold-boot relaunch (#149): after a full process relaunch the
 * persistent `online` window is gone, but the platform profile jar may still
 * hold a valid durable server session. The bridge must lazily provide a
 * hidden persistent first-party window and let the auth-session probe decide:
 * valid cookie restores silently (zero provider round trips), expired or
 * revoked answers 401 (explicit provider trip is correct), and transport
 * failure stays offline with retry. No tokens are stored, no new IPC exists,
 * and the SP engine is never touched.
 *
 * Reference: AHDGame `src/app/api/auth/session/route.ts` (401
 * `{active:false}` signed out, `{active:true, sub, username}` signed in) and
 * AHDClient `378126dc` (desktop opens a dedicated persistent online WebView;
 * AHDGame owns login and the cookie session).
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
const EXPIRED = { reject: 'remote-error:401:0:{"active":false}' };
const OFFLINE = { reject: "session-transport" };

type Item = string | { reject: string };

function fakeHost(queues: Record<string, Item[]>): { host: MpBridgeHost; beginSpy: ReturnType<typeof vi.fn>; ops: string[] } {
  const pending = new Map<string, Item[]>();
  for (const [op, items] of Object.entries(queues)) pending.set(`fetch:${op}`, [...items]);
  const beginSpy = vi.fn(async () => {});
  const ops: string[] = [];
  return {
    beginSpy,
    ops,
    host: {
      fetch: async (op: string) => {
        ops.push(op);
        const item = pending.get(`fetch:${op}`)?.shift();
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

function readyQueues(firstProbe: Item[]): Record<string, Item[]> {
  return {
    "auth-session": firstProbe,
    "character-me": [me],
    "turn-status": [turn],
    "client-nav": [caps],
    notifications: [inbox],
  };
}

describe("MpModeSession cold-boot restore", () => {
  it("valid durable session restores silently with zero provider round trips", async () => {
    const { host, beginSpy, ops } = fakeHost(readyQueues([probe]));
    const relaunched = new MpModeSession(host);
    const snapshot = await relaunched.enter();
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.username).toBe("Ada");
    expect(snapshot.character?.name).toBe("Ada");
    expect(beginSpy).not.toHaveBeenCalled();
    // Restore resolves through the probe alone: it runs first, before any
    // other read, and no token store exists anywhere in the path.
    expect(ops[0]).toBe("auth-session");
  });

  it("expired durable session stays signed out until an explicit provider trip", async () => {
    const { host, beginSpy } = fakeHost(readyQueues([EXPIRED]));
    const relaunched = new MpModeSession(host);
    const snapshot = await relaunched.enter();
    expect(snapshot.phase).toBe("signed-out");
    expect(snapshot.character).toBeNull();
    expect(beginSpy).not.toHaveBeenCalled();
  });

  it("revoked session mid-mode expires with every authed projection dropped", async () => {
    const { host } = fakeHost({
      ...readyQueues([probe, EXPIRED]),
      "character-me": [me],
      "turn-status": [turn],
      "client-nav": [caps],
      notifications: [inbox],
    });
    const session = new MpModeSession(host);
    expect((await session.enter()).phase).toBe("ready");
    const expired = await session.refresh();
    expect(expired.phase).toBe("auth-expired");
    expect(expired.character).toBeNull();
    expect(expired.turn).toBeNull();
    expect(expired.capabilities).toBeNull();
    expect(expired.inbox).toBeNull();
    expect(expired.error).toMatch(/reconnect/i);
  });

  it("rate-limited cold boot reports retry with the server backoff, never offline", async () => {
    // The durable session may be valid while the probe itself is throttled
    // (shared egress, retry storm): the bridge forwards
    // `remote-error:429:{retry_after}:{body}`, so restore must surface the
    // rate-limited phase with the server backoff instead of misreporting
    // the device as unreachable. No provider round trip either way.
    const { host, beginSpy } = fakeHost({
      ...readyQueues([{ reject: 'remote-error:429:45:{"error":"too quick"}' }]),
    });
    const relaunched = new MpModeSession(host);
    const limited = await relaunched.enter();
    expect(limited.phase).toBe("rate-limited");
    expect(limited.retryAfter).toBe(45);
    expect(limited.error).toMatch(/too quick/i);
    expect(beginSpy).not.toHaveBeenCalled();
  });

  it("rate limit mid-mode keeps loaded state with the server backoff", async () => {
    const { host, beginSpy } = fakeHost({
      ...readyQueues([probe, { reject: 'remote-error:429:45:{"error":"too quick"}' }]),
      "character-me": [me],
      "turn-status": [turn],
      "client-nav": [caps],
      notifications: [inbox],
    });
    const session = new MpModeSession(host);
    expect((await session.enter()).phase).toBe("ready");
    const limited = await session.refresh();
    expect(limited.phase).toBe("rate-limited");
    expect(limited.retryAfter).toBe(45);
    expect(limited.error).toMatch(/too quick/i);
    expect(limited.character?.name).toBe("Ada");
    expect(beginSpy).not.toHaveBeenCalled();
  });

  it("offline cold boot keeps retry without spending a provider trip", async () => {
    const { host, beginSpy } = fakeHost({
      ...readyQueues([OFFLINE, probe]),
      "character-me": [me],
      "turn-status": [turn],
      "client-nav": [caps],
      notifications: [inbox],
    });
    const relaunched = new MpModeSession(host);
    const offline = await relaunched.enter();
    expect(offline.phase).toBe("offline");
    expect(offline.error).toMatch(/retry|connection/i);
    expect(beginSpy).not.toHaveBeenCalled();
    // Retry restores through the probe alone once the network is back.
    const restored = await relaunched.refresh();
    expect(restored.phase).toBe("ready");
    expect(restored.username).toBe("Ada");
    expect(beginSpy).not.toHaveBeenCalled();
  });
});

describe("cold-boot restore bridge contract", () => {
  const bridge = readFileSync(new URL("../../src-tauri/src/mp_session.rs", import.meta.url), "utf8");

  it("provides the persistent online window lazily instead of failing closed", () => {
    // Pre-fix the missing-window arm returned `session-unavailable`
    // unconditionally, forcing a provider round trip on every desktop
    // cold boot even with a valid durable cookie in the platform jar.
    expect(bridge).toContain("ensure_online_window");
  });

  it("restore window stays hidden, persistent, and first-party only", () => {
    expect(bridge).toContain(".visible(false)");
    expect(bridge).not.toContain(".incognito(");
    expect(bridge).toContain("session_origin()");
  });

  it("adds no IPC surface for restore", () => {
    // The existing fetch/mutate commands are the whole surface; restore
    // rides inside them. PR #519 logout stays the only auth write.
    expect(bridge.match(/#\[tauri::command/g)?.length ?? 0).toBe(2);
  });

  it("stores no session material on the restore path", () => {
    // The only storage-shaped strings in the file are the existing negative
    // guards on the generated page script inside the tests module.
    const production = bridge.split("#[cfg(test)]")[0] ?? "";
    expect(production).not.toContain("localStorage");
    expect(production).not.toContain("sessionStorage");
    expect(production).not.toContain("document.cookie");
  });

  it("gates pre-existing windows on first-party commit before probing", () => {
    // A window left behind by a timed-out offline restore sits at
    // about:blank, and a mid-flight provider trip sits on an auxiliary
    // host. Evaluating the session script in either context would answer
    // 401 and misreport a valid durable session as signed out, so the
    // bounded wait must apply after the label check on every call, not
    // only inside the creation arm.
    const production = bridge.split("#[cfg(test)]")[0] ?? "";
    const labelCheck = production.indexOf("window.label() != MP_SESSION_WINDOW_LABEL");
    const gate = production.indexOf("wait_for_online_window(&window).await");
    expect(labelCheck).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(labelCheck);
  });

  it("recovers the winning window when concurrent restores race creation", () => {
    // Two first calls racing both see no window; the loser hits a
    // duplicate-label build error and must reuse the winner, never report
    // the session missing.
    const production = bridge.split("#[cfg(test)]")[0] ?? "";
    const lookups =
      production.match(/get_webview_window\(MP_SESSION_WINDOW_LABEL\)/g) ?? [];
    expect(lookups.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the restore path out of the SP engine", () => {
    for (const file of ["adapter.ts", "bridge.ts"]) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/from ["']\.\.\/game/);
      expect(source).not.toContain("localStorage");
      expect(source).not.toContain("sessionStorage");
    }
  });
});
