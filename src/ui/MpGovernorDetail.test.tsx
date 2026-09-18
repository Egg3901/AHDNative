/**
 * MP governor office drill-in (#359 governor slice, #510).
 *
 * Standing's governor row offers a real destination: the audited public
 * GET /api/country/[code]/region/[id]/officials read (country-plus-state
 * pair from client-nav `governorOffice`) behind a View governorship
 * control. The panel opens only with a loaded roster, shows state
 * identity plus the office holder only, and returns to Standing via Back
 * to Standing. An invalid or half-valid pair keeps the row display-only;
 * a seat with no governor record (or a redacted holder) names no holder;
 * failures keep Standing intact; expiry closes the panel. Rendered at
 * 320px, 390px, and desktop.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
const inbox = JSON.stringify({
  notifications: [{ _id: NOTE, title: "Turn processed", message: "Done", read: false }],
  unreadCount: 1,
  total: 1,
  hasMore: false,
});
const emptyMailInbox = JSON.stringify({ mails: [], unreadCount: 0, total: 0, hasMore: false });
const emptyMailSent = JSON.stringify({ mails: [], total: 0, hasMore: false });

const governorCapabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterName: "Ada",
  characterCountryId: "US",
  unreadMailCount: 0,
  governorOffice: { stateId: "CA", stateName: "California", countryCode: "us" },
});

const invalidGovernorCapabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterName: "Ada",
  characterCountryId: "US",
  unreadMailCount: 0,
  governorOffice: { stateId: "C-A", stateName: "California", countryCode: "us" },
});

const roster = JSON.stringify({
  state: "CA",
  stateName: "California",
  countryId: "US",
  officials: {
    senators: [],
    governor: {
      officeType: "governor",
      state: "CA",
      characterId: "507f1f77bcf86cd799439011",
      characterName: "Ada",
      party: "3",
    },
    houseRepresentatives: [],
    stateSenators: [],
    mps: [],
  },
});

const vacantRoster = JSON.stringify({
  state: "CA",
  stateName: "California",
  countryId: "US",
  officials: {},
});

const redactedRoster = JSON.stringify({
  state: "CA",
  stateName: "California",
  countryId: "US",
  officials: {
    governor: { officeType: "governor", state: "CA", characterId: null },
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
      fetch: async (
        op: string,
        limit?: number,
        offset?: number,
        electionId?: string,
        corporationId?: string,
        unionId?: string,
        cabinetCountryCode?: string,
        cabinetPositionId?: string,
        governorCountryCode?: string,
        governorStateId?: string,
      ) => {
        calls.push(`fetch:${op}:${limit ?? ""}:${offset ?? ""}:${electionId ?? ""}:${corporationId ?? ""}:${unionId ?? ""}:${cabinetCountryCode ?? ""}:${cabinetPositionId ?? ""}:${governorCountryCode ?? ""}:${governorStateId ?? ""}`);
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

function readyScript(capabilities: string = governorCapabilities, detailBodies: Array<string | { reject: string }> = [roster]): Script {
  return {
    fetch: {
      "auth-session": [probe],
      "character-me": [me],
      "turn-status": [turn],
      "client-nav": [capabilities],
      notifications: [inbox],
      "mail-inbox": [emptyMailInbox],
      "mail-sent": [emptyMailSent],
      "governor-detail": detailBodies,
    },
  };
}

describe.each([320, 390, 1280])("MP governor office drill-in at %spx (#359)", (width) => {
  it("opens the authoritative roster from Standing and returns to it", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host, calls } = fakeHost(readyScript());
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    // No roster fetch on enter: the drill-in is on demand.
    expect(calls.some((call) => call.startsWith("fetch:governor-detail"))).toBe(false);
    // Election, corporation, union, and cabinet panels stay shut: this drill-in is governor-only.
    expect(screen.queryByRole("article", { name: "Election detail" })).toBeNull();
    expect(screen.queryByRole("article", { name: "Corporation detail" })).toBeNull();
    expect(screen.queryByRole("article", { name: "Union detail" })).toBeNull();
    expect(screen.queryByRole("article", { name: "Cabinet detail" })).toBeNull();
    const view = within(standing).getByRole("button", { name: "View governorship" });
    await user.click(view);
    const panel = await screen.findByRole("article", { name: "Governor detail" });
    // The Standing pair is requested in the governor slots, never the
    // election, corporation, union, or cabinet slots.
    expect(calls.some((call) => call === "fetch:governor-detail::::::::us:CA")).toBe(true);
    expect(within(panel).getByText("California")).toBeInTheDocument();
    expect(within(panel).getByText("governor")).toBeInTheDocument();
    expect(within(panel).getByText("Ada")).toBeInTheDocument();
    // The stored party key is unresolved server-side in this endpoint, so
    // it stays server-side: no raw key may surface.
    expect(panel.textContent).not.toMatch(/"3"|\bparty\b/i);
    expect(panel.querySelector("a")).toBeNull();
    expect(panel.textContent).not.toMatch(/\/elections|\/corporation|\/unions|\/country\//);
    await user.click(screen.getByRole("button", { name: "Back to Standing" }));
    expect(window.location.hash).toBe("#mp-profile");
    expect(screen.queryByRole("article", { name: "Governor detail" })).toBeNull();
    expect(screen.getByRole("article", { name: "Standing" })).toBeInTheDocument();
  });

  it("keeps an invalid governor pair display-only with no request", async () => {
    setViewport(width);
    const { host, calls } = fakeHost(readyScript(invalidGovernorCapabilities, []));
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    expect(within(standing).queryByRole("button", { name: "View governorship" })).toBeNull();
    expect(calls.some((call) => call.startsWith("fetch:governor-detail"))).toBe(false);
    expect(screen.queryByRole("article", { name: "Governor detail" })).toBeNull();
  });

  it("reports a malformed roster honestly with Standing intact", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host, calls } = fakeHost(readyScript(governorCapabilities, ["{oops"]));
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View governorship" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("governor roster");
    expect(screen.queryByRole("article", { name: "Governor detail" })).toBeNull();
    expect(screen.getByRole("article", { name: "Standing" })).toBeInTheDocument();
    expect(calls.filter((call) => call.startsWith("fetch:character-me"))).toHaveLength(1);
  });

  it("reports a missing state honestly with Standing intact", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host } = fakeHost(
      readyScript(governorCapabilities, [{ reject: 'remote-error:404:0:{"error":"State not found"}' }]),
    );
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View governorship" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("State not found");
    expect(screen.queryByRole("article", { name: "Governor detail" })).toBeNull();
    expect(screen.getByRole("article", { name: "Standing" })).toBeInTheDocument();
  });

  it("names no holder on a vacant seat", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host } = fakeHost(readyScript(governorCapabilities, [vacantRoster]));
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View governorship" }));
    const panel = await screen.findByRole("article", { name: "Governor detail" });
    expect(within(panel).getByText("California")).toBeInTheDocument();
    expect(within(panel).getByText("Vacant or undisclosed")).toBeInTheDocument();
  });

  it("names no holder for a redacted holder record", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host } = fakeHost(readyScript(governorCapabilities, [redactedRoster]));
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View governorship" }));
    const panel = await screen.findByRole("article", { name: "Governor detail" });
    expect(within(panel).getByText("governor")).toBeInTheDocument();
    expect(within(panel).getByText("Vacant or undisclosed")).toBeInTheDocument();
  });

  it("closes the open panel on auth expiry instead of showing a stale office", async () => {
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
              "client-nav": [governorCapabilities],
              notifications: [inbox],
              "mail-inbox": [emptyMailInbox],
              "mail-sent": [emptyMailSent],
              "governor-detail": [roster],
            },
          }).host
        }
        onExit={() => {}}
      />,
    );
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View governorship" }));
    expect(await screen.findByRole("article", { name: "Governor detail" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("heading", { name: "Session expired" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Governor detail" })).toBeNull();
    expect(screen.queryByRole("article", { name: "Standing" })).toBeNull();
  });
});
