/**
 * @vitest-environment jsdom
 *
 * Desktop post-callback restore (#149): the provider round trip finishes in
 * the separate persistent online window, so coming back to the main window
 * must re-probe while the screen waits for a session. A completed callback
 * lands without another click; cancellation, failure, and expiry keep the
 * signed-out card with retry. Mirrors the AskPanel focus re-probe.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
const inbox = JSON.stringify({ notifications: [{ _id: NOTE, title: "Turn processed", message: "Done", read: false }], unreadCount: 1, total: 1, hasMore: false });
const emptyMailInbox = JSON.stringify({ mails: [], unreadCount: 0, total: 0, hasMore: false });
const emptyMailSent = JSON.stringify({ mails: [], total: 0, hasMore: false });
const probeRejected = { reject: 'remote-error:401:0:{"active":false}' };

function fakeHost(queues: Record<string, Array<string | { reject: string }>>): { host: MpBridgeHost; beginSpy: ReturnType<typeof vi.fn> } {
  const pending = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(queues)) pending.set(`fetch:${op}`, [...items]);
  const beginSpy = vi.fn(async () => {});
  return {
    beginSpy,
    host: {
      fetch: vi.fn(async (op: string) => {
        const item = pending.get(`fetch:${op}`)?.shift();
        if (typeof item === "string") return item;
        if (item) throw new Error(item.reject);
        throw new Error(`unexpected fetch ${op}`);
      }),
      mutate: async () => {
        throw new Error("unexpected mutate");
      },
      beginSignIn: beginSpy,
    },
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
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MpModeScreen post-callback restore", () => {
  it("completed callback restores on window focus without another click", async () => {
    const user = userEvent.setup();
    // Bounce opens but the callback has not landed: signed-out card first,
    // both on mount and on the immediate post-click probe.
    const { host, beginSpy } = fakeHost(readyQueues([probeRejected, probeRejected, probe]));
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Continue with Discord" }));
    expect(await screen.findByRole("heading", { name: "Sign in to play multiplayer" })).toBeInTheDocument();
    expect(beginSpy).toHaveBeenCalledWith("discord");

    // The callback lands the platform cookie while the player is in the
    // online window; returning focus restores the ready screen by itself.
    window.dispatchEvent(new Event("focus"));
    expect(await screen.findByText("Playing as Ada")).toBeInTheDocument();
    expect(beginSpy).toHaveBeenCalledTimes(1);
  });

  it("cancelled callback keeps the signed-out card with retry on focus", async () => {
    const user = userEvent.setup();
    const { host } = fakeHost(readyQueues([probeRejected, probeRejected, probeRejected]));
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("heading", { name: "Sign in to play multiplayer" })).toBeInTheDocument();

    // Still no session: focus re-probes and stays signed out, never a blank
    // screen and never a phantom ready state. Retry remains.
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(host.fetch).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: "Sign in to play multiplayer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("Playing as Ada")).toBeNull();
  });
});
