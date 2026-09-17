import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DEFAULT_PREFERENCES } from "../preferences";
import { DEFAULT_WORLD_FEATURE_FLAGS } from "@ahdclient/engine";
import { GameScreen } from "./GameScreen";
import type { FinanceView, GameView } from "../game/types";

/**
 * Footer transient status text on narrow phones: the async pending state and
 * the save notice must stay announced exactly once, and the copy must clamp
 * to two lines so a long message cannot grow the fixed footer past its 320px
 * height budget. Desktop behavior (main-region banner, single announcement)
 * is unchanged. jsdom performs no layout, so the clamp itself is pinned as a
 * CSS contract below.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

function makeFinance(overrides: Partial<FinanceView> = {}): FinanceView {
  return {
    cash: 1200,
    savings: 300,
    currency: "USD",
    savingsHolder: "First National Bank",
    holdings: [],
    deposit: { id: "depositSavings", name: "Deposit", description: "Move cash to savings.", cost: 0, available: true },
    withdraw: { id: "withdrawSavings", name: "Withdraw", description: "Move savings to cash.", cost: 0, available: true },
    ...overrides,
  };
}

function makeWorld(): GameView {
  return {
    turn: 7,
    date: "1953-07-01",
    era: "1953",
    countryId: "US",
    countryName: "United States",
    difficulty: "normal",
    autonomyLevel: "v4",
    featureFlags: { ...DEFAULT_WORLD_FEATURE_FLAGS },
    player: {
      name: "Ada", cash: 1200, funds: 5000, actions: 3, influence: 12,
      favorability: 48, partyName: "Labor", mode: "career",
      hosPartyId: null, homeRegionId: null,
    },
    legislature: {} as GameView["legislature"],
    finance: makeFinance(),
    resources: {} as GameView["resources"],
    nation: {} as GameView["nation"],
    metrics: [],
    parties: [],
    elections: [],
    news: [],
    actions: [],
    regions: [],
    polls: {} as GameView["polls"],
    notifications: { items: [], unread: 0 },
  };
}

const unusedLoader = async (): Promise<never> => {
  throw new Error("unused loader");
};

function renderScreen(props: { busy: boolean; message?: string; error?: string }) {
  const world = makeWorld();
  // The profile body never resolves; the footer statusline under test
  // renders regardless while the main region shows its loading state.
  const pendingProfile = new Promise<never>(() => {});
  render(
    <GameScreen
      preferences={DEFAULT_PREFERENCES}
      onPreferencesChange={vi.fn()}
      onUpdateProfile={vi.fn(async () => true)}
      onSelectConstituency={vi.fn(async () => true)}
      search={async (query: string) => ({
        query, results: [], total: 0, facets: { kinds: [], countries: [], regions: [] },
      })}
      loadProfile={() => pendingProfile as unknown as Promise<import("../game/profileTypes").ProfileView>}
      loadBondMarket={unusedLoader}
      loadRegions={unusedLoader}
      loadCaucusManagement={unusedLoader}
      loadPartyManagement={unusedLoader}
      loadMarkets={unusedLoader}
      loadLegislation={unusedLoader}
      loadWorldOverview={unusedLoader}
      loadPolitics={unusedLoader}
      world={world}
      busy={props.busy}
      message={props.message}
      error={props.error}
      onAdvanceTurn={vi.fn()}
      onSave={vi.fn()}
      onExit={vi.fn()}
      onAction={vi.fn()}
      onMarkNotificationRead={vi.fn()}
      onDeleteNotification={vi.fn()}
      onMarkAllNotificationsRead={vi.fn()}
      onUpdateWorldFeatureFlags={vi.fn()}
    />,
  );
}

describe("GameScreen footer transient status", () => {
  it("announces a messageless pending state from the footer live region", () => {
    renderScreen({ busy: true });
    const footer = screen.getByRole("contentinfo");
    const pending = within(footer).getByText("Processing...");
    expect(pending.getAttribute("role")).toBe("status");
    expect(pending).toHaveClass("ahd-statusline-text");
    // No main-region banner exists without a message, so this is the single carrier.
    expect(document.querySelector("main .ahd-notice")).toBeNull();
  });

  it("does not double-announce a pending state that carries a message", () => {
    renderScreen({ busy: true, message: "Advancing turn" });
    // The main-region banner carries the announcement.
    const banner = within(screen.getByRole("main")).getByText("Advancing turn");
    expect(banner.getAttribute("role")).toBe("status");
    const footer = screen.getByRole("contentinfo");
    const pending = within(footer).getByText("Processing: Advancing turn");
    expect(pending.getAttribute("role")).toBeNull();
    expect(pending).toHaveClass("ahd-statusline-text");
    expect(pending).toHaveAttribute("title", "Processing: Advancing turn");
  });

  it("announces the save notice once from the footer", () => {
    renderScreen({ busy: false, message: "Game saved." });
    const footer = screen.getByRole("contentinfo");
    const notice = within(footer).getByText("Game saved.");
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice).toHaveClass("ahd-statusline-text");
    expect(notice).toHaveAttribute("title", "Game saved.");
    // The main region renders no duplicate banner for save notices.
    expect(document.querySelector("main .ahd-notice")).toBeNull();
  });

  it("keeps a long pending message fully available while clamped", () => {
    const long = `Advancing turn through a very long processing message that would wrap across many lines inside the fixed footer on a 320px phone viewport`;
    renderScreen({ busy: true, message: long });
    const footer = screen.getByRole("contentinfo");
    const pending = within(footer).getByText(`Processing: ${long}`);
    expect(pending).toHaveClass("ahd-statusline-text");
    // Full text stays in the DOM text and the title despite the visual clamp.
    expect(pending).toHaveAttribute("title", `Processing: ${long}`);
    expect(pending).toHaveTextContent(`Processing: ${long}`);
  });

  it("leaves the idle status text out of the live region", () => {
    renderScreen({ busy: false });
    const footer = screen.getByRole("contentinfo");
    const idle = within(footer).getByText("Player paced");
    expect(idle.getAttribute("role")).toBeNull();
  });

  it("clamps transient status text to two lines at 320/390px widths", () => {
    expect(css).toMatch(
      /@media\s*\(max-width:\s*390px\)[\s\S]*?\.ahd-statusline-text[\s\S]*?-webkit-line-clamp:\s*2/,
    );
    expect(css).toMatch(/\.ahd-statusline-text[\s\S]*?line-clamp:\s*2/);
  });
});
