/**
 * @vitest-environment jsdom
 *
 * Rendered SP-to-MP-to-SP switching lifecycle (#510).
 *
 * The adapter already proves the session contract (persistent platform-cookie
 * probe, expiry eviction, offline keep-state, no web storage:
 * `src/mp/sessionLifecycle.test.ts`), and the landing screen already proves
 * each home leg separately. What #510 still owed was the rendered lifecycle:
 * the exact SP drawer controls ("End Turn", "Save") never appear as usable
 * MP controls, an expired or offline MP session recovers honestly without
 * touching the local save, and the world-active home keeps both the SP
 * resume and the MP entry reachable at phone and desktop widths.
 *
 * Reference: AHDGame owns authentication; Native holds no credentials.
 * Entering MP must not dispose the SP client/world/slot (App keeps them
 * while `screen === 'mp'`), and exiting MP returns home where
 * "Return to game" resumes the untouched world. The degraded-state exit
 * legs are exercised too: the header "Exit multiplayer" stays usable from
 * both the Session-expired and the Connection-lost cards.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MpModeScreen } from "./MpModeScreen";
import { LandingScreen, type LandingScreenProps } from "./LandingScreen";
import type { MpBridgeHost } from "../mp/bridge";
import type { EraChoice } from "../game/types";

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
const probe401 = { reject: 'remote-error:401:0:{"active":false}' };
const transportDown = { reject: "session-transport" };

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeHost(queues: Record<string, Array<string | { reject: string }>>): {
  host: MpBridgeHost;
  beginSpy: ReturnType<typeof vi.fn>;
} {
  const pending = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(queues))
    pending.set(`fetch:${op}`, [...items]);
  const beginSpy = vi.fn(async () => {});
  return {
    beginSpy,
    host: {
      fetch: async (op: string) => {
        const item = pending.get(`fetch:${op}`)?.shift();
        if (typeof item === "string") return item;
        if (item) throw new Error(item.reject);
        throw new Error(`unexpected fetch ${op}`);
      },
      mutate: async () => {
        throw new Error("unexpected mutate");
      },
      beginSignIn: beginSpy,
    },
  };
}

/** One full ready chain: mount enter plus the chained on-demand mail load. */
function readyChain(
  firstProbe: string | { reject: string } = probe,
): Record<string, Array<string | { reject: string }>> {
  return {
    "auth-session": [firstProbe],
    "character-me": [me],
    "turn-status": [turn],
    "client-nav": [caps],
    notifications: [inbox],
    "mail-inbox": [emptyMailInbox],
    "mail-sent": [emptyMailSent],
  };
}

const ERAS: EraChoice[] = [
  {
    id: "1953",
    label: "1953",
    countries: [
      {
        id: "US",
        name: "United States",
        regions: [],
        headOfStateOffice: "president",
        rulingPartyByInitialization: { founding: null, historical: null },
      },
    ],
  },
];

function landingProps(
  overrides: Partial<LandingScreenProps> = {},
): LandingScreenProps {
  return {
    eras: ERAS,
    saves: [],
    worldActive: true,
    busy: false,
    buildLabel: "Test build",
    reducedMotion: "system",
    pendingDelete: null,
    onNew: vi.fn(),
    onHelp: vi.fn(),
    onSettings: vi.fn(),
    onReturn: vi.fn(),
    onReload: vi.fn(),
    onLoad: vi.fn(),
    onRequestDelete: vi.fn(),
    onCancelDelete: vi.fn(),
    onConfirmDelete: vi.fn(),
    onEnterMultiplayerNative: vi.fn(),
    onAsk: vi.fn(),
    ...overrides,
  };
}

describe("SP-to-MP-to-SP switching lifecycle", () => {
  it.each([320, 390, 1280])(
    "shows no SP End Turn/Save controls inside MP at %dpx",
    async (width) => {
      setViewport(width);
      const onExit = vi.fn();
      const { host } = fakeHost(readyChain());
      const { unmount } = render(<MpModeScreen host={host} onExit={onExit} />);
      await screen.findByRole("heading", { name: "Ada" });

      // The SP drawer wording must never appear as a usable MP control.
      expect(screen.queryByRole("button", { name: /end turn/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /save game/i })).toBeNull();
      // The MP way out stays reachable instead.
      expect(
        screen.getByRole("button", { name: "Exit multiplayer" }),
      ).toBeInTheDocument();
      unmount();
    },
  );

  it("expired MP session evicts authed views and reconnects without touching SP", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const setItem = vi.spyOn(window.localStorage.__proto__, "setItem");
    const onExit = vi.fn();
    const { host, beginSpy } = fakeHost({
      ...readyChain(),
      // Manual refresh after load: the probe now 401s (logout/expiry).
      "auth-session": [probe, probe401, probe],
      "character-me": [me, me],
      "turn-status": [turn, turn],
      "client-nav": [caps, caps],
      notifications: [inbox, inbox],
    });
    render(<MpModeScreen host={host} onExit={onExit} />);
    await screen.findByRole("heading", { name: "Ada" });

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(
      await screen.findByRole("heading", { name: "Session expired" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/reconnect/i);
    // Authed projections are evicted: no player card, no sections nav.
    expect(screen.queryByRole("heading", { name: "Ada" })).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Multiplayer sections" }),
    ).toBeNull();
    // Recovery stays reachable: retry, provider reconnect, and exit home.
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Exit multiplayer" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Continue with Discord" }),
    );
    expect(beginSpy).toHaveBeenCalledWith("discord");
    expect(
      await screen.findByRole("heading", { name: "Ada" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Session expired" }),
    ).toBeNull();
    // Reconnect wrote nothing to web storage: the local SP save is untouched.
    expect(setItem).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
  });

  it("offline MP keeps the last loaded state and reconnects on retry", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const { host } = fakeHost({
      ...readyChain(),
      // Manual refresh after load: transport failure, not a 401.
      "auth-session": [probe, transportDown, probe],
      "character-me": [me, me],
      "turn-status": [turn, turn],
      "client-nav": [caps, caps],
      notifications: [inbox, inbox],
    });
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(
      await screen.findByRole("heading", { name: "Connection lost" }),
    ).toBeInTheDocument();
    // The last loaded state is kept below the honest card, never blanked.
    expect(screen.getByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(screen.getByText("Playing as Ada")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(
      await screen.findByRole("heading", { name: "Ada" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Connection lost" }),
    ).toBeNull();
  });

  it("expired MP session still exits home from the degraded card", async () => {
    setViewport(390);
    const user = userEvent.setup();
    const onExit = vi.fn();
    const { host } = fakeHost({
      ...readyChain(),
      // Manual refresh after load: the probe now 401s (logout/expiry).
      "auth-session": [probe, probe401],
      "character-me": [me],
      "turn-status": [turn],
      "client-nav": [caps],
      notifications: [inbox],
    });
    render(<MpModeScreen host={host} onExit={onExit} />);
    await screen.findByRole("heading", { name: "Ada" });

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("heading", { name: "Session expired" });

    // The persistent way out stays usable from the degraded state: exit
    // returns home (App unmounts the session) without touching the SP save.
    await user.click(screen.getByRole("button", { name: "Exit multiplayer" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("offline MP still exits home while the connection-lost card is shown", async () => {
    setViewport(320);
    const user = userEvent.setup();
    const onExit = vi.fn();
    const { host } = fakeHost({
      ...readyChain(),
      // Manual refresh after load: transport failure, not a 401.
      "auth-session": [probe, transportDown],
      "character-me": [me],
      "turn-status": [turn],
      "client-nav": [caps],
      notifications: [inbox],
    });
    render(<MpModeScreen host={host} onExit={onExit} />);
    await screen.findByRole("heading", { name: "Ada" });

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByRole("heading", { name: "Connection lost" });

    await user.click(screen.getByRole("button", { name: "Exit multiplayer" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it.each([320, 390, 1280])(
    "world-active home keeps both SP resume and MP entry at %dpx",
    async (width) => {
      setViewport(width);
      const user = userEvent.setup();
      const p = landingProps();
      render(<LandingScreen {...p} />);
      const resume = screen.getByRole("button", { name: "Return to game" });
      const enterMp = screen.getByRole("button", { name: "Enter multiplayer" });
      expect(resume).toBeEnabled();
      expect(enterMp).toBeEnabled();

      // Leaving for MP goes through the native entry; coming back resumes the
      // same world. Both legs fire without touching saves or worlds here.
      await user.click(enterMp);
      expect(p.onEnterMultiplayerNative).toHaveBeenCalledTimes(1);
      await user.click(resume);
      expect(p.onReturn).toHaveBeenCalledTimes(1);
      expect(p.onLoad).not.toHaveBeenCalled();
      expect(p.onNew).not.toHaveBeenCalled();
    },
  );
});
