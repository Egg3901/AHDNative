/**
 * MP cabinet briefing drill-in (#359 cabinet slice, #510).
 *
 * Standing's cabinet row offers a real destination: the audited public
 * GET /api/country/[code]/executive/cabinet/[positionId]/briefing read
 * (country-plus-seat pair from client-nav `cabinetOffice`) behind a View
 * office control. The panel opens only with a loaded briefing, shows the
 * letterhead plus roster facts only, and returns to Standing via Back to
 * Standing. An invalid or half-valid pair keeps the row display-only; a
 * withheld office shows restriction titles instead of departmental record;
 * a vacant seat names no holder; failures keep Standing intact; expiry
 * closes the panel. The governor row stays display-only: no audited JSON
 * endpoint exists for it. Rendered at 320px, 390px, and desktop.
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

const cabinetCapabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterName: "Ada",
  characterCountryId: "US",
  unreadMailCount: 0,
  cabinetOffice: { positionId: "secretary_of_state", positionName: "Secretary of State", countryCode: "us" },
});

const invalidCabinetCapabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterName: "Ada",
  characterCountryId: "US",
  unreadMailCount: 0,
  cabinetOffice: { positionId: "secretary-of-state", positionName: "Secretary of State", countryCode: "us" },
});

const briefing = JSON.stringify({
  canView: true,
  canAct: true,
  liveYear: 1862,
  position: { id: "secretary_of_state", name: "Secretary of State", department: "State" },
  member: { characterName: "Ada", partyName: "Labor", acting: false, actingExpiresOnTurn: null },
});

const withheldBriefing = JSON.stringify({
  canView: false,
  canAct: false,
  liveYear: 1862,
  position: { id: "secretary_of_state", name: "Secretary of State", department: "State" },
  member: { characterName: "Ada", partyName: "Labor", acting: true, actingExpiresOnTurn: 14 },
  restriction: { allowedTitles: ["President", "Vice President"], countryName: "United States" },
});

const vacantBriefing = JSON.stringify({
  canView: true,
  canAct: false,
  liveYear: 1862,
  position: { id: "secretary_of_state", name: "Secretary of State", department: "State" },
  member: null,
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
      ) => {
        calls.push(`fetch:${op}:${limit ?? ""}:${offset ?? ""}:${electionId ?? ""}:${corporationId ?? ""}:${unionId ?? ""}:${cabinetCountryCode ?? ""}:${cabinetPositionId ?? ""}`);
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

function readyScript(capabilities: string = cabinetCapabilities, detailBodies: Array<string | { reject: string }> = [briefing]): Script {
  return {
    fetch: {
      "auth-session": [probe],
      "character-me": [me],
      "turn-status": [turn],
      "client-nav": [capabilities],
      notifications: [inbox],
      "mail-inbox": [emptyMailInbox],
      "mail-sent": [emptyMailSent],
      "cabinet-detail": detailBodies,
    },
  };
}

describe.each([320, 390, 1280])("MP cabinet briefing drill-in at %spx (#359)", (width) => {
  it("opens the authoritative briefing from Standing and returns to it", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host, calls } = fakeHost(readyScript());
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    // No briefing fetch on enter: the drill-in is on demand.
    expect(calls.some((call) => call.startsWith("fetch:cabinet-detail"))).toBe(false);
    // Election, corporation, and union panels stay shut: this drill-in is cabinet-only.
    expect(screen.queryByRole("article", { name: "Election detail" })).toBeNull();
    expect(screen.queryByRole("article", { name: "Corporation detail" })).toBeNull();
    expect(screen.queryByRole("article", { name: "Union detail" })).toBeNull();
    const view = within(standing).getByRole("button", { name: "View office" });
    await user.click(view);
    const panel = await screen.findByRole("article", { name: "Cabinet detail" });
    // The Standing pair is requested in the cabinet slots, never the
    // election, corporation, or union slots.
    expect(calls.some((call) => call === "fetch:cabinet-detail::::::us:secretary_of_state")).toBe(true);
    expect(within(panel).getByText("Secretary of State")).toBeInTheDocument();
    expect(within(panel).getByText("State")).toBeInTheDocument();
    expect(within(panel).getByText("Ada")).toBeInTheDocument();
    expect(within(panel).getByText("Labor")).toBeInTheDocument();
    expect(within(panel).getByText("Substantive")).toBeInTheDocument();
    expect(panel.querySelector("a")).toBeNull();
    expect(panel.textContent).not.toMatch(/\/elections|\/corporation|\/unions|\/country\//);
    await user.click(screen.getByRole("button", { name: "Back to Standing" }));
    expect(window.location.hash).toBe("#mp-profile");
    expect(screen.queryByRole("article", { name: "Cabinet detail" })).toBeNull();
    expect(screen.getByRole("article", { name: "Standing" })).toBeInTheDocument();
  });

  it("keeps an invalid cabinet pair display-only with no request", async () => {
    setViewport(width);
    const { host, calls } = fakeHost(readyScript(invalidCabinetCapabilities, []));
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    expect(within(standing).queryByRole("button", { name: "View office" })).toBeNull();
    expect(calls.some((call) => call.startsWith("fetch:cabinet-detail"))).toBe(false);
    expect(screen.queryByRole("article", { name: "Cabinet detail" })).toBeNull();
  });

  it("reports a malformed briefing honestly with Standing intact", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host, calls } = fakeHost(readyScript(cabinetCapabilities, ["{oops"]));
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View office" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("cabinet briefing");
    expect(screen.queryByRole("article", { name: "Cabinet detail" })).toBeNull();
    expect(screen.getByRole("article", { name: "Standing" })).toBeInTheDocument();
    expect(calls.filter((call) => call.startsWith("fetch:character-me"))).toHaveLength(1);
  });

  it("reports a gone seat honestly with Standing intact", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host } = fakeHost(
      readyScript(cabinetCapabilities, [{ reject: 'remote-error:404:0:{"error":"Unknown cabinet position"}' }]),
    );
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View office" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unknown cabinet position");
    expect(screen.queryByRole("article", { name: "Cabinet detail" })).toBeNull();
    expect(screen.getByRole("article", { name: "Standing" })).toBeInTheDocument();
  });

  it("shows a withheld office with roster facts plus titles, never departmental record", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host } = fakeHost(readyScript(cabinetCapabilities, [withheldBriefing]));
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View office" }));
    const panel = await screen.findByRole("article", { name: "Cabinet detail" });
    expect(within(panel).getByText("Secretary of State")).toBeInTheDocument();
    expect(within(panel).getByText("Ada")).toBeInTheDocument();
    expect(within(panel).getByText("Acting until turn 14")).toBeInTheDocument();
    expect(within(panel).getByText("President, Vice President · United States")).toBeInTheDocument();
  });

  it("names no holder on a vacant seat", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host } = fakeHost(readyScript(cabinetCapabilities, [vacantBriefing]));
    render(<MpModeScreen host={host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View office" }));
    const panel = await screen.findByRole("article", { name: "Cabinet detail" });
    expect(within(panel).getByText("Vacant")).toBeInTheDocument();
    expect(within(panel).getByText("Read-only: you may view this office but not work it")).toBeInTheDocument();
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
              "client-nav": [cabinetCapabilities],
              notifications: [inbox],
              "mail-inbox": [emptyMailInbox],
              "mail-sent": [emptyMailSent],
              "cabinet-detail": [briefing],
            },
          }).host
        }
        onExit={() => {}}
      />,
    );
    const standing = await screen.findByRole("article", { name: "Standing" });
    await user.click(within(standing).getByRole("button", { name: "View office" }));
    expect(await screen.findByRole("article", { name: "Cabinet detail" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("heading", { name: "Session expired" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Cabinet detail" })).toBeNull();
    expect(screen.queryByRole("article", { name: "Standing" })).toBeNull();
  });
});
