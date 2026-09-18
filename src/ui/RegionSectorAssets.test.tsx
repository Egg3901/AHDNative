/**
 * RegionSectorAssets card tests (#299).
 *
 * The card reads the recorded markets projection only: the selector filters
 * MarketListing rows by the recorded sectorAsset.regionId, and every row fact
 * (ownership, workers, union, for-sale) renders verbatim from that row. The
 * Buy control reuses evaluateSectorBuy and the existing onSectorSale("buy")
 * dispatch, so the real-session tests below drive the actual #295 command for
 * success and prove refusals leave the serialized world untouched
 * (error/rollback). Rendered at 320px, 390px, and desktop width; jsdom
 * performs no layout, so the viewport cases pin identical content and the
 * shipped containment styles rather than physical-device evidence.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWorld, seedCorporateSectorAssets } from "@ahdclient/engine";
import { projectMarkets } from "../game/markets";
import type { MarketListing, MarketsView } from "../game/markets";
import {
  RegionSectorAssetsCard,
  selectRegionSectorAssets,
} from "./RegionSectorAssets";

function makeListing(overrides: Partial<MarketListing> = {}): MarketListing {
  return {
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
      regionId: "CA",
      regionName: "California",
      workers: 1200,
      unionId: null,
      unionName: null,
      forSale: null,
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
    ...overrides,
  };
}

const regionalAsset = (overrides: Partial<MarketListing["sectorAsset"]> = {}) =>
  makeListing({ sectorAsset: { ...makeListing().sectorAsset, ...overrides } });

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

describe("selectRegionSectorAssets", () => {
  it("keeps only the recorded regional rows for the region, sorted by sector label", () => {
    const rows = selectRegionSectorAssets(
      [
        regionalAsset({}),
        makeListing({
          id: "US-energy",
          sectorType: "energy",
          sectorLabel: "energy",
          sectorAsset: {
            ...makeListing().sectorAsset,
            id: "corporate-sector:US:energy:US-energy",
            corporationId: "US-energy",
            sectorType: "energy",
          },
        }),
        // National asset: country scope, never a regional row.
        makeListing({
          id: "US-retail",
          sectorType: "retail",
          sectorLabel: "retail",
          sectorAsset: {
            ...makeListing().sectorAsset,
            id: "corporate-sector:US:retail:US-retail",
            corporationId: "US-retail",
            sectorType: "retail",
            scope: "national",
            regionId: null,
            regionName: null,
          },
        }),
        // Another region's asset.
        makeListing({
          id: "US-steel",
          sectorType: "steel",
          sectorLabel: "aaa steel",
          sectorAsset: {
            ...makeListing().sectorAsset,
            id: "corporate-sector:US:steel:US-steel",
            corporationId: "US-steel",
            sectorType: "steel",
            regionId: "AL",
            regionName: "Alabama",
          },
        }),
      ],
      "CA",
    );
    expect(rows.map((row) => row.id)).toEqual(["US-energy", "US-media"]);
  });
});

describe("RegionSectorAssetsCard", () => {
  it.each([320, 390, 1280])(
    "renders recorded ownership, workers, union, and sale state identically at a %dpx viewport",
    (width) => {
      setViewport(width);
      const onSectorSale = vi.fn();
      const onOpenCompany = vi.fn();
      render(
        <RegionSectorAssetsCard
          regionId="CA"
          regionName="California"
          listings={[
            regionalAsset({
              forSale: { priceAnchor: 100 },
              unionId: "union-1",
              unionName: "Media Workers",
            }),
            regionalAsset({
              id: "corporate-sector:US:energy:US-energy",
              corporationId: "US-energy",
              sectorType: "energy",
            }),
          ].map((listing, index) =>
            index === 1
              ? {
                  ...listing,
                  id: "US-energy",
                  ticker: "US.ENER",
                  name: "US-energy",
                  sectorType: "energy",
                  sectorLabel: "energy",
                  playerShares: 2,
                  playerAvgCostPerShare: 774,
                }
              : listing,
          )}
          playerCash={10_000}
          busy={false}
          onSectorSale={onSectorSale}
          onOpenCompany={onOpenCompany}
        />,
      );

      expect(
        screen.getByRole("heading", { name: "Corporate sectors" }),
      ).toBeInTheDocument();
      expect(screen.getByText(/2 regional sectors.*1 for sale/i)).toBeInTheDocument();
      const list = screen.getByRole("list", {
        name: "Corporate sectors recorded for California",
      });
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);
      // Recorded facts ride on the rows: ownership, workers, union, sale state.
      expect(within(list).getByText("Unowned")).toBeInTheDocument();
      expect(within(list).getByText(/you hold 2 shares/i)).toBeInTheDocument();
      expect(within(list).getByText("Union: Media Workers")).toBeInTheDocument();
      expect(within(list).getByText("No union recorded")).toBeInTheDocument();
      expect(within(list).getByText("Not for sale")).toBeInTheDocument();
      expect(
        within(list).getByRole("button", { name: "Buy media sector (US.MEDI)" }),
      ).toBeEnabled();
      // Touch reachability ships on the buttons, not the viewport.
      for (const button of within(list).getAllByRole("button")) {
        expect(button).toHaveStyle({ minHeight: "44px" });
      }
      expect(
        screen.getByRole("button", { name: "View US-media company" }),
      ).toBeInTheDocument();
    },
  );

  it("reports no regional sectors honestly and never claims national assets", () => {
    render(
      <RegionSectorAssetsCard
        regionId="CA"
        regionName="California"
        listings={[
          makeListing({
            sectorAsset: {
              ...makeListing().sectorAsset,
              scope: "national",
              regionId: null,
              regionName: null,
            },
          }),
        ]}
        playerCash={10_000}
        busy={false}
        onSectorSale={vi.fn()}
        onOpenCompany={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/no corporate sectors are recorded for california/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no regional sector assets recorded/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /buy .* sector/i }),
    ).not.toBeInTheDocument();
  });

  it("dispatches Buy with the recorded asset id", async () => {
    const user = userEvent.setup();
    const onSectorSale = vi.fn();
    const assetId = "corporate-sector:US:media:US-media";
    render(
      <RegionSectorAssetsCard
        regionId="CA"
        regionName="California"
        listings={[regionalAsset({ forSale: { priceAnchor: 100 } })]}
        playerCash={10_000}
        busy={false}
        onSectorSale={onSectorSale}
        onOpenCompany={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Buy media sector (US.MEDI)" }),
    );
    expect(onSectorSale).toHaveBeenCalledWith("buy", { assetId });
  });

  it("holds Buy with the recorded reason when already owned or short on cash", () => {
    const listed = { forSale: { priceAnchor: 100 } };
    const { rerender } = render(
      <RegionSectorAssetsCard
        regionId="CA"
        regionName="California"
        listings={[regionalAsset({ ...listed, owner: "player" })]}
        playerCash={10_000}
        busy={false}
        onSectorSale={vi.fn()}
        onOpenCompany={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Buy media sector (US.MEDI)" }),
    ).toBeDisabled();
    expect(screen.getByText(/you already own this sector/i)).toBeInTheDocument();
    expect(screen.getByText("Owned by you")).toBeInTheDocument();

    rerender(
      <RegionSectorAssetsCard
        regionId="CA"
        regionName="California"
        listings={[regionalAsset(listed)]}
        playerCash={50}
        busy={false}
        onSectorSale={vi.fn()}
        onOpenCompany={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Buy media sector (US.MEDI)" }),
    ).toBeDisabled();
    expect(screen.getByText(/not enough cash/i)).toBeInTheDocument();
  });

  it("shows a recorded share block as owned without a buyable listing", () => {
    render(
      <RegionSectorAssetsCard
        regionId="CA"
        regionName="California"
        listings={[
          { ...regionalAsset(), playerShares: 2, playerAvgCostPerShare: 774 },
        ]}
        playerCash={10_000}
        busy={false}
        onSectorSale={vi.fn()}
        onOpenCompany={vi.fn()}
      />,
    );
    expect(screen.getByText(/you hold 2 shares/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /buy .* sector/i }),
    ).not.toBeInTheDocument();
  });
});

/**
 * Fresh worlds seed every asset national, so the regional split is recorded
 * by writing the asset's stateId — the same record-level mechanism the
 * engine's own corporateSectorAssets tests use — before projecting. The
 * region join, scope, workers, union, sale, and owner state then arrive
 * through the real projectMarkets read path. The list/update/unlist/buy
 * commands that write these records are covered at the engine boundary in
 * src/game/sectorSaleSession.test.ts (success, refusal, atomic rollback,
 * save/reload); these tests prove the region card reads the same records.
 */
function regionalView(
  mutate: (assets: ReturnType<typeof seedCorporateSectorAssets>) => void,
): MarketsView {
  const world = createWorld({
    era: "1953",
    countryId: "US",
    playerName: "Alex",
    seed: "native-region-sector-assets-v1",
  });
  const assets = seedCorporateSectorAssets(world);
  mutate(assets);
  world.corporateSectors = assets;
  return projectMarkets(world);
}

function mediaKey(
  assets: ReturnType<typeof seedCorporateSectorAssets>,
): string {
  const key = Object.keys(assets).find(
    (candidate) => assets[candidate].corporationId === "US-media",
  );
  expect(key).toBeDefined();
  return key!;
}

describe("RegionSectorAssetsCard on the recorded regional split", () => {
  it("projects the recorded stateId join and dispatches Buy with the asset id", async () => {
    const user = userEvent.setup();
    const view = regionalView((assets) => {
      assets[mediaKey(assets)].stateId = "CA";
      assets[mediaKey(assets)].forSale = { priceAnchor: 100 };
    });
    const projected = view.listings.find((entry) => entry.id === "US-media")!;
    expect(projected.sectorAsset.regionId).toBe("CA");
    expect(projected.sectorAsset.regionName).toBe("California");
    expect(projected.sectorAsset.scope).toBe("regional");
    expect(view.playerCash).toBeGreaterThanOrEqual(100);

    const onSectorSale = vi.fn();
    render(
      <RegionSectorAssetsCard
        regionId="CA"
        regionName="California"
        listings={view.listings}
        playerCash={view.playerCash}
        busy={false}
        onSectorSale={onSectorSale}
        onOpenCompany={vi.fn()}
      />,
    );
    expect(screen.getByText(/1 regional sector.*1 for sale/i)).toBeInTheDocument();
    const buy = screen.getByRole("button", { name: "Buy media sector (US.MEDI)" });
    expect(buy).toBeEnabled();
    await user.click(buy);
    expect(onSectorSale).toHaveBeenCalledWith("buy", {
      assetId: projected.sectorAsset.id,
    });
  });

  it("reads back the recorded player acquisition as owned with no buy control", () => {
    // Exactly what the #295 buy command writes: owner flips to the player
    // and the listing clears (sectorSaleSession.test.ts proves the write).
    const view = regionalView((assets) => {
      assets[mediaKey(assets)].stateId = "CA";
      assets[mediaKey(assets)].owner = "player";
      assets[mediaKey(assets)].forSale = null;
    });
    render(
      <RegionSectorAssetsCard
        regionId="CA"
        regionName="California"
        listings={view.listings}
        playerCash={view.playerCash}
        busy={false}
        onSectorSale={vi.fn()}
        onOpenCompany={vi.fn()}
      />,
    );
    expect(screen.getByText("Owned by you")).toBeInTheDocument();
    expect(screen.getByText(/0 for sale/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /buy .* sector/i }),
    ).not.toBeInTheDocument();
  });

  it("holds Buy with the recorded reason when the regional asset is unlisted", () => {
    const view = regionalView((assets) => {
      assets[mediaKey(assets)].stateId = "CA";
    });
    render(
      <RegionSectorAssetsCard
        regionId="CA"
        regionName="California"
        listings={view.listings}
        playerCash={view.playerCash}
        busy={false}
        onSectorSale={vi.fn()}
        onOpenCompany={vi.fn()}
      />,
    );
    expect(screen.getByText("Not for sale")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /buy .* sector/i }),
    ).not.toBeInTheDocument();
  });
});
