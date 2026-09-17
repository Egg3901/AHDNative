/**
 * Rendered presence/countdown contract for the Native multiplayer mode
 * screen (#359 presence slice).
 *
 * Presence comes from the audited public GET /api/players/online and is
 * rendered only when the endpoint answers with a usable count; every
 * failure mode (refusal, rate limit, malformed, offline, surprising 401)
 * leaves the row absent without disturbing the ready session. Countdown,
 * processing, and paused states mirror the reference StatusBar at 320px,
 * 390px, and desktop widths.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
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
const turnBase = { currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null };
const inbox = JSON.stringify({
  notifications: [{ _id: NOTE, title: "Turn processed", message: "Done", read: false }],
  unreadCount: 1,
  total: 1,
  hasMore: false,
});
const emptyMailInbox = JSON.stringify({ mails: [], unreadCount: 0, total: 0, hasMore: false });
const emptyMailSent = JSON.stringify({ mails: [], total: 0, hasMore: false });
const presence = (online: number) =>
  JSON.stringify({ online, asOf: "2026-09-17T12:00:00.000Z" });

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

interface Script {
  fetch?: Record<string, Array<string | { reject: string }>>;
}

function fakeHost(script: Script): { host: MpBridgeHost; calls: string[] } {
  const calls: string[] = [];
  const queues = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(script.fetch ?? {})) queues.set(`fetch:${op}`, [...items]);
  const next = (key: string): string => {
    const item = queues.get(key)?.shift();
    if (typeof item === "string") return item;
    if (item) throw new Error(item.reject);
    if (key === "fetch:client-nav") return JSON.stringify({ user: null, hasCharacter: false });
    throw new Error(`unexpected call ${key}`);
  };
  return {
    calls,
    host: {
      fetch: async (op: string) => {
        calls.push(`fetch:${op}`);
        return next(`fetch:${op}`);
      },
      mutate: async () => {
        throw new Error("unexpected mutate");
      },
      beginSignIn: async () => {},
    },
  };
}

function mountScript(overrides?: {
  turn?: unknown;
  presence?: Array<string | { reject: string }>;
}): Script {
  return {
    fetch: {
      "auth-session": [probe],
      "character-me": [me],
      "turn-status": [JSON.stringify(overrides?.turn ?? turnBase)],
      notifications: [inbox],
      "mail-inbox": [emptyMailInbox],
      "mail-sent": [emptyMailSent],
      ...(overrides?.presence ? { "players-online": overrides.presence } : {}),
    },
  };
}

async function readyScreen(script: Script) {
  render(<MpModeScreen host={fakeHost(script).host} onExit={() => {}} />);
  await screen.findByRole("heading", { name: "Ada" });
}

function worldTurnCard(): HTMLElement {
  return screen.getByRole("article", { name: "World turn" });
}

describe("MpModeScreen presence at phone widths", () => {
  it("renders the authoritative online count and player-paced schedule at 320px", async () => {
    setViewport(320);
    await readyScreen(mountScript({ presence: [presence(123)] }));
    const card = worldTurnCard();
    expect(within(card).getByText("123 players online")).toBeInTheDocument();
    expect(within(card).getByText("Player paced")).toBeInTheDocument();
    expect(within(card).getByText("Live")).toBeInTheDocument();
  });

  it("renders a live wall-clock countdown and the singular count at 390px", async () => {
    setViewport(390);
    const future = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    await readyScreen(
      mountScript({
        turn: { ...turnBase, nextScheduledTurn: future },
        presence: [presence(1)],
      }),
    );
    const card = worldTurnCard();
    expect(within(card).getByText("1 player online")).toBeInTheDocument();
    // Reference compact form ("45m"), never the old synthesized "~" wording.
    expect(within(card).getByText(/^\d+m$/)).toBeInTheDocument();
    expect(within(card).queryByText(/Next turn in/)).toBeNull();
  });
});

describe("MpModeScreen presence failure modes at desktop widths", () => {
  it("leaves presence absent on a malformed body without inventing a zero", async () => {
    setViewport(1280);
    await readyScreen(mountScript({ presence: [JSON.stringify({ online: "lots" })] }));
    const card = worldTurnCard();
    expect(within(card).queryByText(/players? online/)).toBeNull();
    expect(within(card).queryByText(/0 players online/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Ada" })).toBeInTheDocument();
  });

  it("stays ready with no rate-limit card when presence is limited", async () => {
    setViewport(1280);
    await readyScreen(mountScript({ presence: [{ reject: "remote-error:429:60:Rate limited" }] }));
    expect(screen.getByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Slow down" })).toBeNull();
    expect(within(worldTurnCard()).queryByText(/players? online/)).toBeNull();
  });

  it("keeps the session on a surprising 401 from the public endpoint", async () => {
    setViewport(1280);
    await readyScreen(
      mountScript({ presence: [{ reject: "remote-error:401:0:Authentication required" }] }),
    );
    expect(screen.getByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Turn 12 · 1862/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Session expired" })).toBeNull();
    expect(within(worldTurnCard()).queryByText(/players? online/)).toBeNull();
  });

  it("stays absent when presence never answers, with no error banner", async () => {
    setViewport(1280);
    await readyScreen(mountScript({}));
    expect(screen.getByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(within(worldTurnCard()).queryByText(/players? online/)).toBeNull();
  });
});

describe("MpModeScreen turn states at desktop widths", () => {
  it("renders processing state with the server phase label and no schedule claim", async () => {
    setViewport(1280);
    await readyScreen(
      mountScript({
        turn: { ...turnBase, isProcessing: true, processingPhaseLabel: "Elections" },
        presence: [presence(40)],
      }),
    );
    const card = worldTurnCard();
    expect(within(card).getByText("Processing: Elections")).toBeInTheDocument();
    expect(within(card).queryByText("Player paced")).toBeNull();
  });

  it("renders paused state with the server reason and a Paused schedule", async () => {
    setViewport(1280);
    const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await readyScreen(
      mountScript({
        turn: { ...turnBase, nextScheduledTurn: future, pausedAt: "2026-09-17T11:00:00.000Z", pauseReason: "Storm" },
        presence: [presence(40)],
      }),
    );
    const card = worldTurnCard();
    expect(within(card).getByText("Paused: Storm")).toBeInTheDocument();
    const schedule = within(card).getByText("Schedule");
    expect(schedule.nextElementSibling?.textContent).toBe("Paused");
  });

  it("renders Processing... once a live deadline passes", async () => {
    setViewport(1280);
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    await readyScreen(
      mountScript({
        turn: { ...turnBase, nextScheduledTurn: past },
        presence: [presence(40)],
      }),
    );
    expect(within(worldTurnCard()).getByText("Processing...")).toBeInTheDocument();
  });

  it("renders an inactive world as Paused with no schedule claim", async () => {
    setViewport(1280);
    await readyScreen(
      mountScript({
        turn: { ...turnBase, isActive: false },
        presence: [presence(40)],
      }),
    );
    const card = worldTurnCard();
    expect(within(card).getByText("Paused")).toBeInTheDocument();
    expect(within(card).queryByText("Player paced")).toBeNull();
  });
});

describe("MpModeScreen presence re-poll", () => {
  function setVisibility(state: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  }

  function pollScript(counts: number[]): Script {
    return {
      fetch: {
        "auth-session": [probe],
        "character-me": [me],
        "turn-status": [JSON.stringify(turnBase)],
        notifications: [inbox],
        "mail-inbox": [emptyMailInbox],
        "mail-sent": [emptyMailSent],
        "players-online": counts.map((online) => presence(online)),
      },
    };
  }

  /* The mount chain is promise-only (no timers), so under fake timers a
   * bounded microtask drain settles it without touching the clock. */
  async function settleMount() {
    await act(async () => {
      for (let i = 0; i < 200; i++) {
        await Promise.resolve();
      }
    });
  }

  it("re-polls presence every 5 minutes while visible, like the reference StatusBar", async () => {
    setViewport(1280);
    setVisibility("visible");
    vi.useFakeTimers();
    try {
      const { host, calls } = fakeHost(pollScript([10, 11]));
      render(<MpModeScreen host={host} onExit={() => {}} />);
      await settleMount();
      expect(screen.getByText("10 players online")).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(300_000);
      });
      expect(screen.getByText("11 players online")).toBeInTheDocument();
      expect(calls.filter((call) => call === "fetch:players-online")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
      setVisibility("visible");
    }
  });

  it("re-polls presence on foreground return while ready", async () => {
    setViewport(1280);
    setVisibility("visible");
    vi.useFakeTimers();
    try {
      const { host, calls } = fakeHost(pollScript([10, 11]));
      render(<MpModeScreen host={host} onExit={() => {}} />);
      await settleMount();
      expect(screen.getByText("10 players online")).toBeInTheDocument();
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(screen.getByText("11 players online")).toBeInTheDocument();
      expect(calls.filter((call) => call === "fetch:players-online")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
      setVisibility("visible");
    }
  });

  it("skips the interval poll while the document is hidden", async () => {
    setViewport(1280);
    setVisibility("hidden");
    vi.useFakeTimers();
    try {
      const { host, calls } = fakeHost(pollScript([10, 11]));
      render(<MpModeScreen host={host} onExit={() => {}} />);
      await settleMount();
      // The mount load is unconditional; only the re-poll is visible-gated.
      expect(screen.getByText("10 players online")).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(2 * 300_000);
      });
      expect(screen.getByText("10 players online")).toBeInTheDocument();
      expect(screen.queryByText("11 players online")).toBeNull();
      expect(calls.filter((call) => call === "fetch:players-online")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      setVisibility("visible");
    }
  });
});

describe("MpModeScreen presence freshness", () => {
  it("refreshes presence on manual Refresh without touching the core reads", async () => {
    setViewport(1280);
    const user = userEvent.setup();
    const { host, calls } = fakeHost({
      fetch: {
        "auth-session": [probe, probe],
        "character-me": [me, me],
        "turn-status": [JSON.stringify(turnBase), JSON.stringify(turnBase)],
        notifications: [inbox, inbox],
        "mail-inbox": [emptyMailInbox],
        "mail-sent": [emptyMailSent],
        "players-online": [presence(10), presence(11)],
      },
    });
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await screen.findByRole("heading", { name: "Ada" });
    expect(await screen.findByText("10 players online")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("11 players online")).toBeInTheDocument();
    expect(calls.filter((call) => call === "fetch:players-online")).toHaveLength(2);
  });
});
