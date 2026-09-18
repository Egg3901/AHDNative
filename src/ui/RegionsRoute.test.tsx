/**
 * RegionsRoute markets wiring (#299).
 *
 * Without a markets load the region detail renders exactly as before (no
 * sector card). With one, the selected region gains its recorded
 * corporate-sector inventory, Buy dispatches through onSectorSale, and the
 * company link drills to the markets destination with the region as the
 * return frame. Listings fixtures carry the same recorded fields a real
 * projectMarkets() view does; the home region of the created world is
 * Alabama (AL).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld } from "@ahdclient/engine";
import { projectRegions } from "../game/regions";
import type { MarketsView } from "../game/markets";
import { RegionsRoute } from "./RegionsRoute";

function makeMarkets(): MarketsView {
  return {
    playerCountryId: "US",
    playerCash: 10_000,
    playerCurrency: "USD",
    playerActions: 4,
    turn: 3,
    marketsPhaseEnabled: true,
    economyPhaseEnabled: true,
    corporationsPhaseEnabled: true,
    countries: [{ id: "US", name: "United States", currency: "USD", listingCount: 1 }],
    listings: [
      {
        id: "US-media",
        ticker: "US.MEDI",
        name: "US-media",
        countryId: "US",
        countryName: "United States",
        sectorType: "media",
        sectorLabel: "media",
        sectorAsset: {
          id: "corporate-sector:US:media:US-media",
          corporationId: "US-media",
          countryId: "US",
          sectorType: "media",
          scope: "regional",
          regionId: "AL",
          regionName: "Alabama",
          workers: 1200,
          unionId: null,
          unionName: null,
          forSale: { priceAnchor: 100 },
          owner: "corporation",
        },
        currency: "USD",
        cashCurrencyMatches: true,
        sharePrice: 774,
        fundamentalSharePrice: 774,
        totalShares: 10_000_000,
        publicFloat: 4_900_000,
        liquidCapital: 50_000,
        revenue: 1000,
        currentGrowthRate: 3,
        profitMargin: 8,
        effectiveProfitMargin: 8,
        insolvent: false,
        foundedAtTurn: 0,
        isBank: false,
        playerShares: 0,
        playerAvgCostPerShare: null,
        npcShares: 5_100_000,
        shareholders: [{ holder: "npc", shares: 5_100_000, avgCostPerShare: null }],
        controllingHolder: "npc",
        earningsHistory: [],
        priceHistory: [],
        buy: { id: "buyShares", name: "Buy Shares", cost: 0, available: true },
        sell: { id: "sellShares", name: "Sell Shares", cost: 0, available: false },
      },
    ],
    sectors: [],
  };
}

const world = () =>
  createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "regions-route-sectors" });

describe("RegionsRoute sector inventory", () => {
  it("renders no sector card without a markets load", async () => {
    render(
      <RegionsRoute
        load={async (query) => projectRegions(world(), query)}
        revision={{}}
        busy={false}
      />,
    );
    expect(await screen.findByRole("heading", { name: "Alabama" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Corporate sectors" }),
    ).not.toBeInTheDocument();
  });

  it("shows the recorded regional inventory with buy dispatch and company drill", async () => {
    const user = userEvent.setup();
    const onSectorSale = vi.fn();
    const onDrill = vi.fn();
    render(
      <RegionsRoute
        load={async (query) => projectRegions(world(), query)}
        loadMarkets={async () => makeMarkets()}
        revision={{}}
        busy={false}
        initialId="AL"
        onDrill={onDrill}
        onSectorSale={onSectorSale}
      />,
    );
    expect(await screen.findByRole("heading", { name: "Alabama" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Corporate sectors" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 regional sector.*1 for sale/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Buy media sector (US.MEDI)" }),
    );
    expect(onSectorSale).toHaveBeenCalledWith("buy", {
      assetId: "corporate-sector:US:media:US-media",
    });

    await user.click(screen.getByRole("button", { name: "View US-media company" }));
    expect(onDrill).toHaveBeenCalledWith(
      { route: "regions", detailId: "AL" },
      "markets",
      "US-media",
    );
  });
});
