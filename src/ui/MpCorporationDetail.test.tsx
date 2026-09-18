/**
 * MP corporation detail drill-in (#359 corporation slice).
 *
 * Standing's corporation row offers a real destination: the audited public
 * GET /api/corporations/[id] read (sequential id from client-nav
 * `myCorporationId`, or a 24-hex ObjectId) behind a View company control.
 * The panel opens only with a loaded summary, shows identity, leadership,
 * and scale, and returns to Standing via Back to Standing. An invalid
 * reference keeps the row display-only; failures keep Standing intact;
 * expiry closes the panel. Rendered at 320px, 390px, and desktop.
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

const corporationCapabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterName: "Ada",
  characterCountryId: "US",
  unreadMailCount: 0,
  myCorporationId: 42,
});

const detail = JSON.stringify({
  corporation: {
    _id: HEX_ID,
    sequentialId: 42,
    name: "Acme Consolidated",
    tickerSymbol: "ACME",
    typeLabel: "Industrial",
    headquartersStateName: "Pennsylvania",
    countryId: "US",
  },
  ceo: { name: "Ada", sequentialId: 9 },
  sectors: [{}, {}],
  isPrivate: false,
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
      fetch: async (op: string, limit?: number, offset?: number, electionId?: string, corporationId?: string) => {
        calls.push(`fetch:${op}:${limit ?? ""}:${offset ?? ""}:${electionId ?? ""}:${corporationId ?? ""}`);
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

function readyScript(capabilities: string = corporationCapabilities, detailBodies: Array<string | { reject: string }> = [detail]): Script {
  return {
    fetch: {
      "auth-session": [probe],
      "character-me": [me],
      "turn-status": [turn],
      "client-nav": [capabilities],
      notifications: [inbox],
      "mail-inbox": [emptyMailInbox],
      "mail-sent": [emptyMailSent],
      "corporation-detail": detailBodies,
    },
  };
}

describe.each([320, 390, 1280])("MP corporation detail drill-in at %spx (#359)", (width) => {
  it("opens the authoritative summary from Standing and returns to it", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host, calls } = fakeHost(readyScript());
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    // No detail fetch on enter: the drill-in is on demand.
    expect(calls.some((call) => call.startsWith("fetch:corporation-detail"))).toBe(false);
    const view = within(standing).getByRole("button", { name: "View company" });
    await user.click(view);
    const panel = await screen.findByRole("article", { name: "Corporation detail" });
    // The Standing sequential id is requested.
    expect(calls.some((call) => call === "fetch:corporation-detail::::42")).toBe(true);
    expect(within(panel).getByText("Acme Consolidated")).toBeInTheDocument();
    expect(within(panel).getByText("ACME")).toBeInTheDocument();
    expect(within(panel).getByText("Industrial")).toBeInTheDocument();
    expect(within(panel).getByText("Pennsylvania")).toBeInTheDocument();
    expect(within(panel).getByText("Ada")).toBeInTheDocument();
    expect(within(panel).getByText("2 sectors")).toBeInTheDocument();
    expect(panel.querySelector("a")).toBeNull();
    expect(panel.textContent).not.toMatch(/\/elections|\/corporation|\/unions|\/country\//);
    await user.click(screen.getByRole("button", { name: "Back to Standing" }));
    expect(window.location.hash).toBe("#mp-profile");
    expect(screen.queryByRole("article", { name: "Corporation detail" })).toBeNull();
    expect(screen.getByRole("article", { name: "Standing" })).toBeInTheDocument();
  });

  it("reports a malformed detail honestly with Standing intact", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host, calls } = fakeHost(readyScript(corporationCapabilities, ["{oops"]));
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View company" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("corporation record");
    expect(screen.queryByRole("article", { name: "Corporation detail" })).toBeNull();
    expect(screen.getByRole("article", { name: "Standing" })).toBeInTheDocument();
    expect(calls.filter((call) => call.startsWith("fetch:character-me"))).toHaveLength(1);
  });

  it("closes the open panel on auth expiry instead of showing a stale company", async () => {
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
              "client-nav": [corporationCapabilities],
              notifications: [inbox],
              "mail-inbox": [emptyMailInbox],
              "mail-sent": [emptyMailSent],
              "corporation-detail": [detail],
            },
          }).host
        }
        onExit={() => {}}
      />,
    );
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View company" }));
    expect(await screen.findByRole("article", { name: "Corporation detail" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("heading", { name: "Session expired" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Corporation detail" })).toBeNull();
    expect(screen.queryByRole("article", { name: "Standing" })).toBeNull();
  });
});
