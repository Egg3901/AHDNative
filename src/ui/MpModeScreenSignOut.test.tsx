/**
 * @vitest-environment jsdom
 *
 * Mobile unlink / switch-account recovery (#149): the MP header must offer
 * sign-out next to exit. Confirming unlink returns the screen to the
 * sign-in card (the switch-account path) on the app origin: the single
 * WebView is never left on remote content. A failed unlink keeps the
 * signed-in views with the error and retry, never a half-cleared screen.
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
const logoutAck = JSON.stringify({ ok: true });

function fakeHost(options: { logout: string | { reject: string } }): { host: MpBridgeHost; mutateSpy: ReturnType<typeof vi.fn> } {
  const logout = options.logout;
  const mutateSpy = vi.fn(async (op: string) => {
    if (op === "auth-logout") {
      if (typeof logout === "string") return logout;
      throw new Error(logout.reject);
    }
    throw new Error(`unexpected mutate ${op}`);
  });
  return {
    mutateSpy,
    host: {
      fetch: async (op: string) => {
        switch (op) {
          case "auth-session": return probe;
          case "character-me": return me;
          case "turn-status": return turn;
          case "client-nav": return caps;
          case "notifications": return inbox;
          case "mail-inbox": return emptyMailInbox;
          case "mail-sent": return emptyMailSent;
          default: throw new Error(`unexpected fetch ${op}`);
        }
      },
      mutate: mutateSpy,
      beginSignIn: async () => {},
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MpModeScreen sign out", () => {
  it("confirmed unlink returns to the sign-in card with switch path", async () => {
    const user = userEvent.setup();
    const { host, mutateSpy } = fakeHost({ logout: logoutAck });
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await waitFor(() => expect(screen.getByText("Playing as Ada")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /sign out/i }));
    expect(mutateSpy).toHaveBeenCalledWith("auth-logout", {});

    // The sign-in card (with both provider entries) replaces the authed
    // views: switching accounts starts here, on the app origin.
    await waitFor(() => expect(screen.getByRole("heading", { name: /sign in to play multiplayer/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /continue with discord/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.queryByText("Playing as Ada")).not.toBeInTheDocument();
  });

  it("failed unlink keeps the session with the error and retry", async () => {
    const user = userEvent.setup();
    const { host } = fakeHost({ logout: { reject: "session-transport" } });
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await waitFor(() => expect(screen.getByText("Playing as Ada")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    // Identity and authed views stand: nothing was half-cleared.
    expect(screen.getByText("Playing as Ada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
});
