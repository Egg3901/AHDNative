import { describe, expect, it, vi } from "vitest";
import { MpModeSession } from "./adapter";
import type { MpBridgeHost } from "./bridge";

const USER = "507f1f77bcf86cd799439011";
const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const me = JSON.stringify({
  character: { _id: "c1", name: "Ada", party: "Labor", homeState: "CA", cashOnHand: 1000, actions: 3, countryId: "US" },
  corporation: null,
});
const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null });
const caps = JSON.stringify({ user: { id: USER, username: "Ada", isAdmin: false }, hasCharacter: true });
const inbox = JSON.stringify({ notifications: [], unreadCount: 0, total: 0, hasMore: false });

function hostWith(beginSignIn: MpBridgeHost["beginSignIn"], probeBody: string | { reject: string }): MpBridgeHost {
  return {
    fetch: vi.fn(async (op: string) => {
      if (op === "auth-session") {
        if (typeof probeBody === "string") return probeBody;
        throw new Error(probeBody.reject);
      }
      if (op === "character-me") return me;
      if (op === "turn-status") return turn;
      if (op === "client-nav") return caps;
      if (op === "notifications") return inbox;
      throw new Error(`unexpected fetch ${op}`);
    }),
    mutate: vi.fn(async () => {
      throw new Error("unexpected mutate");
    }),
    beginSignIn,
  };
}

/* Multiplayer account-link action boundary (#149, #362): starting the
 * provider round trip must never throw or strand the screen, even when
 * native WebView creation/navigation fails or the callback never lands a
 * session. Every failure ends in a recoverable phase with retry. */

describe("MpModeSession signIn link action", () => {
  it("failed link navigation reports offline without throwing", async () => {
    const host = hostWith(async () => {
      throw new Error("main webview is unavailable");
    }, probe);
    const snapshot = await new MpModeSession(host).signIn("discord");
    expect(snapshot.phase).toBe("offline");
    expect(snapshot.error).toMatch(/could not be started/i);
  });

  it("opens a single bounce for concurrent link calls", async () => {
    // Two link calls before the first bounce resolves join one round trip
    // instead of racing parallel bounces over the single webview.
    let releaseBounce!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseBounce = resolve;
    });
    const begin = vi.fn(async () => {
      await gate;
    });
    const host = hostWith(begin, { reject: "remote-error:401:0:Authentication required" });
    const session = new MpModeSession(host);
    const first = session.signIn("discord");
    const second = session.signIn("google");
    releaseBounce();
    const [firstSnap, secondSnap] = await Promise.all([first, second]);
    expect(begin).toHaveBeenCalledTimes(1);
    expect(firstSnap.phase).toBe("signed-out");
    expect(secondSnap.phase).toBe("signed-out");
  });

  it("link with no session window lands session-required with retry", async () => {
    // Cold boot with no live-site session to bridge through: the bounce
    // opens, the load finds no session, and the screen offers the sign-in
    // path again instead of an unreachable-device claim.
    const begin = vi.fn(async () => {});
    const host = hostWith(begin, { reject: "session-unavailable" });
    const snapshot = await new MpModeSession(host).signIn("google");
    expect(begin).toHaveBeenCalledWith("google");
    expect(snapshot.phase).toBe("session-required");
    expect(snapshot.character).toBeNull();
  });

  it("cancelled callback (bounce without a session) lands signed-out", async () => {
    const host = hostWith(async () => {}, {
      reject: "remote-error:401:0:Authentication required",
    });
    const begin = vi.fn(async () => {});
    const retryHost: MpBridgeHost = { ...host, beginSignIn: begin };
    const snapshot = await new MpModeSession(retryHost).signIn("google");
    expect(snapshot.phase).toBe("signed-out");
    expect(begin).toHaveBeenCalledWith("google");
    // Retry stays available: a later attempt reloads authoritative state.
    expect(snapshot.character).toBeNull();
  });

  it("completed callback restores the persistent session", async () => {
    const begin = vi.fn(async () => {});
    const host = hostWith(begin, probe);
    const snapshot = await new MpModeSession(host).signIn("discord");
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.username).toBe("Ada");
    expect(snapshot.character?.name).toBe("Ada");
    expect(begin).toHaveBeenCalledWith("discord");
  });
});
