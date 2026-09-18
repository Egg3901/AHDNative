/**
 * MP Standing drill-in exclusivity (#510/#359 state-preserving navigation).
 *
 * The five Standing drill-ins (election, corporation, union, cabinet,
 * governor) share one slot below the profile section, matching the SP
 * single-detail model. Opening a second drill-in closes the first, so two
 * detail articles (and two "Back to Standing" buttons) never stack; Back
 * returns to Standing with no detail left open. Rendered at phone (390px)
 * and desktop (1280px) widths.
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

const bothCapabilities = JSON.stringify({
  user: { id: USER, username: "Ada", isAdmin: false },
  hasCharacter: true,
  characterName: "Ada",
  characterCountryId: "US",
  unreadMailCount: 0,
  activeElection: { id: HEX_ID, seatId: SEAT_ID, label: "Senate · PA" },
  myCorporationId: 42,
});

const electionSummary = JSON.stringify({
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

const corporationDetail = JSON.stringify({
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
}

function fakeHost(script: Script): MpBridgeHost {
  const queues = new Map<string, Array<string | { reject: string }>>();
  for (const [op, items] of Object.entries(script.fetch ?? {})) queues.set(`fetch:${op}`, [...items]);
  return {
    fetch: async (op: string) => {
      const item = queues.get(`fetch:${op}`)?.shift();
      if (typeof item === "string") return item;
      if (item) throw new Error(item.reject);
      if (op === "client-nav") return JSON.stringify({ user: null, hasCharacter: false });
      throw new Error(`unexpected fetch ${op}`);
    },
    mutate: async () => {
      throw new Error("unexpected mutate");
    },
    beginSignIn: async () => {},
  };
}

describe.each([390, 1280])("MP drill-in exclusivity at %spx (#510)", (width) => {
  it("opening a second drill-in closes the first; Back leaves no detail open", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(
      <MpModeScreen
        host={fakeHost({
          fetch: {
            "auth-session": [probe],
            "character-me": [me],
            "turn-status": [turn],
            "client-nav": [bothCapabilities],
            notifications: [inbox],
            "mail-inbox": [emptyMailInbox],
            "mail-sent": [emptyMailSent],
            "election-detail": [electionSummary],
            "corporation-detail": [corporationDetail],
          },
        })}
        onExit={() => {}}
      />,
    );
    const standing = await screen.findByRole("article", { name: "Standing" });

    await user.click(within(standing).getByRole("button", { name: "View race" }));
    await screen.findByRole("article", { name: "Election detail" });

    // The second drill-in takes the single detail slot: the first closes.
    await user.click(within(standing).getByRole("button", { name: "View company" }));
    await screen.findByRole("article", { name: "Corporation detail" });
    expect(screen.queryByRole("article", { name: "Election detail" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Back to Standing" })).toHaveLength(1);

    // Back returns to Standing with no detail left open.
    await user.click(screen.getByRole("button", { name: "Back to Standing" }));
    expect(window.location.hash).toBe("#mp-profile");
    expect(screen.queryByRole("article", { name: "Election detail" })).toBeNull();
    expect(screen.queryByRole("article", { name: "Corporation detail" })).toBeNull();
    expect(screen.getByRole("article", { name: "Standing" })).toBeInTheDocument();
  });
});
