/**
 * @vitest-environment jsdom
 *
 * Single-view foreground restore (#362): on phones the provider step
 * suspends the webview, so returning to the screen surfaces as a document
 * visibilitychange to visible rather than window focus. The waiting
 * sign-in card must re-probe on that foreground return; a change to hidden
 * must not probe.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MpModeScreen } from "./MpModeScreen";
import type { MpBridgeHost } from "../mp/bridge";

const USER = "507f1f77bcf86cd799439011";
const NOTE = "607f1f77bcf86cd799439011";

const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const me = JSON.stringify({
  character: {
    _id: "c1",
    name: "Ada",
    party: "Labor",
    homeState: "CA",
    cashOnHand: 1000,
    actions: 3,
    countryId: "US",
  },
  corporation: null,
});
const turn = JSON.stringify({
  currentTurn: 12,
  currentYear: 1862,
  isActive: true,
  isProcessing: false,
  nextScheduledTurn: null,
});
const caps = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
});
const inbox = JSON.stringify({
  notifications: [
    { _id: NOTE, title: "Turn processed", message: "Done", read: false },
  ],
  unreadCount: 1,
  total: 1,
  hasMore: false,
});
const emptyMailInbox = JSON.stringify({
  mails: [],
  unreadCount: 0,
  total: 0,
  hasMore: false,
});
const emptyMailSent = JSON.stringify({ mails: [], total: 0, hasMore: false });
const probeRejected = { reject: 'remote-error:401:0:{"active":false}' };

function fakeHost(
  queues: Record<string, Array<string | { reject: string }>>,
): MpBridgeHost {
  const pending = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(queues))
    pending.set(`fetch:${op}`, [...items]);
  return {
    fetch: vi.fn(async (op: string) => {
      const item = pending.get(`fetch:${op}`)?.shift();
      if (typeof item === "string") return item;
      if (item) throw new Error(item.reject);
      throw new Error(`unexpected fetch ${op}`);
    }),
    mutate: async () => {
      throw new Error("unexpected mutate");
    },
    beginSignIn: vi.fn(async () => {}),
  };
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  setVisibility("visible");
});

describe("MpModeScreen single-view foreground restore", () => {
  it("restores the ready screen on visibilitychange to visible without another click", async () => {
    setVisibility("visible");
    const host = fakeHost({
      "auth-session": [probeRejected, probe],
      "character-me": [me],
      "turn-status": [turn],
      "client-nav": [caps],
      notifications: [inbox],
      "mail-inbox": [emptyMailInbox],
      "mail-sent": [emptyMailSent],
    });
    render(<MpModeScreen host={host} onExit={() => {}} />);
    expect(
      await screen.findByRole("heading", {
        name: "Sign in to play multiplayer",
      }),
    ).toBeInTheDocument();

    // Foreground return on a suspended single-view webview: no window focus
    // fires, only visibilitychange to visible.
    document.dispatchEvent(new Event("visibilitychange"));
    expect(await screen.findByText("Playing as Ada")).toBeInTheDocument();
  });

  it("does not probe when the page hides", async () => {
    setVisibility("visible");
    const host = fakeHost({
      "auth-session": [probeRejected],
    });
    render(<MpModeScreen host={host} onExit={() => {}} />);
    expect(
      await screen.findByRole("heading", {
        name: "Sign in to play multiplayer",
      }),
    ).toBeInTheDocument();
    expect(host.fetch).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    // Let any stray probe flush; the sign-in card stays and no new fetch runs.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(host.fetch).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("heading", {
        name: "Sign in to play multiplayer",
      }),
    ).toBeInTheDocument();
  });
});
