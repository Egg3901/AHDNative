/**
 * Rendered contract for the Native multiplayer mode screen (#359).
 *
 * Covers navigation/state at 320px, 390px, and desktop widths, supported
 * screens, action success/refusal/rate-limit flows with post-mutation
 * refresh, and the absent-not-inert rule for unsupported actions.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MpModeScreen } from "./MpModeScreen";
import { NAV_ICON_PATHS } from "./NavIcon";
import type { MpBridgeHost } from "../mp/bridge";

const USER = "507f1f77bcf86cd799439011";
const NOTE = "607f1f77bcf86cd799439011";

const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const me = (cash: number) =>
  JSON.stringify({
    character: { _id: "c1", name: "Ada", party: "Labor", homeState: "CA", cashOnHand: cash, actions: 3, countryId: "US" },
    corporation: null,
  });
const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null });
const inbox = (unread: number) =>
  JSON.stringify({
    notifications: [{ _id: NOTE, title: "Turn processed", message: "Done", read: false }],
    unreadCount: unread,
    total: 1,
    hasMore: false,
  });

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

interface Script {
  fetch?: Record<string, Array<string | { reject: string }>>;
  mutate?: Record<string, Array<string | { reject: string }>>;
}

function fakeHost(script: Script): { host: MpBridgeHost; calls: string[] } {
  const calls: string[] = [];
  const queues = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(script.fetch ?? {})) queues.set(`fetch:${op}`, [...items]);
  for (const [op, items] of Object.entries(script.mutate ?? {})) queues.set(`mutate:${op}`, [...items]);
  const next = (key: string): string => {
    const item = queues.get(key)?.shift();
    if (typeof item === "string") return item;
    if (item) throw new Error(item.reject);
    throw new Error(`unexpected call ${key}`);
  };
  return {
    calls,
    host: {
      fetch: async (op: string) => {
        calls.push(`fetch:${op}`);
        return next(`fetch:${op}`);
      },
      mutate: async (op: string, payload: unknown) => {
        calls.push(`mutate:${op}:${JSON.stringify(payload)}`);
        return next(`mutate:${op}`);
      },
      beginSignIn: async (provider) => {
        calls.push(`sign-in:${provider}`);
      },
    },
  };
}

function readyScript(): Script {
  return { fetch: { "auth-session": [probe], "character-me": [me(1000)], "turn-status": [turn], notifications: [inbox(1)] } };
}

describe("MpModeScreen at 320px", () => {
  it("renders navigation, status, actions, and inbox without fixed-width overflow traps", async () => {
    setViewport(320);
    render(<MpModeScreen host={fakeHost(readyScript()).host} onExit={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Turn 12 · 1862/ })).toBeInTheDocument();
    expect(screen.getByText("1000")).toBeInTheDocument();

    const actions = screen.getByRole("region", { name: "Player actions" });
    const buttons = within(actions).getAllByRole("button");
    // Exactly the nine audited server actions: nothing more is offered.
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Fundraise",
      "Campaign",
      "Run Advertisements",
      "Build Donor Network",
      "Quick Poll",
      "Full Demographic Poll",
      "Personal Campaign Donation",
      "Rest",
      "Debate Prep",
    ]);
    expect(within(actions).getByPlaceholderText("e.g. CA")).toBeInTheDocument();

    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exit multiplayer" })).toBeInTheDocument();
  });

  it("keeps unsupported mutations absent, not inert", async () => {
    setViewport(320);
    render(<MpModeScreen host={fakeHost(readyScript()).host} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });
    for (const absent of ["Advance turn", "Batch", "×5", "Legislature", "Travel", "Declare", "Snooze", "Delete"]) {
      expect(screen.queryByRole("button", { name: new RegExp(absent, "i") })).toBeNull();
    }
  });

  it("uses wrap-safe CSS so 320px/390px never clip controls", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    expect(css).toMatch(/\.ahd-mp-actions[^{]*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.ahd-mp-row[^{]*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.ahd-mp-input\s+input\s*\{[^}]*min-width:\s*0/);
    const mpRules = css.split("@media")[0] ?? "";
    for (const match of mpRules.match(/\.ahd-mp-[^{]*\{[^}]*\}/g) ?? []) {
      expect(match).not.toMatch(/width:\s*\d+px/);
    }
  });
});

describe("MpModeScreen at 390px", () => {
  it("offers native provider choices when no session exists, then loads", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const { host, calls } = fakeHost({
      fetch: {
        "auth-session": [{ reject: "session-unavailable" }, probe],
        "character-me": [me(1000)],
        "turn-status": [turn],
        notifications: [inbox(0)],
      },
    });
    render(<MpModeScreen host={host} onExit={() => {}} />);
    expect(await screen.findByRole("heading", { name: "Sign in to play multiplayer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue with Discord" }));
    expect(await screen.findByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(calls).toContain("sign-in:discord");
  });

  it("reports auth expiry with a reconnect path", async () => {
    setViewport(390);
    render(
      <MpModeScreen
        host={fakeHost({ fetch: { "auth-session": [probe], "character-me": [{ reject: "remote-error:401:0:x" }] } }).host}
        onExit={() => {}}
      />,
    );
    expect(await screen.findByRole("heading", { name: "Session expired" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("MpModeScreen on desktop", () => {
  it("runs an action, refreshes authoritative state, then reports the server message", async () => {
    setViewport(1280);
    const user = userEvent.setup();
    const { host, calls } = fakeHost({
      fetch: {
        "auth-session": [probe],
        "character-me": [me(1000), me(1250)],
        "turn-status": [turn, turn],
        notifications: [inbox(1), inbox(0)],
      },
      mutate: { "execute-action": [JSON.stringify({ success: true, message: "Raised 250 from donors!" })] },
    });
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });
    calls.length = 0;
    await user.click(screen.getByRole("button", { name: /Fundraise/ }));
    expect(await screen.findByText("Raised 250 from donors!")).toBeInTheDocument();
    expect(screen.getByText("1250")).toBeInTheDocument();
    // Mutation first, authoritative refresh after: the UI never claims early.
    expect(calls[0]).toMatch(/^mutate:execute-action:/);
    expect(calls.slice(1, 4)).toEqual(["fetch:character-me", "fetch:turn-status", "fetch:notifications"]);
  });

  it("surfaces server refusal with prior state intact", async () => {
    setViewport(1280);
    const user = userEvent.setup();
    const { host, calls } = fakeHost({
      fetch: { "auth-session": [probe], "character-me": [me(1000)], "turn-status": [turn], notifications: [inbox(1)] },
      mutate: { "execute-action": [{ reject: 'remote-error:403:0:{"error":"Automated access is not permitted for this endpoint."}' }] },
    });
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });
    await user.click(screen.getByRole("button", { name: /Rest/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Automated access is not permitted");
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(calls.filter((call) => call.startsWith("fetch:character-me"))).toHaveLength(1);
  });

  it("shows the retry delay on rate limits and keeps loaded state", async () => {
    setViewport(1280);
    const user = userEvent.setup();
    render(
      <MpModeScreen
        host={
          fakeHost({
            fetch: { "auth-session": [probe], "character-me": [me(1000)], "turn-status": [turn], notifications: [inbox(1)] },
            mutate: { "execute-action": [{ reject: 'remote-error:429:45:{"error":"too quick","code":"rate_limited"}' }] },
          }).host
        }
        onExit={() => {}}
      />,
    );
    await screen.findByRole("heading", { name: "Ada" });
    await user.click(screen.getByRole("button", { name: /Quick Poll/ }));
    expect(await screen.findByText(/Try again in about 45 seconds/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ada" })).toBeInTheDocument();
  });

  it("marks a notification read and refreshes the inbox", async () => {
    setViewport(1280);
    const user = userEvent.setup();
    const { host } = fakeHost({
      fetch: {
        "auth-session": [probe],
        "character-me": [me(1000), me(1000)],
        "turn-status": [turn, turn],
        notifications: [inbox(1), inbox(0)],
      },
      mutate: { "notification-read": [JSON.stringify({ success: true })] },
    });
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await screen.findByText(/Turn processed/);
    await user.click(screen.getByRole("button", { name: "Mark read" }));
    expect(await screen.findByText("Notification marked as read.")).toBeInTheDocument();
  });

  it("expands to two columns at desktop width", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    expect(css).toMatch(/@media\s*\(min-width:\s*700px\)\s*\{\s*\.ahd-mp-grid\s*\{[^}]*grid-template-columns:\s*1fr 1fr/);
  });

  it("exits without touching local storage", async () => {
    setViewport(1280);
    const user = userEvent.setup();
    const setItem = vi.spyOn(window.localStorage.__proto__, "setItem");
    const onExit = vi.fn();
    render(<MpModeScreen host={fakeHost(readyScript()).host} onExit={onExit} />);
    await screen.findByRole("heading", { name: "Ada" });
    await user.click(screen.getByRole("button", { name: "Exit multiplayer" }));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("MpModeScreen navigation icons at 320px (#369)", () => {
  it("renders the shared SVG icon language instead of ad hoc glyphs", async () => {
    setViewport(320);
    render(<MpModeScreen host={fakeHost(readyScript()).host} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });
    const navigation = within(screen.getByRole("navigation", { name: "Primary" }));
    const expected: Array<readonly [string, string]> = [
      ["Multiplayer", NAV_ICON_PATHS.multiplayer],
      ["Ask", NAV_ICON_PATHS.ask],
      ["Menu", NAV_ICON_PATHS.menu],
    ];
    for (const [label, path] of expected) {
      const button = navigation.getByRole("button", { name: label });
      const svg = button.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(button.querySelector("path")?.getAttribute("d")).toBe(path);
      expect(button.textContent).not.toMatch(/[●?☰]/);
    }
  });

  it("preserves active semantics, callbacks, and the shared touch-target/safe-area/focus contract", async () => {
    setViewport(320);
    const user = userEvent.setup();
    const onAsk = vi.fn();
    const onExit = vi.fn();
    const { container } = render(
      <MpModeScreen host={fakeHost(readyScript()).host} onAsk={onAsk} onExit={onExit} />,
    );
    await screen.findByRole("heading", { name: "Ada" });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const navigation = within(nav);
    expect(navigation.getByRole("button", { name: "Multiplayer" })).toHaveAttribute("aria-current", "page");
    await user.click(navigation.getByRole("button", { name: "Ask" }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    await user.click(navigation.getByRole("button", { name: "Menu" }));
    expect(onExit).toHaveBeenCalledTimes(1);
    // Shared visual language: the MP footer reuses the bottom-nav classes so
    // touch targets, safe-area padding, and the focus-visible ring match SP.
    expect(container.querySelector("footer")?.className).toMatch(/ahd-footer/);
    expect(nav.className).toMatch(/ahd-bottomnav/);
    for (const label of ["Multiplayer", "Ask", "Menu"]) {
      expect(navigation.getByRole("button", { name: label }).className).toMatch(/ahd-bottomnav-item/);
    }
    const css = readFileSync("src/ui/ui.css", "utf8");
    expect(css).toMatch(/\.ahd-bottomnav-item[^{]*\{[^}]*min-height:\s*56px/);
    expect(css).toMatch(/\.ahd-footer[^{]*\{[^}]*env\(safe-area-inset-bottom\)/);
    expect(css).toMatch(/\.ahd-bottomnav-item:focus-visible/);
    // Fully bundled native assets: icons are inline SVG, never remote.
    expect(nav.querySelector("svg use")).toBeNull();
    expect(nav.querySelector("svg image")).toBeNull();
  });
});

describe("MpModeScreen navigation icons at 390px (#369)", () => {
  it("uses the same shared SVG icons at 390px", async () => {
    setViewport(390);
    render(<MpModeScreen host={fakeHost(readyScript()).host} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });
    const navigation = within(screen.getByRole("navigation", { name: "Primary" }));
    const expected: Array<readonly [string, string]> = [
      ["Multiplayer", NAV_ICON_PATHS.multiplayer],
      ["Ask", NAV_ICON_PATHS.ask],
      ["Menu", NAV_ICON_PATHS.menu],
    ];
    for (const [label, path] of expected) {
      const button = navigation.getByRole("button", { name: label });
      expect(button.querySelector("svg")).not.toBeNull();
      expect(button.querySelector("path")?.getAttribute("d")).toBe(path);
      expect(button.textContent).not.toMatch(/[●?☰]/);
      expect(navigation.getByRole("button", { name: label }).className).toMatch(/ahd-bottomnav-item/);
    }
    expect(navigation.getByRole("button", { name: "Multiplayer" })).toHaveAttribute("aria-current", "page");
  });
});
