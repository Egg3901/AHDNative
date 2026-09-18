/**
 * #80 corporation detail return path (SP).
 *
 * The Profile corporation card ("View company") and the drawer "My
 * Corporation" identity row both open the Markets company detail for the
 * recorded player-owned sector asset. That entry must carry a return frame
 * so the shell offers Back to the surface that opened it; landing without
 * one strands the player on the market list with no way back to Profile.
 * Rendered at 320px, 390px, and desktop width.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameSession } from "../game/session";
import { GameScreen } from "./GameScreen";
import { MENU_GROUPS } from "./MobileNavigation";
import { DEFAULT_PREFERENCES } from "../preferences";

const OPTIONS = { era: "1953", countryId: "US", seed: "native-corp-return-80", playerName: "Alex" };
const SAVED_AT = "2026-09-18T00:00:00.000Z";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.dispatchEvent(new Event("resize"));
}

/** A live owner session through the public sector-acquisition flow. */
function owningSession(): GameSession {
  const session = new GameSession();
  session.create(OPTIONS);
  expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
  const assetId = session.markets().listings.find((entry) => entry.id === "US-media")!.sectorAsset.id;
  const listed = session.listSectorForSale(assetId);
  expect(listed.ok).toBe(true);
  const raw = JSON.parse(session.serialize(SAVED_AT));
  raw.world.player.cash = listed.ok ? listed.priceAnchor : 0;
  const funded = new GameSession();
  funded.load(JSON.stringify(raw));
  expect(funded.buySectorForSale(assetId).ok).toBe(true);
  return funded;
}

const searchFn = async (query: string) =>
  query.trim() === ""
    ? { query, results: [], total: 0, facets: { kinds: [], countries: [], regions: [] } }
    : {
        query,
        results: [
          { kind: "election" as const, id: "e1", title: "General Election", description: "Election · active", countryId: "US" },
        ],
        total: 1,
        facets: { kinds: [], countries: [], regions: [] },
      };

function screenProps(session: GameSession) {
  const world = session.view();
  expect(world.myCorporation).not.toBeNull();
  expect(session.profile().corporations).toHaveLength(1);
  const unused = async (): Promise<never> => {
    throw new Error("unreached in this slice");
  };
  return {
    loadProfile: async () => session.profile(),
    search: searchFn,
    loadBondMarket: unused,
    loadRegions: unused,
    loadCaucusManagement: unused,
    loadPartyManagement: unused,
    loadMarkets: async () => session.markets(),
    loadLegislation: unused,
    loadWorldOverview: unused,
    loadPolitics: unused,
    world,
    busy: false,
    newsStorageKey: "corp-return-80",
    onAdvanceTurn: vi.fn(),
    onSave: vi.fn(),
    onExit: vi.fn(),
    onUpdateWorldFeatureFlags: vi.fn(),
    onAction: vi.fn(),
    preferences: DEFAULT_PREFERENCES,
    onPreferencesChange: vi.fn(),
    onUpdateProfile: vi.fn(async () => true),
    onSelectConstituency: vi.fn(async () => true),
    onMarkNotificationRead: vi.fn(),
    onDeleteNotification: vi.fn(),
    onMarkAllNotificationsRead: vi.fn(),
  };
}

/** Drawer reachability: bottom tabs first, then the menu dialog. */
async function gotoDrawer(user: ReturnType<typeof userEvent.setup>, label: string) {
  const primary = within(screen.getByRole("navigation", { name: "Primary" }));
  const direct = primary.queryByRole("button", { name: label });
  if (direct) {
    await user.click(direct);
    return;
  }
  await user.click(primary.getByRole("button", { name: "Menu" }));
  const menu = within(screen.getByRole("dialog", { name: "Game menu" }));
  let destination = menu.queryByRole("button", { name: label });
  if (!destination) {
    const collapsed = MENU_GROUPS.find((group) =>
      group.sections?.some((section) => section.items.some((item) => item.label === label)),
    );
    if (collapsed) {
      await user.click(menu.getByRole("button", { name: collapsed.label }));
      destination = menu.getByRole("button", { name: label });
    }
  }
  expect(destination).not.toBeNull();
  await user.click(destination!);
}

function corporationSection(): HTMLElement | null {
  return document.querySelector('section[aria-label="Corporation"]');
}

describe.each([320, 390, 1280])("corporation detail return at %spx (#80)", (width) => {
  it("returns from the Profile card company detail to Profile", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...screenProps(owningSession())} />);

    await user.click(await screen.findByRole("button", { name: /View company/ }));
    // The deep link lands on the company detail, not the list.
    expect(await screen.findByRole("button", { name: "Back to market list" })).toBeInTheDocument();
    // The shell carries the opener back, not just the list-internal control.
    const back = await screen.findByRole("button", { name: "Back to profile" });
    await user.click(back);
    expect(await screen.findByLabelText("Corporation")).toBeInTheDocument();
    expect(corporationSection()).not.toBeNull();
  });

  it("returns from the drawer My Corporation row to the opening surface", async () => {
    setViewport(width);
    const user = userEvent.setup();
    render(<GameScreen {...screenProps(owningSession())} />);
    expect(await screen.findByLabelText("Corporation")).toBeInTheDocument();

    await gotoDrawer(user, "Go to My Corporation");
    expect(await screen.findByRole("button", { name: "Back to market list" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Back to profile" }));
    expect(await screen.findByLabelText("Corporation")).toBeInTheDocument();
    expect(corporationSection()).not.toBeNull();
  });
});
