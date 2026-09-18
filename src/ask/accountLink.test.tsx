/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

import { AskPanel } from "./AskPanel";
import { ASK_SESSION_CACHE_KEY, saveCachedAskSession } from "./session";

const USAGE = {
  used: 3, limit: 10, remaining: 7,
  mcpUsed: 0, mcpLimit: 2, mcpRemaining: 2, resetAt: Date.UTC(2026, 8, 12, 0, 0, 0),
};

function meOk(username: string | null = "marshall") {
  return {
    status: 200,
    body: JSON.stringify({
      usage: USAGE,
      entitlement: { allowed: true, label: "Player" },
      identity: { username },
    }),
  };
}

function routeInvoke(handlers: Record<string, unknown>, openAskWindow?: () => Promise<void>) {
  invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command === "ask_api") {
      const path = String(args?.path ?? "");
      if (path in handlers) return Promise.resolve(handlers[path]);
      if (path.startsWith("/api/conversation")) {
        return Promise.resolve({ status: 200, body: '{"turns":[]}' });
      }
      if (path === "/api/conversations") {
        return Promise.resolve({ status: 200, body: '{"conversations":[]}' });
      }
    }
    if (command === "open_ask_window") {
      return openAskWindow ? openAskWindow() : Promise.resolve(undefined);
    }
    if (command === "open_ask_link") return Promise.resolve(undefined);
    return Promise.reject(new Error(`unexpected invoke ${command}`));
  });
}

beforeEach(() => {
  invoke.mockReset();
  localStorage.clear();
});

/* Account-link action boundary (#149, #358): tapping the link action must
 * never crash or strand the panel, even when the native WebView
 * creation/navigation fails or the broker callback never lands a session.
 * Every failure ends on the signed-out panel with notice + retry. */

describe("AskPanel account-link action", () => {
  it("failed link navigation surfaces a recoverable notice and keeps retry", async () => {
    const user = userEvent.setup();
    routeInvoke(
      { "/api/me": { status: 401, body: '{"error":"no session"}' } },
      () => Promise.reject(new Error("main webview is unavailable")),
    );
    render(<AskPanel />);
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("main webview is unavailable")).toBeInTheDocument();
    // Still signed out, never a blank or crashed panel: both exits remain.
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("cancelled callback (bounce without a session) stays signed out with retry", async () => {
    const user = userEvent.setup();
    routeInvoke({ "/api/me": { status: 401, body: '{"error":"no session"}' } });
    render(<AskPanel />);
    // The native bounce ran (user cancelled or the callback failed) but no
    // session landed: the panel is back on the signed-out state, not stuck.
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("open_ask_window"));
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/could not open sign-in/i)).toBeNull();
  });

  it("restores the persistent session after the callback bounce", async () => {
    routeInvoke({ "/api/me": meOk("marshall") });
    render(<AskPanel />);
    expect(await screen.findByText("7 of 10 left", { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(JSON.parse(localStorage.getItem(ASK_SESSION_CACHE_KEY) ?? "{}").username).toBe("marshall");
  });

  it("recognizes an already-linked session without opening the bounce", async () => {
    // Physical-iPhone loop (#358): the panel showed signed-out while a live
    // session already sat in the shared jar, and every Sign in tap paid a
    // full main-webview bounce. The link action must fast-path a linked
    // session: no bounce invoke, straight to the ready panel.
    const user = userEvent.setup();
    routeInvoke({ "/api/me": { status: 401, body: '{"error":"no session"}' } });
    render(<AskPanel />);
    await screen.findByRole("button", { name: "Sign in" });

    // The game sign-in (or a completed bounce on a shared surface) lands the
    // session after the panel mounted signed-out.
    routeInvoke({ "/api/me": meOk("marshall") });
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("7 of 10 left", { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith("open_ask_window");
  });

  it("picks up the callback landing on the same mount after the bounce", async () => {
    // The bounce resolves (invoke ok) but the panel must not wait for a
    // webview reload or window-focus event to notice the landed session.
    const user = userEvent.setup();
    let linked = false;
    invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "ask_api") {
        const path = String(args?.path ?? "");
        if (path === "/api/me") {
          return Promise.resolve(linked ? meOk("marshall") : { status: 401, body: '{"error":"no session"}' });
        }
        return Promise.resolve({ status: 200, body: '{"conversations":[]}' });
      }
      if (command === "open_ask_window") {
        linked = true; // the broker callback lands the session mid-bounce
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error(`unexpected invoke ${command}`));
    });
    render(<AskPanel />);
    await screen.findByRole("button", { name: "Sign in" });

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("7 of 10 left", { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });

  it("opens a single bounce for concurrent taps", async () => {
    // Two taps before the first bounce resolves must not spawn parallel
    // bounces (parallel mobile watchers race over the single webview).
    const user = userEvent.setup();
    let opens = 0;
    invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "ask_api") {
        return Promise.resolve({ status: 401, body: '{"error":"no session"}' });
      }
      if (command === "open_ask_window") {
        opens += 1;
        return new Promise(() => {}); // bounce still in flight
      }
      return Promise.reject(new Error(`unexpected invoke ${command}`));
    });
    render(<AskPanel />);
    await screen.findByRole("button", { name: "Sign in" });

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const retry = screen.getByRole("button", { name: /retry/i });
    await user.click(retry).catch(() => {});
    await user.click(screen.getByRole("button", { name: "Sign in" })).catch(() => {});
    expect(opens).toBe(1);
  });

  it("expiry on the background refresh signs out and evicts the cache", async () => {
    saveCachedAskSession({ username: "marshall", usage: USAGE, tier: "Player" });
    routeInvoke({ "/api/me": meOk("marshall") });
    render(<AskPanel />);
    expect(await screen.findByText("7 of 10 left", { exact: false })).toBeInTheDocument();

    // The account is revoked elsewhere; the next background refresh learns
    // it and the panel returns to signed-out with no stale identity left.
    routeInvoke({ "/api/me": { status: 401, body: '{"error":"no session"}' } });
    const base = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(base + 61_000);
    try {
      window.dispatchEvent(new Event("focus"));
      expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
      expect(localStorage.getItem(ASK_SESSION_CACHE_KEY)).toBeNull();
    } finally {
      nowSpy.mockRestore();
    }
  });
});
