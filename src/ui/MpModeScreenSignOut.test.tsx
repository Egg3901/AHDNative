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

/**
 * Throttled unlink recovery (#149, #363): tapping Sign out while the server
 * throttles must keep the linked session under the "Slow down" card with the
 * server backoff — never a half-cleared screen — and the retry path must
 * reach the sign-in card once the throttle lifts.
 */
describe("MpModeScreen throttled unlink", () => {
  function pressureHost(): { host: MpBridgeHost; mutateSpy: ReturnType<typeof vi.fn> } {
    const logoutQueue: Array<string | { reject: string }> = [
      { reject: 'remote-error:429:45:{"error":"too quick"}' },
      logoutAck,
    ];
    const mutateSpy = vi.fn(async (op: string) => {
      if (op === "auth-logout") {
        const next = logoutQueue.shift();
        if (typeof next === "string") return next;
        if (next) throw new Error(next.reject);
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

  it("slow-down keeps the session, then retry reaches the sign-in card", async () => {
    const user = userEvent.setup();
    const { host, mutateSpy } = pressureHost();
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await waitFor(() => expect(screen.getByText("Playing as Ada")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /sign out/i }));

    // Honest pressure state: backoff line, Slow down card, kept identity.
    await waitFor(() => expect(screen.getByRole("heading", { name: "Slow down" })).toBeInTheDocument());
    expect(screen.getByText("Try again in about 45 seconds.")).toBeInTheDocument();
    expect(screen.getByText("Playing as Ada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(mutateSpy).toHaveBeenCalledWith("auth-logout", {});

    // Reconnect recovers the ready session; the retry unlink then lands the
    // sign-in card (the switch-account path) once the throttle lifts.
    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Slow down" })).not.toBeInTheDocument());
    expect(screen.getByText("Playing as Ada")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /sign in to play multiplayer/i })).toBeInTheDocument());
    expect(screen.queryByText("Playing as Ada")).not.toBeInTheDocument();
  });
});

/**
 * Unlink-to-switch screen residue (#149, #363): the reference logs out to
 * `/`, dropping every in-memory draft with the navigation. Native keeps the
 * MP screen mounted across unlink and switch, so per-account screen state
 * (mail reader selection, compose draft) must reset when the linked account
 * ends. Otherwise the next account on a shared phone reads the previous
 * player's mail body and draft. The same mail id is reused for both
 * accounts so a stale reader selection would visibly reopen on Bo's row.
 */
describe("MpModeScreen unlink-to-switch residue", () => {
  const USER_B = "507f1f77bcf86cd799439012";
  const CHAR_B = "507f1f77bcf86cd799439013";
  const TO_CHAR = "507f1f77bcf86cd799439014";
  const SHARED_MAIL = "607f1f77bcf86cd799439099";

  const probeBo = JSON.stringify({ active: true, sub: USER_B, username: "Bo" });
  const meBo = JSON.stringify({
    character: { _id: "c2", name: "Bo", party: "Whig", homeState: "NY", cashOnHand: 5, actions: 2, countryId: "US" },
    corporation: null,
  });
  const capsBo = JSON.stringify({ user: { id: USER_B, username: "Bo", isAdmin: false }, hasCharacter: true });

  function accountMail(subject: string, body: string, fromName: string): string {
    return JSON.stringify({
      mails: [
        {
          _id: SHARED_MAIL,
          fromCharacterId: CHAR_B,
          fromCharacterName: fromName,
          toUserId: USER,
          toCharacterId: TO_CHAR,
          toCharacterName: "Ada",
          subject,
          body,
          read: false,
          deletedByRecipient: false,
          deletedBySender: false,
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      unreadCount: 1,
      total: 1,
      hasMore: false,
    });
  }

  function switchingHost(): { host: MpBridgeHost; beginSpy: ReturnType<typeof vi.fn> } {
    const queues = new Map<string, string[]>([
      ["auth-session", [probe, probeBo]],
      ["character-me", [me, meBo]],
      ["turn-status", [turn, turn]],
      ["client-nav", [caps, capsBo]],
      ["notifications", [inbox, inbox]],
      ["mail-inbox", [accountMail("Ada secret thread", "Ada private body", "Bo"), accountMail("Bo thread", "Bo body", "Al"), accountMail("Bo thread", "Bo body", "Al")]],
      ["mail-sent", [emptyMailSent, emptyMailSent, emptyMailSent]],
    ]);
    const beginSpy = vi.fn(async () => {});
    return {
      beginSpy,
      host: {
        fetch: async (op: string) => {
          const next = queues.get(op)?.shift();
          if (next !== undefined) return next;
          throw new Error(`unexpected fetch ${op}`);
        },
        mutate: async (op: string) => {
          if (op === "auth-logout") return logoutAck;
          throw new Error(`unexpected mutate ${op}`);
        },
        beginSignIn: beginSpy,
      },
    };
  }

  it("unlink then switch leaves no mail reader or compose draft behind", async () => {
    const user = userEvent.setup();
    const { host, beginSpy } = switchingHost();
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await waitFor(() => expect(screen.getByText("Playing as Ada")).toBeInTheDocument());

    // Ada opens her mail and starts a draft.
    await user.click(screen.getByRole("button", { name: /open ada secret thread/i }));
    await waitFor(() => expect(screen.getByLabelText("Open mail")).toBeInTheDocument());
    expect(screen.getByText("Ada private body")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Subject"), "Ada draft subject");
    expect((screen.getByPlaceholderText("Subject") as HTMLInputElement).value).toBe("Ada draft subject");

    // Unlink: the sign-in card (switch path) replaces the authed views.
    await user.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /sign in to play multiplayer/i })).toBeInTheDocument());

    // Switch: Bo links on the same mounted screen.
    await user.click(screen.getByRole("button", { name: /continue with google/i }));
    expect(beginSpy).toHaveBeenCalledWith("google");
    await waitFor(() => expect(screen.getByText("Playing as Bo")).toBeInTheDocument());

    // Bo loads his mail on the same reused mail id: a stale reader
    // selection would visibly reopen here on Bo's row.
    await user.click(screen.getByRole("button", { name: /refresh mail/i }));
    await waitFor(() => expect(screen.getAllByText("Bo thread").length).toBeGreaterThan(0));

    // No reader reopened on the reused mail id, no Ada content, no draft.
    expect(screen.queryByLabelText("Open mail")).not.toBeInTheDocument();
    expect(screen.queryByText("Ada private body")).not.toBeInTheDocument();
    expect(screen.queryByText("Ada secret thread")).not.toBeInTheDocument();
    expect((screen.getByPlaceholderText("Subject") as HTMLInputElement).value).toBe("");
  }, 30000);
});
