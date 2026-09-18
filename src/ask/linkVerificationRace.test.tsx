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

function meSignedOut() {
  return { status: 401, body: '{"error":"no session"}' };
}

function convsEmpty() {
  return { status: 200, body: '{"conversations":[]}' };
}

beforeEach(() => {
  invoke.mockReset();
  localStorage.clear();
});

/* Link-verification ownership (#149): while the Sign in action owns
 * verification (its provider bounce is in flight), no other trigger may
 * race it. A concurrent retry or window-focus probe could land a stale
 * verdict last and strand a just-linked session on the signed-out panel
 * (or a stale failure over a linked one). The link's own post-bounce
 * probe is the single owner until it settles: retry waits, focus yields. */

describe("AskPanel link-verification ownership", () => {
  it("retry waits while the bounce is in flight and returns after failure", async () => {
    const user = userEvent.setup();
    let rejectBounce!: (error: unknown) => void;
    const bounce = new Promise<void>((_, reject) => {
      rejectBounce = reject;
    });
    // Avoid an unhandled rejection on the shared deferred before the
    // failure path attaches.
    bounce.catch(() => {});
    invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "ask_api") {
        const path = String(args?.path ?? "");
        if (path === "/api/me") return Promise.resolve(meSignedOut());
        return Promise.resolve(convsEmpty());
      }
      if (command === "open_ask_window") return bounce;
      if (command === "open_ask_link") return Promise.resolve(undefined);
      return Promise.reject(new Error(`unexpected invoke ${command}`));
    });
    render(<AskPanel />);
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("open_ask_window"));

    // The bounce owns verification now: firing retry here would race the
    // link's own post-bounce probe.
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /retry/i })).toBeDisabled();

    rejectBounce(new Error("the bounce failed"));
    expect(await screen.findByText("the bounce failed")).toBeInTheDocument();
    // Failure releases ownership: both exits are back.
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /retry/i })).toBeEnabled();
  });

  it("window focus during the bounce issues no rival probe", async () => {
    const user = userEvent.setup();
    let linked = false;
    let resolveBounce!: () => void;
    const bounce = new Promise<void>((resolve) => {
      resolveBounce = resolve;
    });
    let resolveStale!: (value: unknown) => void;
    const staleVerdict = new Promise((resolve) => {
      resolveStale = resolve;
    });
    let focusMeCalls = 0;
    let meMode: "signed-out" | "rival-slot" | "live" = "signed-out";
    invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "ask_api") {
        const path = String(args?.path ?? "");
        if (path === "/api/me") {
          if (meMode === "rival-slot") {
            // A focus probe racing the in-flight link would park here; its
            // stale 401 would then be free to land after the link succeeds.
            focusMeCalls += 1;
            return staleVerdict;
          }
          return Promise.resolve(meMode === "live" && linked ? meOk("marshall") : meSignedOut());
        }
        return Promise.resolve(convsEmpty());
      }
      if (command === "open_ask_window") return bounce;
      if (command === "open_ask_link") return Promise.resolve(undefined);
      return Promise.reject(new Error(`unexpected invoke ${command}`));
    });
    render(<AskPanel />);
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("open_ask_window"));

    // Focus lands while the bounce is still in flight (desktop bounce
    // window open, panel behind it). It must not start a rival probe.
    meMode = "rival-slot";
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument());
    expect(focusMeCalls).toBe(0);

    // The callback lands the session; only the link's own post-bounce
    // probe may verify it.
    meMode = "live";
    linked = true;
    resolveBounce();
    expect(await screen.findByText("7 of 10 left", { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();

    // Even if a stale verdict arrives now, nothing is listening for it:
    // the linked panel stands.
    resolveStale(meSignedOut());
    await Promise.resolve();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });
});
