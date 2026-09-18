import { describe, expect, it, vi } from "vitest";
import { MpModeSession } from "./adapter";
import type { MpBridgeHost } from "./bridge";

/* Unlink under server pressure (#149, #363): the confirmed-unlink, failed-
 * unlink (transport), already-dead-session (401), and missing-session paths
 * are covered in signOut.test.ts, but the journey step where the player taps
 * Sign out while the server throttles (429), errors (5xx), or answers the
 * logout in an unexpected shape had no coverage. Each of those must keep
 * the linked session with an honest error and retry — never a half-cleared
 * screen that claims the account is unlinked while the server session lives
 * on, and never a silent success.
 *
 * Reference: AHDGame POST /api/auth/logout answers 200 `{ok:true}`; the
 * bridge forwards `remote-error:{status}:{retry_after}:{body}` for refusals.
 */

const USER = "507f1f77bcf86cd799439011";
const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
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

function fakeHost(script: Script): { host: MpBridgeHost; mutateSpy: ReturnType<typeof vi.fn> } {
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
  return {
    mutateSpy,
    host: {
      fetch: async (op: string) => {
        const item = fetchQueues.get(`fetch:${op}`)?.shift();
        if (typeof item === "string") return item;
        if (item) throw new Error(item.reject);
        throw new Error(`unexpected fetch ${op}`);
      },
      mutate: mutateSpy,
      beginSignIn: async () => {},
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

describe("MpModeSession unlink under server pressure", () => {
  it("throttled unlink keeps the linked session with the server backoff, then retries clean", async () => {
    const { host, mutateSpy } = fakeHost({
      fetch: readyFetches(),
      mutate: { "auth-logout": [{ reject: 'remote-error:429:45:{"error":"too quick"}' }, logoutAck] },
    });
    const session = await readySession(host);

    const limited = await session.signOut();
    expect(mutateSpy).toHaveBeenCalledWith("auth-logout", {});
    expect(limited.phase).toBe("rate-limited");
    expect(limited.retryAfter).toBe(45);
    expect(limited.error).toMatch(/too quick/i);
    // Identity and every authed projection stand: the server session lives.
    expect(limited.userId).toBe(USER);
    expect(limited.username).toBe("Ada");
    expect(limited.character?.name).toBe("Ada");
    expect(limited.turn).not.toBeNull();
    expect(limited.inbox).not.toBeNull();
    expect(limited.notice).toBeNull();

    const retried = await session.signOut();
    expect(retried.phase).toBe("signed-out");
    expect(retried.userId).toBeNull();
    expect(retried.notice).toMatch(/signed out/i);
  });

  it("server-error unlink keeps the linked session with retry, then retries clean", async () => {
    const { host } = fakeHost({
      fetch: readyFetches(),
      mutate: { "auth-logout": [{ reject: 'remote-error:500:0:{"error":"Down for maintenance"}' }, logoutAck] },
    });
    const session = await readySession(host);

    const failed = await session.signOut();
    expect(failed.phase).toBe("server-error");
    expect(failed.error).toMatch(/maintenance/i);
    expect(failed.userId).toBe(USER);
    expect(failed.character?.name).toBe("Ada");
    expect(failed.turn).not.toBeNull();

    const retried = await session.signOut();
    expect(retried.phase).toBe("signed-out");
    expect(retried.userId).toBeNull();
  });

  it("malformed logout ack keeps the linked session with retry, then retries clean", async () => {
    const { host } = fakeHost({
      fetch: readyFetches(),
      mutate: { "auth-logout": [JSON.stringify({ ok: false }), logoutAck] },
    });
    const session = await readySession(host);

    const failed = await session.signOut();
    expect(failed.phase).toBe("server-error");
    expect(failed.error).toMatch(/unexpected shape/i);
    expect(failed.userId).toBe(USER);
    expect(failed.character?.name).toBe("Ada");

    const retried = await session.signOut();
    expect(retried.phase).toBe("signed-out");
    expect(retried.userId).toBeNull();
  });
});
