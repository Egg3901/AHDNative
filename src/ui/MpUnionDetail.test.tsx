/**
 * MP union detail drill-in (#359 union slice).
 *
 * Standing's union row offers a real destination: the audited public
 * GET /api/unions/[id] read (strict 24-hex ObjectId from client-nav
 * `myUnionId`) behind a View union control. The panel opens only with a
 * loaded summary, shows identity, leadership, and scale, and returns to
 * Standing via Back to Standing. An invalid reference keeps the row
 * display-only; failures keep Standing intact; expiry closes the panel.
 * Rendered at 320px, 390px, and desktop.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MpModeScreen } from "./MpModeScreen";
import type { MpBridgeHost } from "../mp/bridge";

const USER = "507f1f77bcf86cd799439011";
const NOTE = "607f1f77bcf86cd799439011";
const HEX_ID = "68a000000000000000000001";

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

const unionCapabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterName: "Ada",
  characterCountryId: "US",
  unreadMailCount: 0,
  myUnionId: HEX_ID,
});

const invalidUnionCapabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterName: "Ada",
  characterCountryId: "US",
  unreadMailCount: 0,
  myUnionId: "not-a-union",
});

const detail = JSON.stringify({
  union: {
    id: HEX_ID,
    name: "Amalgamated Millhands",
    countryId: "US",
    countryName: "United States",
    sectorType: "manufacturing",
    sectorLabel: "Manufacturing",
    ownerId: USER,
    electionOpen: false,
    members: 1200,
    approval: 62,
    treasury: 4500,
    suspended: false,
  },
  sectors: [{}, {}],
  workforce: { unionizedWorkers: 1200 },
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
      ) => {
        calls.push(`fetch:${op}:${limit ?? ""}:${offset ?? ""}:${electionId ?? ""}:${corporationId ?? ""}:${unionId ?? ""}`);
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

function readyScript(capabilities: string = unionCapabilities, detailBodies: Array<string | { reject: string }> = [detail]): Script {
  return {
    fetch: {
      "auth-session": [probe],
      "character-me": [me],
      "turn-status": [turn],
      "client-nav": [capabilities],
      notifications: [inbox],
      "mail-inbox": [emptyMailInbox],
      "mail-sent": [emptyMailSent],
      "union-detail": detailBodies,
    },
  };
}

describe.each([320, 390, 1280])("MP union detail drill-in at %spx (#359)", (width) => {
  it("opens the authoritative summary from Standing and returns to it", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host, calls } = fakeHost(readyScript());
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    // No detail fetch on enter: the drill-in is on demand.
    expect(calls.some((call) => call.startsWith("fetch:union-detail"))).toBe(false);
    // Election and corporation panels stay shut: this drill-in is union-only.
    expect(screen.queryByRole("article", { name: "Election detail" })).toBeNull();
    expect(screen.queryByRole("article", { name: "Corporation detail" })).toBeNull();
    const view = within(standing).getByRole("button", { name: "View union" });
    await user.click(view);
    const panel = await screen.findByRole("article", { name: "Union detail" });
    // The Standing union id is requested in the union slot, never the
    // election or corporation slots.
    expect(calls.some((call) => call === `fetch:union-detail:::::${HEX_ID}`)).toBe(true);
    expect(within(panel).getByText("Amalgamated Millhands")).toBeInTheDocument();
    expect(within(panel).getByText("Manufacturing")).toBeInTheDocument();
    expect(within(panel).getByText("United States")).toBeInTheDocument();
    expect(within(panel).getByText("Settled")).toBeInTheDocument();
    expect(within(panel).getByText("1200")).toBeInTheDocument();
    expect(within(panel).getByText("2 sectors")).toBeInTheDocument();
    expect(panel.querySelector("a")).toBeNull();
    expect(panel.textContent).not.toMatch(/\/elections|\/corporation|\/unions|\/country\//);
    await user.click(screen.getByRole("button", { name: "Back to Standing" }));
    expect(window.location.hash).toBe("#mp-profile");
    expect(screen.queryByRole("article", { name: "Union detail" })).toBeNull();
    expect(screen.getByRole("article", { name: "Standing" })).toBeInTheDocument();
  });

  it("keeps an invalid union reference display-only with no request", async () => {
    setViewport(width);
    const { host, calls } = fakeHost(readyScript(invalidUnionCapabilities, []));
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    expect(within(standing).queryByRole("button", { name: "View union" })).toBeNull();
    expect(calls.some((call) => call.startsWith("fetch:union-detail"))).toBe(false);
    expect(screen.queryByRole("article", { name: "Union detail" })).toBeNull();
  });

  it("reports a malformed detail honestly with Standing intact", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host, calls } = fakeHost(readyScript(unionCapabilities, ["{oops"]));
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View union" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("union record");
    expect(screen.queryByRole("article", { name: "Union detail" })).toBeNull();
    expect(screen.getByRole("article", { name: "Standing" })).toBeInTheDocument();
    expect(calls.filter((call) => call.startsWith("fetch:character-me"))).toHaveLength(1);
  });

  it("reports a gone union honestly with Standing intact", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host } = fakeHost(
      readyScript(unionCapabilities, [{ reject: 'remote-error:404:0:{"error":"Union not found"}' }]),
    );
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View union" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Union not found");
    expect(screen.queryByRole("article", { name: "Union detail" })).toBeNull();
    expect(screen.getByRole("article", { name: "Standing" })).toBeInTheDocument();
  });

  it("closes the open panel on auth expiry instead of showing a stale union", async () => {
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
              "client-nav": [unionCapabilities],
              notifications: [inbox],
              "mail-inbox": [emptyMailInbox],
              "mail-sent": [emptyMailSent],
              "union-detail": [detail],
            },
          }).host
        }
        onExit={() => {}}
      />,
    );
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View union" }));
    expect(await screen.findByRole("article", { name: "Union detail" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("heading", { name: "Session expired" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Union detail" })).toBeNull();
    expect(screen.queryByRole("article", { name: "Standing" })).toBeNull();
  });
});
