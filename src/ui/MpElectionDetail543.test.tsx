/**
 * MP election detail drill-in (#359 election slice).
 *
 * Standing's active-election row offers a real destination: the audited
 * GET /api/elections?id={seatId ?? id}&view=summary read behind a View race
 * control. The panel opens only with a loaded summary, shows phase, field,
 * leader, and incumbent, and returns to Standing via Back to Standing. An
 * invalid reference keeps the row display-only; failures keep Standing
 * intact; expiry closes the panel. Rendered at 320px, 390px, and desktop.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MpModeScreen } from "./MpModeScreen";
import type { MpBridgeHost } from "../mp/bridge";

const USER = "507f1f77bcf86cd799439011";
const NOTE = "607f1f77bcf86cd799439011";
const HEX_ID = "68a000000000000000000001";
const SEAT_ID = "US-senate-PA-1";

const probe = JSON.stringify({ active: true, sub: USER, username: "Ada" });
const me = JSON.stringify({
  character: { _id: "c1", name: "Ada", party: "Labor", homeState: "CA", cashOnHand: 1000, actions: 3, countryId: "US" },
  corporation: null,
});
const turn = JSON.stringify({ currentTurn: 12, currentYear: 1862, isActive: true, isProcessing: false, nextScheduledTurn: null });
const inbox = JSON.stringify({
  notifications: [{ _id: NOTE, title: "Turn processed", message: "Done", read: false }],
  unreadCount: 1,
  total: 1,
  hasMore: false,
});
const emptyMailInbox = JSON.stringify({ mails: [], unreadCount: 0, total: 0, hasMore: false });
const emptyMailSent = JSON.stringify({ mails: [], total: 0, hasMore: false });

const electionCapabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterName: "Ada",
  characterCountryId: "US",
  unreadMailCount: 0,
  activeElection: { id: HEX_ID, seatId: SEAT_ID, label: "Senate · PA" },
});

const invalidElectionCapabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterName: "Ada",
  characterCountryId: "US",
  unreadMailCount: 0,
  activeElection: { id: "e1", label: "Senate · PA" },
});

const summary = JSON.stringify({
  election: {
    id: HEX_ID,
    seatId: SEAT_ID,
    electionType: "senate",
    state: "PA",
    countryId: "US",
    cycle: 4,
    status: "active",
    inPrimary: false,
    isEnded: false,
    isUpcoming: false,
    inGeneral: true,
    candidates: [{}, {}],
    polling: { leaderName: "Ada", leaderParty: "Labor" },
    incumbent: { name: "Bo", party: "Tory" },
  },
});

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  window.location.hash = "";
});

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
    if (key === "fetch:client-nav") return JSON.stringify({ user: null, hasCharacter: false });
    throw new Error(`unexpected call ${key}`);
  };
  return {
    calls,
    host: {
      fetch: async (op: string, limit?: number, offset?: number, electionId?: string) => {
        calls.push(`fetch:${op}:${limit ?? ""}:${offset ?? ""}:${electionId ?? ""}`);
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

function readyScript(capabilities: string = electionCapabilities, detail: Array<string | { reject: string }> = [summary]): Script {
  return {
    fetch: {
      "auth-session": [probe],
      "character-me": [me],
      "turn-status": [turn],
      "client-nav": [capabilities],
      notifications: [inbox],
      "mail-inbox": [emptyMailInbox],
      "mail-sent": [emptyMailSent],
      "election-detail": detail,
    },
  };
}

describe.each([320, 390, 1280])("MP election detail drill-in at %spx (#359)", (width) => {
  it("opens the authoritative summary from Standing and returns to it", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host, calls } = fakeHost(readyScript());
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    // No detail fetch on enter: the drill-in is on demand.
    expect(calls.some((call) => call.startsWith("fetch:election-detail"))).toBe(false);
    const view = within(standing).getByRole("button", { name: "View race" });
    await user.click(view);
    const detail = await screen.findByRole("article", { name: "Election detail" });
    // The seatId (live-site /elections/[seatId ?? id] target) is requested.
    expect(calls.some((call) => call === `fetch:election-detail:::${SEAT_ID}`)).toBe(true);
    expect(within(detail).getByText("Senate · PA")).toBeInTheDocument();
    expect(within(detail).getByText("General")).toBeInTheDocument();
    expect(within(detail).getByText("2 candidates")).toBeInTheDocument();
    expect(within(detail).getByText(/Ada/)).toBeInTheDocument();
    expect(detail.querySelector("a")).toBeNull();
    expect(detail.textContent).not.toMatch(/\/elections|\/corporation|\/unions|\/country\//);
    await user.click(screen.getByRole("button", { name: "Back to Standing" }));
    expect(window.location.hash).toBe("#mp-profile");
    expect(screen.queryByRole("article", { name: "Election detail" })).toBeNull();
    expect(screen.getByRole("article", { name: "Standing" })).toBeInTheDocument();
  });

  it("keeps an invalid election reference display-only with no control", async () => {
    setViewport(width);
    render(<MpModeScreen host={fakeHost(readyScript(invalidElectionCapabilities)).host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    expect(within(standing).getByText("Senate · PA")).toBeInTheDocument();
    expect(standing.querySelector("button")).toBeNull();
    expect(screen.queryByRole("article", { name: "Election detail" })).toBeNull();
  });

  it("reports a malformed detail honestly with Standing intact", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host, calls } = fakeHost(readyScript(electionCapabilities, ["{oops"]));
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View race" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("election record");
    expect(screen.queryByRole("article", { name: "Election detail" })).toBeNull();
    expect(screen.getByRole("article", { name: "Standing" })).toBeInTheDocument();
    expect(calls.filter((call) => call.startsWith("fetch:character-me"))).toHaveLength(1);
  });

  it("closes the open panel on auth expiry instead of showing a stale race", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(
      <MpModeScreen
        host={
          fakeHost({
            fetch: {
              "auth-session": [probe, probe],
              "character-me": [me, { reject: 'remote-error:401:0:{"error":"Unauthorized"}' }],
              "turn-status": [turn],
              "client-nav": [electionCapabilities],
              notifications: [inbox],
              "mail-inbox": [emptyMailInbox],
              "mail-sent": [emptyMailSent],
              "election-detail": [summary],
            },
          }).host
        }
        onExit={() => {}}
      />,
    );
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View race" }));
    expect(await screen.findByRole("article", { name: "Election detail" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("heading", { name: "Session expired" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Election detail" })).toBeNull();
    expect(screen.queryByRole("article", { name: "Standing" })).toBeNull();
  });
});
