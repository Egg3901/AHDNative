/**
 * Single-view mobile slice for the Native multiplayer screen (#362).
 *
 * Bounded contract on top of #359/#361: the ready screen offers a compact
 * overview jump-nav (drill-in) with a back path per section at 320/390px,
 * the session-required screen states the single-view sign-in behavior and
 * offers a safe return path, and Ask/Menu stay reachable from every MP
 * state. Nothing embeds or navigates to another client app.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MpModeScreen } from "./MpModeScreen";
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
  window.location.hash = "";
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

describe("MpModeScreen single-view drill-in at 320px", () => {
  it("offers an overview jump-nav and a back path for every section", async () => {
    setViewport(320);
    const user = userEvent.setup();
    render(<MpModeScreen host={fakeHost(readyScript()).host} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });

    const sections = screen.getByRole("navigation", { name: "Multiplayer sections" });
    expect(within(sections).getByRole("button", { name: "Status" })).toBeInTheDocument();
    expect(within(sections).getByRole("button", { name: "Actions" })).toBeInTheDocument();
    expect(within(sections).getByRole("button", { name: /Inbox/ })).toBeInTheDocument();

    await user.click(within(sections).getByRole("button", { name: "Actions" }));
    expect(window.location.hash).toBe("#mp-actions");

    const backs = screen.getAllByRole("button", { name: "Back to sections" });
    expect(backs.length).toBeGreaterThanOrEqual(3);
    await user.click(backs[0]);
    expect(window.location.hash).toBe("#mp-top");
  });

  it("keeps Ask and Menu reachable after drilling in", async () => {
    setViewport(320);
    const user = userEvent.setup();
    const onAsk = vi.fn();
    const onExit = vi.fn();
    render(<MpModeScreen host={fakeHost(readyScript()).host} onAsk={onAsk} onExit={onExit} />);
    await screen.findByRole("heading", { name: "Ada" });

    const sections = screen.getByRole("navigation", { name: "Multiplayer sections" });
    await user.click(within(sections).getByRole("button", { name: /Inbox/ }));

    const navigation = within(screen.getByRole("navigation", { name: "Primary" }));
    await user.click(navigation.getByRole("button", { name: "Ask" }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    await user.click(navigation.getByRole("button", { name: "Menu" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe("MpModeScreen single-view sign-in at 390px", () => {
  it("states the single-view sign-in behavior and offers a safe return path", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const onExit = vi.fn();
    render(
      <MpModeScreen
        host={fakeHost({ fetch: { "auth-session": [{ reject: "session-unavailable" }] } }).host}
        onExit={onExit}
      />,
    );
    expect(await screen.findByRole("heading", { name: "Sign in to play multiplayer" })).toBeInTheDocument();
    expect(screen.getByText(/returns here automatically/)).toBeInTheDocument();
    expect(screen.queryByText(/AHDClient|full-site|full site/i)).toBeNull();

    const navigation = within(screen.getByRole("navigation", { name: "Primary" }));
    expect(navigation.getByRole("button", { name: "Multiplayer" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
