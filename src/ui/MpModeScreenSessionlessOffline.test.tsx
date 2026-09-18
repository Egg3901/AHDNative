/**
 * @vitest-environment jsdom
 *
 * Sessionless offline honesty (#362/#359): on a single-view phone the
 * provider step can fail to start (no second webview), and entry transport
 * can fail before any identity exists. Both land the adapter in `offline`
 * with no userId and nothing loaded. That must render the sign-in card
 * (provider choices, Retry, Back) with the error, never the mid-session
 * "Connection lost / state kept below" card, which claims loaded state
 * that does not exist and hides the provider path. Mid-session loss with
 * an identity keeps the blocked card and the kept state.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MpModeScreen } from "./MpModeScreen";
import type { MpBridgeHost } from "../mp/bridge";

const USER = "507f1f77bcf86cd799439011";
const NOTE = "607f1f77bcf86cd799439011";

const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const me = JSON.stringify({
  character: { _id: "c1", name: "Ada", party: "Labor", homeState: "CA", cashOnHand: 1000, actions: 3, countryId: "US" },
  corporation: null,
});
const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null });
const caps = JSON.stringify({ user: { id: USER, username: "Ada", isAdmin: false }, hasCharacter: true });
const inbox = JSON.stringify({ notifications: [{ _id: NOTE, title: "Turn processed", message: "Done", read: false }], unreadCount: 1, total: 0, hasMore: false });
const emptyMailInbox = JSON.stringify({ mails: [], unreadCount: 0, total: 0, hasMore: false });
const emptyMailSent = JSON.stringify({ mails: [], total: 0, hasMore: false });
const presence = JSON.stringify({ online: 3 });

function fakeHost(queues: Record<string, Array<string | { reject: string }>>, beginSignIn: MpBridgeHost["beginSignIn"]): MpBridgeHost {
  const pending = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(queues)) pending.set(`fetch:${op}`, [...items]);
  return {
    fetch: async (op: string) => {
      const item = pending.get(`fetch:${op}`)?.shift();
      if (typeof item === "string") return item;
      if (item) throw new Error(item.reject);
      if (op === "client-nav") return JSON.stringify({ user: null, hasCharacter: false });
      throw new Error(`unexpected fetch ${op}`);
    },
    mutate: async () => {
      throw new Error("unexpected mutate");
    },
    beginSignIn,
  };
}

function readyQueues(firstProbe: Array<string | { reject: string }>): Record<string, Array<string | { reject: string }>> {
  return {
    "auth-session": firstProbe,
    "character-me": [me],
    "turn-status": [turn],
    "client-nav": [caps],
    notifications: [inbox],
    "mail-inbox": [emptyMailInbox],
    "mail-sent": [emptyMailSent],
    "players-online": [presence],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = "";
});

describe("MpModeScreen sessionless offline", () => {
  it("keeps the sign-in card with provider retry when the provider step fails to start", async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    const host = fakeHost(
      { "auth-session": [{ reject: "session-unavailable" }, { reject: "session-unavailable" }] },
      async () => {
        throw new Error("main webview is unavailable");
      },
    );
    render(<MpModeScreen host={host} onExit={onExit} />);
    await screen.findByRole("heading", { name: "Sign in to play multiplayer" });

    await user.click(screen.getByRole("button", { name: "Continue with Discord" }));

    // The provider path stays: heading, both providers, Retry, and Back.
    expect(await screen.findByRole("heading", { name: "Sign in to play multiplayer" })).toBeInTheDocument();
    expect(screen.getByText(/could not be started/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connection lost" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("lands entry transport failure on the sign-in card, not the kept-state card", async () => {
    render(<MpModeScreen host={fakeHost({ "auth-session": [{ reject: "session-transport" }] }, async () => {})} onExit={() => {}} />);

    expect(await screen.findByRole("heading", { name: "Sign in to play multiplayer" })).toBeInTheDocument();
    expect(screen.getByText(/unreachable|connection/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connection lost" })).toBeNull();
    expect(screen.queryByText(/kept below/i)).toBeNull();
  });

  it("keeps the blocked kept-state card for mid-session loss with an identity", async () => {
    const user = userEvent.setup();
    const host = fakeHost(readyQueues([probe, { reject: "session-transport" }]), async () => {});
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    // Honest mid-session recovery: kept state stays visible, Reconnect
    // offered, and no provider chooser appears over a signed-in session.
    expect(await screen.findByRole("heading", { name: "Connection lost" })).toBeInTheDocument();
    expect(screen.getByText(/kept below/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Discord" })).toBeNull();
  });
});
