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
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld } from "@ahdclient/engine";
import { projectRegions } from "../game/regions";
import { GameSession } from "../game/session";
import type { MarketsView } from "../game/markets";
import { MarketsRoute } from "./MarketsRoute";
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
    countries: [
      { id: "US", name: "United States", currency: "USD", listingCount: 1 },
    ],
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
        shareholders: [
          { holder: "npc", shares: 5_100_000, avgCostPerShare: null },
        ],
        controllingHolder: "npc",
        earningsHistory: [],
        priceHistory: [],
        buy: { id: "buyShares", name: "Buy Shares", cost: 0, available: true },
        sell: {
          id: "sellShares",
          name: "Sell Shares",
          cost: 0,
          available: false,
        },
      },
    ],
    sectors: [],
  };
}

const world = () =>
  createWorld({
    era: "1953",
    countryId: "US",
    playerName: "Alex",
    seed: "regions-route-sectors",
  });

describe("RegionsRoute sector inventory", () => {
  it("renders no sector card without a markets load", async () => {
    render(
      <RegionsRoute
        load={async (query) => projectRegions(world(), query)}
        revision={{}}
        busy={false}
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Alabama" }),
    ).toBeInTheDocument();
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
    expect(
      await screen.findByRole("heading", { name: "Alabama" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Corporate sectors" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 regional sector.*1 for sale/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Buy media sector (US.MEDI)" }),
    );
    expect(onSectorSale).toHaveBeenCalledWith("buy", {
      assetId: "corporate-sector:US:media:US-media",
    });

    await user.click(
      screen.getByRole("button", { name: "View US-media company" }),
    );
    expect(onDrill).toHaveBeenCalledWith(
      { route: "regions", detailId: "AL" },
      "markets",
      "US-media",
    );
  });

  it("drills from a region to company sale controls and runs list/unlist on the real session", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "innerWidth", {
      value: 390,
      configurable: true,
    });
    const session = new GameSession();
    session.create({
      era: "1953",
      countryId: "US",
      playerName: "Alex",
      seed: "region-sector-sale-flow",
    });
    const assetId = session
      .markets()
      .listings.find((entry) => entry.id === "US-media")!.sectorAsset.id;
    expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(
      true,
    );
    expect(session.listSectorForSale(assetId).ok).toBe(true);
    expect(session.unlistSectorForSale(assetId).ok).toBe(true);

    // Record the regional split using the same persisted asset field consumed by
    // projectMarkets; fresh worlds intentionally begin with national assets.
    const saved = JSON.parse(session.serialize("2026-09-23T00:00:00.000Z")) as {
      world: { corporateSectors: Record<string, { stateId: string | null }> };
    };
    saved.world.corporateSectors[assetId]!.stateId = "AL";
    session.load(JSON.stringify(saved));

    function RegionalSaleFlow() {
      const [route, setRoute] = useState<"regions" | "markets">("regions");
      const [detailId, setDetailId] = useState<string | undefined>("AL");
      const [revision, setRevision] = useState(0);
      const routeRevision = { revision };
      const onSectorSale = (
        op: "list" | "update" | "unlist" | "buy",
        params: { assetId: string; priceAnchor?: number },
      ) => {
        if (op === "list") session.listSectorForSale(params.assetId);
        else if (op === "unlist") session.unlistSectorForSale(params.assetId);
        else if (op === "update")
          session.updateSectorListing(params.assetId, params.priceAnchor);
        else session.buySectorForSale(params.assetId);
        setRevision((value) => value + 1);
      };
      const onDrill = (
        _origin: { route: string; detailId?: string },
        next: string,
        id?: string,
      ) => {
        if (next !== "regions" && next !== "markets") return;
        setRoute(next);
        setDetailId(id);
      };
      return route === "regions" ? (
        <RegionsRoute
          load={async (query) => session.regions(query)}
          loadMarkets={async () => session.markets()}
          revision={routeRevision}
          busy={false}
          initialId={detailId}
          onDrill={onDrill}
          onSectorSale={onSectorSale}
        />
      ) : (
        <MarketsRoute
          load={async () => session.markets()}
          revision={routeRevision}
          busy={false}
          onAction={vi.fn()}
          onSectorSale={onSectorSale}
          initialId={detailId}
        />
      );
    }

    render(<RegionalSaleFlow />);
    expect(
      await screen.findByRole("heading", { name: "Alabama" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Not for sale")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "View US-media company" }),
    );

    const list = await screen.findByRole("button", {
      name: "List media sector for sale",
    });
    expect(list).toBeEnabled();
    await user.click(list);
    expect(
      await screen.findByRole("button", { name: "Unlist media sector" }),
    ).toBeEnabled();
    expect(
      session.markets().listings.find((entry) => entry.id === "US-media")!
        .sectorAsset.forSale,
    ).not.toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Unlist media sector" }),
    );
    expect(
      session.markets().listings.find((entry) => entry.id === "US-media")!
        .sectorAsset.forSale,
    ).toBeNull();
  });
});
