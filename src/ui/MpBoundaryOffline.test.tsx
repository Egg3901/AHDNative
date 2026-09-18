import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DEFAULT_PREFERENCES } from "../preferences";
import { DEFAULT_WORLD_FEATURE_FLAGS } from "@ahdclient/engine";
import { GameScreen } from "./GameScreen";
import type { FinanceView, GameView } from "../game/types";
import { MENU_GROUPS, drawerRouteIds } from "./MobileNavigation";

/**
 * Offline MP boundary regression (#86).
 *
 * The offline SP surface must never show dead multiplayer controls: no
 * presence count, no live countdown, no processing/paused server states, and
 * no presence/countdown/server routes or labels in the drawer. The idle
 * footer claims exactly `Player paced`, and MP-only capabilities stay
 * omitted rather than rendered as placeholders. MP controls render only
 * behind the authenticated server adapter (MpModeScreen + MpModeSession);
 * this file locks the offline side of that contract.
 */

function makeFinance(): FinanceView {
  return {
    cash: 1200,
    savings: 300,
    currency: "USD",
    savingsHolder: "First National Bank",
    holdings: [],
    deposit: {
      id: "depositSavings",
      name: "Deposit",
      description: "Move cash to savings.",
      cost: 0,
      available: true,
    },
    withdraw: {
      id: "withdrawSavings",
      name: "Withdraw",
      description: "Move savings to cash.",
      cost: 0,
      available: true,
    },
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
      name: "Ada",
      cash: 1200,
      funds: 5000,
      actions: 3,
      influence: 12,
      favorability: 48,
      partyName: "Labor",
      mode: "career",
      hosPartyId: null,
      homeRegionId: null,
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

function renderIdleScreen() {
  const pendingProfile = new Promise<never>(() => {});
  render(
    <GameScreen
      preferences={DEFAULT_PREFERENCES}
      onPreferencesChange={vi.fn()}
      onUpdateProfile={vi.fn(async () => true)}
      onSelectConstituency={vi.fn(async () => true)}
      search={async (query: string) => ({
        query,
        results: [],
        total: 0,
        facets: { kinds: [], countries: [], regions: [] },
      })}
      loadProfile={() =>
        pendingProfile as unknown as Promise<
          import("../game/profileTypes").ProfileView
        >
      }
      loadBondMarket={unusedLoader}
      loadRegions={unusedLoader}
      loadCaucusManagement={unusedLoader}
      loadPartyManagement={unusedLoader}
      loadMarkets={unusedLoader}
      loadLegislation={unusedLoader}
      loadWorldOverview={unusedLoader}
      loadPolitics={unusedLoader}
      world={makeWorld()}
      busy={false}
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

describe("offline MP boundary (#86)", () => {
  it("idle footer claims Player paced with no presence, countdown, or server text", () => {
    renderIdleScreen();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("Player paced")).toBeInTheDocument();
    expect(within(footer).queryByText(/players? online/)).toBeNull();
    expect(within(footer).queryByText(/turn processing/i)).toBeNull();
    expect(within(footer).queryByText(/^paused/i)).toBeNull();
    expect(within(footer).queryByText(/reconnect/i)).toBeNull();
    expect(within(footer).queryByText(/session expired/i)).toBeNull();
    expect(within(footer).queryByText(/sign in/i)).toBeNull();
  });

  it("drawer exposes no presence, countdown, or server routes", () => {
    const ids = drawerRouteIds() as string[];
    for (const id of [
      "presence",
      "online",
      "countdown",
      "server",
      "multiplayer",
      "mp",
      "session",
      "reconnect",
    ]) {
      expect(ids).not.toContain(id);
    }
  });

  it("drawer labels name no presence, countdown, or server control", () => {
    const labels = MENU_GROUPS.flatMap((group) => [
      ...group.items,
      ...(group.sections ?? []).flatMap((section) => section.items),
    ]).map((item) => item.label.toLowerCase());
    for (const label of labels) {
      expect(label).not.toMatch(
        /online|presence|countdown|server|multiplayer|reconnect|session/,
      );
    }
  });
});
