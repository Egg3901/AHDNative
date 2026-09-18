/**
 * MP Standing capability audit (#359/#510).
 *
 * The authoritative client-nav card carries five capabilities (corporation,
 * union, active election, cabinet, governor). Reference (public
 * Egg3901/AHDGame, current main):
 * - `profileNavItems.ts`: My Corporation -> `/corporation/[id]` (shown with
 *   `myCorporationId`), My Union -> `/unions/[id]` (shown with
 *   `unionsEnabled` + `myUnionId`);
 * - `Navbar.tsx` / `ExperimentalMobileMenu.tsx` state rows: My election ->
 *   `/elections/[seatId ?? id]`, cabinet ->
 *   `/country/[cc]/executive/cabinet/[positionId]/office`, governor ->
 *   `/country/[cc]/region/[stateId]/office`.
 * None of those reads is allowlisted (`src/mp/endpoints.ts`,
 * `src-tauri/src/mp_session.rs`) and none has a Native MP surface, so every
 * row stays display-only: absent navigation, never an inert control, never a
 * route into local SP state. Rendered at 320px, 390px, and desktop.
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

const fullCapabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterName: "Ada",
  characterCountryId: "US",
  unreadMailCount: 0,
  myCorporationId: 42,
  myUnionId: "union-7",
  activeElection: { id: "e1", label: "President · US" },
  cabinetOffice: { positionId: "sec-state", positionName: "Secretary of State", countryCode: "us" },
  governorOffice: { stateId: "CA", stateName: "California", countryCode: "us" },
});

const bareCapabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterName: "Ada",
  characterCountryId: "US",
  unreadMailCount: 0,
});

const electionOnlyCapabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterName: "Ada",
  characterCountryId: "US",
  unreadMailCount: 0,
  activeElection: { id: "e1", seatId: "seat-9", label: "President · US" },
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
      fetch: async (op: string) => {
        calls.push(`fetch:${op}`);
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

function readyScript(capabilities: string = fullCapabilities): Script {
  return {
    fetch: {
      "auth-session": [probe],
      "character-me": [me],
      "turn-status": [turn],
      "client-nav": [capabilities],
      notifications: [inbox],
      "mail-inbox": [emptyMailInbox],
      "mail-sent": [emptyMailSent],
    },
  };
}

describe.each([320, 390, 1280])("MP Standing capabilities at %spx (#359/#510)", (width) => {
  it("renders available capabilities as display-only facts with no controls", async () => {
    setViewport(width);
    render(<MpModeScreen host={fakeHost(readyScript()).host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    expect(within(standing).getByText("Corporation")).toBeInTheDocument();
    expect(within(standing).getByText("#42")).toBeInTheDocument();
    expect(within(standing).getByText("union-7")).toBeInTheDocument();
    expect(within(standing).getByText("President · US")).toBeInTheDocument();
    expect(within(standing).getByText("Secretary of State")).toBeInTheDocument();
    expect(within(standing).getByText("California")).toBeInTheDocument();
    // Absent navigation: no links, no buttons, no live-site paths. Nothing
    // here may look actionable or route into local SP state.
    expect(standing.querySelector("a")).toBeNull();
    expect(standing.querySelector("button")).toBeNull();
    expect(standing.textContent).not.toMatch(/\/corporation|\/unions|\/elections|\/country\//);
  });

  it("states absent capabilities honestly and invents no rows", async () => {
    setViewport(width);
    render(<MpModeScreen host={fakeHost(readyScript(bareCapabilities)).host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    expect(within(standing).getByText(/No offices, candidacies/)).toBeInTheDocument();
    for (const absent of ["Corporation", "Union", "Election", "Cabinet", "Governor"]) {
      expect(within(standing).queryByText(absent)).toBeNull();
    }
    expect(standing.querySelector("a")).toBeNull();
    expect(standing.querySelector("button")).toBeNull();
  });

  it("renders a partial capability without inventing sibling rows", async () => {
    setViewport(width);
    render(<MpModeScreen host={fakeHost(readyScript(electionOnlyCapabilities)).host} onExit={() => {}} />);
    const standing = await screen.findByRole("article", { name: "Standing" });
    expect(within(standing).getByText("Election")).toBeInTheDocument();
    expect(within(standing).getByText("President · US")).toBeInTheDocument();
    for (const absent of ["Corporation", "Union", "Cabinet", "Governor"]) {
      expect(within(standing).queryByText(absent)).toBeNull();
    }
    expect(standing.querySelector("a")).toBeNull();
    expect(standing.querySelector("button")).toBeNull();
  });

  it("keeps section navigation and the back-to-sections return live", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<MpModeScreen host={fakeHost(readyScript()).host} onExit={() => {}} />);
    await screen.findByRole("article", { name: "Standing" });
    const sections = screen.getByRole("navigation", { name: "Multiplayer sections" });
    await user.click(within(sections).getByRole("button", { name: "Actions" }));
    expect(window.location.hash).toBe("#mp-actions");
    await user.click(within(sections).getByRole("button", { name: "Status" }));
    expect(window.location.hash).toBe("#mp-profile");
    const backs = screen.getAllByRole("button", { name: "Back to sections" });
    expect(backs.length).toBeGreaterThan(0);
    await user.click(backs[0]);
    expect(window.location.hash).toBe("#mp-top");
  });

  it("evicts standing on auth expiry and restores it on reconnect", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(
      <MpModeScreen
        host={
          fakeHost({
            fetch: {
              "auth-session": [probe, probe, probe],
              "character-me": [me, { reject: 'remote-error:401:0:{"error":"Unauthorized"}' }, me],
              "turn-status": [turn, turn],
              "client-nav": [fullCapabilities, fullCapabilities],
              notifications: [inbox, inbox],
              "mail-inbox": [emptyMailInbox, emptyMailInbox],
              "mail-sent": [emptyMailSent, emptyMailSent],
            },
          }).host
        }
        onExit={() => {}}
      />,
    );
    expect(await screen.findByRole("article", { name: "Standing" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    // Expiry evicts every authed projection: no stale corporation, union,
    // election, cabinet, or governor row may survive.
    expect(await screen.findByRole("heading", { name: "Session expired" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Standing" })).toBeNull();
    expect(screen.queryByText("#42")).toBeNull();
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue with Discord" }));
    const restored = await screen.findByRole("article", { name: "Standing" });
    expect(within(restored).getByText("#42")).toBeInTheDocument();
    expect(within(restored).getByText("Secretary of State")).toBeInTheDocument();
  });

  it("keeps standing intact on a server refusal", async () => {
    setViewport(width);
    const user = userEvent.setup();
    const { host, calls } = fakeHost({
      fetch: readyScript().fetch,
      mutate: { "execute-action": [{ reject: 'remote-error:403:0:{"error":"Automated access is not permitted for this endpoint."}' }] },
    });
    render(<MpModeScreen host={host} onExit={() => {}} />);
    await screen.findByRole("article", { name: "Standing" });
    await user.click(screen.getByRole("button", { name: /Rest/ }));
    // The server message is the whole story; the previously loaded standing
    // stands and no refresh is claimed.
    expect(await screen.findByRole("alert")).toHaveTextContent("Automated access is not permitted");
    const standing = screen.getByRole("article", { name: "Standing" });
    expect(within(standing).getByText("#42")).toBeInTheDocument();
    expect(calls.filter((call) => call.startsWith("fetch:character-me"))).toHaveLength(1);
  });

  it("reports malformed capabilities honestly without stale rows", async () => {
    setViewport(width);
    render(
      <MpModeScreen
        host={
          fakeHost({
            fetch: {
              "auth-session": [probe],
              "character-me": [me],
              "turn-status": [turn],
              "client-nav": [JSON.stringify({ user: { id: USER, username: "Ada" }, characterName: "Ada" })],
              notifications: [inbox],
            },
          }).host
        }
        onExit={() => {}}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("capabilities record answered in an unexpected shape");
    expect(screen.queryByRole("article", { name: "Standing" })).toBeNull();
    expect(screen.queryByText("#42")).toBeNull();
  });
});
