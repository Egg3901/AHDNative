/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const invoke = vi.fn();
let streamHandler: ((event: { reqId: string; kind: string; data: unknown }) => void) | null = null;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((...args: unknown[]) => {
    const callback = args[1] as (envelope: { payload: unknown }) => void;
    streamHandler = (event) => callback({ payload: event });
    return Promise.resolve(() => {});
  }),
}));

import { AskPanel } from "./AskPanel";
import { ASK_SESSION_CACHE_KEY, saveCachedAskSession } from "./session";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const USAGE = {
  used: 3, limit: 10, remaining: 7,
  mcpUsed: 0, mcpLimit: 2, mcpRemaining: 2, resetAt: Date.UTC(2026, 8, 12, 0, 0, 0),
};

function meBody() {
  return JSON.stringify({ usage: USAGE, entitlement: { allowed: true, label: "Player" } });
}

function routeInvoke(handlers: Record<string, unknown>) {
  invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command === "ask_api") {
      const path = String(args?.path ?? "");
      if (path in handlers) return Promise.resolve(handlers[path]);
      if (path.startsWith("/api/conversation")) {
        return Promise.resolve(handlers["/api/conversation"] ?? { status: 200, body: "{\"turns\":[]}" });
      }
    }
    if (command === "ask_send") return Promise.resolve("req-1");
    if (command === "ask_stop") return Promise.resolve(undefined);
    if (command === "open_ask_window") return Promise.resolve(undefined);
    if (command === "open_ask_link") return Promise.resolve(undefined);
    return Promise.reject(new Error(`unexpected invoke ${command}`));
  });
}

beforeEach(() => {
  invoke.mockReset();
  streamHandler = null;
  localStorage.clear();
});

describe("AskPanel signed-out state", () => {
  it("shows the zero-capability sign-in prompt when the session probe returns 401", async () => {
    routeInvoke({ "/api/me": { status: 401, body: "{\"error\":\"no session\"}" } });
    render(<AskPanel />);
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText(/already signed in/i)).toBeInTheDocument();
  });

  it("opens the native sign-in surface after the shell hook, and retries on demand", async () => {
    const user = userEvent.setup();
    const before = vi.fn();
    routeInvoke({ "/api/me": { status: 401, body: "" } });
    render(<AskPanel onBeforeSignIn={before} />);
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(before).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith("open_ask_window");
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(invoke).toHaveBeenCalledWith("ask_api", { method: "GET", path: "/api/me", body: null });
  });

  it("stays usable offline: transport failure shows a notice, never raw session material", async () => {
    routeInvoke({});
    invoke.mockImplementation((command: string) => {
      if (command === "ask_api") return Promise.reject(new Error("boom"));
      return Promise.reject(new Error(`unexpected invoke ${command}`));
    });
    render(<AskPanel />);
    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask" })).toBeInTheDocument();
    const keys = Object.keys(localStorage);
    expect(keys.every((key) => key.startsWith("ahdnative.ask."))).toBe(true);
    expect(JSON.stringify(keys)).not.toContain("ask_session");
  });
});

describe("AskPanel restore and quota", () => {
  it("restores the stored conversation and shows the quota pill", async () => {
    localStorage.setItem("ahdnative.ask.conv", "conv-7");
    routeInvoke({
      "/api/me": { status: 200, body: meBody() },
      "/api/conversations": {
        status: 200,
        body: JSON.stringify({ conversations: [{ id: "conv-7", title: "Taxes" }], usage: USAGE }),
      },
      "/api/conversation": {
        status: 200,
        body: JSON.stringify({ turns: [{ question: "What is tax?", answer: "Tax is levy." }] }),
      },
    });
    render(<AskPanel />);
    expect(await screen.findByText("What is tax?")).toBeInTheDocument();
    expect(screen.getByText("Tax is levy.")).toBeInTheDocument();
    expect(screen.getByText("7 of 10 left")).toBeInTheDocument();
  });

  it("drops a stored conversation id that no longer exists", async () => {
    localStorage.setItem("ahdnative.ask.conv", "gone");
    routeInvoke({
      "/api/me": { status: 200, body: meBody() },
      "/api/conversations": { status: 200, body: "{\"conversations\":[]}" },
    });
    render(<AskPanel />);
    expect(await screen.findByPlaceholderText(/ask a question/i)).toBeInTheDocument();
    expect(screen.queryByText("What is tax?")).toBeNull();
  });
});

describe("AskPanel questions and stop", () => {
  async function readyPanel() {
    const user = userEvent.setup();
    routeInvoke({
      "/api/me": { status: 200, body: meBody() },
      "/api/conversations": { status: 200, body: "{\"conversations\":[]}" },
    });
    render(<AskPanel />);
    await screen.findByPlaceholderText(/ask a question/i);
    return user;
  }

  it("streams deltas into the answer and finishes on done with citations and followups", async () => {
    const user = await readyPanel();
    await user.type(screen.getByPlaceholderText(/ask a question/i), "How do unions work here?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByRole("button", { name: "Stop" })).toBeInTheDocument();
    streamHandler?.({ reqId: "req-1", kind: "delta", data: "Unions organize" });
    expect(await screen.findByText("Unions organize")).toBeInTheDocument();
    streamHandler?.({
      reqId: "req-1",
      kind: "done",
      data: {
        answer: "Unions organize labor.",
        citations: [{ label: "Labor rules", url: "https://example.com/labor" }],
        followups: ["What about strikes?"],
        usage: { ...USAGE, remaining: 6 },
      },
    });
    expect(await screen.findByText("Unions organize labor.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What about strikes?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Labor rules" })).toBeInTheDocument();
    // The done payload carries remaining: 6; the post-answer quota refresh
    // may already have restored the probed 7, so accept either live value.
    expect(screen.getByText(/[67] of 10 left/)).toBeInTheDocument();
  });

  it("stops without recording an answer", async () => {
    const user = await readyPanel();
    await user.type(screen.getByPlaceholderText(/ask a question/i), "How do unions work here?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByRole("button", { name: "Stop" });
    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(invoke).toHaveBeenCalledWith("ask_stop", { reqId: "req-1" });
    streamHandler?.({ reqId: "req-1", kind: "stopped", data: null });
    expect(await screen.findByText("stopped")).toBeInTheDocument();
  });

  it("routes citation taps through the allowlisted opener instead of navigating", async () => {
    const user = await readyPanel();
    streamHandler; // listener armed during ready
    // Seed a finished answer directly through the stream.
    await user.type(screen.getByPlaceholderText(/ask a question/i), "How do unions work here?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByRole("button", { name: "Stop" });
    streamHandler?.({
      reqId: "req-1",
      kind: "done",
      data: { answer: "See sources.", citations: [{ label: "Labor rules", url: "https://example.com/labor" }] },
    });
    const link = await screen.findByRole("link", { name: "Labor rules" });
    await user.click(link);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("open_ask_link", { url: "https://example.com/labor" }),
    );
  });

describe("AskPanel instant startup", () => {
  function gateMe(gate: Promise<unknown>) {
    invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "ask_api") {
        if (args?.path === "/api/me") return gate;
        return Promise.resolve({ status: 200, body: '{"conversations":[]}' });
      }
      if (command === "ask_send") return Promise.resolve("req-1");
      if (command === "ask_stop") return Promise.resolve(undefined);
      if (command === "open_ask_window") return Promise.resolve(undefined);
      if (command === "open_ask_link") return Promise.resolve(undefined);
      return Promise.reject(new Error(`unexpected invoke ${command}`));
    });
  }

  it("paints the usable shell immediately from cache while /api/me is still pending", async () => {
    saveCachedAskSession({ username: "marshall", usage: USAGE, tier: "Player" });
    const gate = deferred<unknown>();
    gateMe(gate.promise);
    render(<AskPanel />);

    // Shell is usable before the authoritative refresh answers.
    expect(screen.getByText("7 of 10 left", { exact: false })).toBeInTheDocument();
    expect((screen.getByLabelText("Ask a question") as HTMLTextAreaElement).disabled).toBe(false);
    expect(screen.queryByText("Opening your questions…")).toBeNull();

    gate.resolve({
      status: 200,
      body: JSON.stringify({ usage: { ...USAGE, used: 4, remaining: 6 }, entitlement: { allowed: true, label: "Player" }, identity: { username: "marshall" } }),
    });
    expect(await screen.findByText("6 of 10 left", { exact: false })).toBeInTheDocument();
  });

  it("shows an explicit checking shell instead of a blocked panel on first launch", async () => {
    const gate = deferred<unknown>();
    gateMe(gate.promise);
    render(<AskPanel />);

    expect(screen.queryByText("Opening your questions…")).toBeNull();
    expect(screen.getByText("Checking access…")).toBeInTheDocument();
    expect(screen.getByLabelText("Ask a question")).toBeInTheDocument();
    expect((screen.getByLabelText("Ask a question") as HTMLTextAreaElement).disabled).toBe(true);

    gate.resolve({ status: 200, body: meBody() });
    await waitFor(() =>
      expect((screen.getByLabelText("Ask a question") as HTMLTextAreaElement).disabled).toBe(false),
    );
    expect(screen.getByText("7 of 10 left", { exact: false })).toBeInTheDocument();
  });

  it("signs out and clears cached quota on 401", async () => {
    saveCachedAskSession({ username: "marshall", usage: USAGE, tier: "Player" });
    routeInvoke({ "/api/me": { status: 401, body: "{\"error\":\"no session\"}" } });
    render(<AskPanel />);

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(localStorage.getItem(ASK_SESSION_CACHE_KEY)).toBeNull();
  });

  it("replaces cached quota when the account changes", async () => {
    saveCachedAskSession({ username: "marshall", usage: USAGE, tier: "Player" });
    const other = { ...USAGE, used: 9, remaining: 1 };
    routeInvoke({
      "/api/me": {
        status: 200,
        body: JSON.stringify({ usage: other, entitlement: { allowed: true, label: "Player" }, identity: { username: "delegate" } }),
      },
      "/api/conversations": { status: 200, body: "{\"conversations\":[]}" },
    });
    render(<AskPanel />);

    expect(await screen.findByText("1 of 10 left", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("7 of 10 left", { exact: false })).toBeNull();
    expect(JSON.parse(localStorage.getItem(ASK_SESSION_CACHE_KEY) ?? "{}").username).toBe("delegate");
  });

  it("drops the previous account's open thread when the account changes", async () => {
    saveCachedAskSession({ username: "marshall", usage: USAGE, tier: "Player" });
    localStorage.setItem("ahdnative.ask.conv", "conv-7");
    const marshallMe = JSON.stringify({
      usage: USAGE,
      entitlement: { allowed: true, label: "Player" },
      identity: { username: "marshall" },
    });
    routeInvoke({
      "/api/me": { status: 200, body: marshallMe },
      "/api/conversations": {
        status: 200,
        body: JSON.stringify({ conversations: [{ id: "conv-7", title: "Harvest" }], usage: USAGE }),
      },
      "/api/conversation": {
        status: 200,
        body: JSON.stringify({ turns: [{ question: "Why did the harvest fail?", answer: "Blight." }] }),
      },
    });

    const base = Date.now();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(base);
    try {
      render(<AskPanel />);
      expect(await screen.findByText("Why did the harvest fail?")).toBeInTheDocument();

      // A background refresh past the focus throttle learns the new account.
      const other = { ...USAGE, used: 9, remaining: 1 };
      routeInvoke({
        "/api/me": {
          status: 200,
          body: JSON.stringify({ usage: other, entitlement: { allowed: true, label: "Player" }, identity: { username: "delegate" } }),
        },
        "/api/conversations": { status: 200, body: "{\"conversations\":[]}" },
      });
      nowSpy.mockReturnValue(base + 61_000);
      window.dispatchEvent(new Event("focus"));

      expect(await screen.findByText("1 of 10 left", { exact: false })).toBeInTheDocument();
      expect(screen.queryByText("Why did the harvest fail?")).toBeNull();
      expect(localStorage.getItem("ahdnative.ask.conv")).toBeNull();
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe("AskPanel live quota updates", () => {
  async function readyPanelWithGatedRefresh(refreshGate: Promise<unknown>) {
    const user = userEvent.setup();
    invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "ask_api") {
        if (args?.path === "/api/me") return refreshGate;
        return Promise.resolve({ status: 200, body: '{"conversations":[]}' });
      }
      if (command === "ask_send") return Promise.resolve("req-1");
      if (command === "ask_stop") return Promise.resolve(undefined);
      return Promise.reject(new Error(`unexpected invoke ${command}`));
    });
    render(<AskPanel />);
    await screen.findByText("7 of 10 left", { exact: false });
    return user;
  }

  it("updates quota from the answer event before the refresh confirms it", async () => {
    saveCachedAskSession({ username: "marshall", usage: USAGE, tier: "Player" });
    const refresh = deferred<unknown>();
    const user = await readyPanelWithGatedRefresh(refresh.promise);
    await user.type(screen.getByLabelText("Ask a question"), "Why did the harvest fail?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByRole("button", { name: "Stop" });
    streamHandler?.({
      reqId: "req-1",
      kind: "done",
      data: { answer: "Blight.", usage: { ...USAGE, used: 4, remaining: 6 } },
    });
    expect(await screen.findByText("6 of 10 left", { exact: false })).toBeInTheDocument();
    refresh.resolve({ status: 200, body: meBody() });
  });

  it("updates quota on a 429 answer refusal", async () => {
    saveCachedAskSession({ username: "marshall", usage: USAGE, tier: "Player" });
    const refresh = deferred<unknown>();
    const user = await readyPanelWithGatedRefresh(refresh.promise);
    await user.type(screen.getByLabelText("Ask a question"), "One more question?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByRole("button", { name: "Stop" });
    const spent = { ...USAGE, used: 10, remaining: 0 };
    streamHandler?.({
      reqId: "req-1",
      kind: "final",
      data: { status: 429, body: JSON.stringify({ error: "No questions left", usage: spent }) },
    });
    expect(await screen.findByText("0 of 10 left", { exact: false })).toBeInTheDocument();
    refresh.resolve({
      status: 200,
      body: JSON.stringify({ usage: spent, entitlement: { allowed: true, label: "Player" }, identity: { username: "marshall" } }),
    });
  });
});

describe("AskPanel 429 stream refusal", () => {
  it("surfaces 429 quota refusals with the service message", async () => {
    const user = await readyPanel();
    invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "ask_api" && args?.path === "/api/me") {
        return Promise.resolve({ status: 200, body: meBody() });
      }
      if (command === "ask_send") return Promise.resolve("req-9");
      return Promise.resolve(undefined);
    });
    await user.type(screen.getByPlaceholderText(/ask a question/i), "How do unions work here?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByRole("button", { name: "Stop" });
    streamHandler?.({
      reqId: "req-9",
      kind: "final",
      data: { status: 429, body: "{\"error\":\"No questions left\"}" },
    });
    const thread = screen.getByText("How do unions work here?").closest(".av-turn")?.parentElement;
    expect(thread).toBeTruthy();
    expect(await within(thread as HTMLElement).findByText("No questions left")).toBeInTheDocument();
  });
});

describe("AskPanel single verification round", () => {
  it("requests access and history together instead of sequential entitlement checks", async () => {
    const meGate = deferred<unknown>();
    const convGate = deferred<unknown>();
    invoke.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === "ask_api") {
        if (args?.path === "/api/me") return meGate.promise;
        if (args?.path === "/api/conversations") return convGate.promise;
        if (String(args?.path ?? "").startsWith("/api/conversation")) {
          return Promise.resolve({ status: 200, body: '{"turns":[]}' });
        }
      }
      if (command === "ask_send") return Promise.resolve("req-1");
      if (command === "ask_stop") return Promise.resolve(undefined);
      if (command === "open_ask_window") return Promise.resolve(undefined);
      if (command === "open_ask_link") return Promise.resolve(undefined);
      return Promise.reject(new Error(`unexpected invoke ${command}`));
    });
    render(<AskPanel />);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("ask_api", { method: "GET", path: "/api/me", body: null }),
    );
    // History must already be in flight while the access check is pending.
    expect(invoke).toHaveBeenCalledWith("ask_api", { method: "GET", path: "/api/conversations", body: null });
    meGate.resolve({ status: 200, body: meBody() });
    convGate.resolve({ status: 200, body: JSON.stringify({ conversations: [], usage: USAGE }) });
    expect(await screen.findByText("7 of 10 left", { exact: false })).toBeInTheDocument();
  });

  it("does not re-verify the allowance on every window focus", async () => {
    routeInvoke({
      "/api/me": { status: 200, body: meBody() },
      "/api/conversations": { status: 200, body: '{"conversations":[]}' },
    });
    render(<AskPanel />);
    expect(await screen.findByText("7 of 10 left", { exact: false })).toBeInTheDocument();
    const meCalls = () =>
      invoke.mock.calls.filter(
        (call) => call[0] === "ask_api" && (call[1] as Record<string, unknown>)?.path === "/api/me",
      ).length;
    const before = meCalls();
    window.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(meCalls()).toBe(before);
  });
});
});
