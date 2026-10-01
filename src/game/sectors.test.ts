import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const options = {
  era: "1953",
  countryId: "US",
  homeRegionId: "DC",
  seed: "native-sectors-89-v1",
  playerName: "Alex",
};
const SAVED_AT = "2026-09-15T00:00:00.000Z";

/** Recorded sector-asset id for US-media through the public markets projection. */
function mediaAssetId(session: GameSession): string {
  const listing = session
    .markets()
    .listings.find((entry) => entry.id === "US-media");
  expect(listing).toBeDefined();
  return listing!.sectorAsset.id;
}

/** Holding a share records investment without conferring CEO sale authority. */
function sessionWithShare(): GameSession {
  const session = new GameSession();
  session.create(options);
  expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(
    true,
  );
  return session;
}

function sessionWithSellerCeo(): GameSession {
  const session = sessionWithShare();
  expect(session.act("voteCeo", { corpId: "US-media", candidateId: "player" }).ok).toBe(true);
  expect(session.act("acceptCeoAppointment", { corpId: "US-media" }).ok).toBe(true);
  return session;
}

function reload(session: GameSession): GameSession {
  const reloaded = new GameSession();
  reloaded.load(session.serialize(SAVED_AT));
  return reloaded;
}

describe("#89 sector directory tab signals", () => {
  it("starts with every listing unowned and unlisted", () => {
    const session = new GameSession();
    session.create(options);
    const view = session.markets();
    expect(view.listings.length).toBeGreaterThan(0);
    for (const listing of view.listings) {
      expect(listing.playerShares).toBe(0);
      expect(listing.sectorAsset.owner).toBe("corporation");
      expect(listing.sectorAsset.forSale).toBeNull();
    }
  });

  it("moves a listing into the owned signal on share purchase and keeps it through save/reload", () => {
    const session = sessionWithShare();
    expect(
      session.markets().listings.find((entry) => entry.id === "US-media")!
        .playerShares,
    ).toBe(1);

    const kept = reload(session)
      .markets()
      .listings.find((entry) => entry.id === "US-media")!;
    expect(kept.playerShares).toBe(1);
    expect(kept.sectorAsset.owner).toBe("corporation");
  });

  it("keeps a sale listing through save, reload, and turn advancement", () => {
    const session = sessionWithSellerCeo();
    const assetId = mediaAssetId(session);
    expect(session.listSectorForSale(assetId).ok).toBe(true);
    const anchor = session
      .markets()
      .listings.find((entry) => entry.id === "US-media")!.sectorAsset.forSale!
      .priceAnchor;
    expect(anchor).toBeGreaterThan(0);

    const turnBefore = session.markets().turn;
    const advanced = reload(session);
    advanced.advance();
    const kept = advanced
      .markets()
      .listings.find((entry) => entry.id === "US-media")!;
    expect(advanced.markets().turn).toBeGreaterThan(turnBefore);
    expect(kept.sectorAsset.forSale).toEqual({ priceAnchor: anchor });
    expect(kept.sectorAsset.owner).toBe("corporation");
  });

  it("keeps an acquired sector in the buyer corporation through reload and turn advancement", () => {
    const session = sessionWithSellerCeo();
    const assetId = mediaAssetId(session);
    expect(session.listSectorForSale(assetId).ok).toBe(true);
    expect(session.updateSectorListing(assetId, 100)).toMatchObject({ ok: true });
    expect(session.act("resignCeo", { corpId: "US-media" }).ok).toBe(true);
    expect(session.act("buyShares", { corpId: "US-financial", shares: 1 }).ok).toBe(true);
    expect(session.act("voteCeo", { corpId: "US-financial", candidateId: "player" }).ok).toBe(true);
    expect(session.act("acceptCeoAppointment", { corpId: "US-financial" }).ok).toBe(true);
    const buyerBefore = session.markets().listings.find((entry) => entry.id === "US-financial")!;
    const personalCashBefore = session.markets().playerCash;
    expect(session.buySectorForSale(assetId, "US-financial")).toMatchObject({ ok: true, priceAnchor: 100 });
    const buyerAfter = session.markets().listings.find((entry) => entry.id === "US-financial")!;
    expect(buyerAfter.liquidCapital).toBe(buyerBefore.liquidCapital - 100);
    expect(session.markets().playerCash).toBe(personalCashBefore);
    expect(buyerAfter.sectorAssets?.find((asset) => asset.id === assetId))
      .toMatchObject({ owner: "corporation", forSale: null });

    const advanced = reload(session);
    advanced.advance();
    const kept = advanced.markets().listings.find((entry) => entry.id === "US-financial")!;
    expect(kept.sectorAssets?.find((asset) => asset.id === assetId))
      .toMatchObject({ owner: "corporation", forSale: null });
    expect(advanced.markets().sectors.find((sector) => sector.sectorType === "media")!.forSaleCount).toBe(0);
  });
});

describe("#89 sector directory filter sources", () => {
  it("records country, sector, currency, region, and worker fields on every listing", () => {
    const session = new GameSession();
    session.create(options);
    const view = session.markets();
    for (const listing of view.listings) {
      expect(listing.countryId.length).toBeGreaterThan(0);
      expect(listing.countryName.length).toBeGreaterThan(0);
      expect(listing.sectorType.length).toBeGreaterThan(0);
      expect(listing.sectorLabel.length).toBeGreaterThan(0);
      expect(listing.currency.length).toBeGreaterThan(0);
      expect(listing.revenue).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(listing.effectiveProfitMargin)).toBe(true);
      expect(Number.isFinite(listing.currentGrowthRate)).toBe(true);
      expect(listing.sectorAsset.workers).toBeGreaterThanOrEqual(0);
      expect(
        listing.sectorAsset.scope === "national" ||
          listing.sectorAsset.scope === "regional",
      ).toBe(true);
    }
    const listedCountries = new Set(
      view.listings.map((listing) => listing.countryId),
    );
    for (const country of view.countries) {
      expect(listedCountries.has(country.id)).toBe(true);
    }
  });
});
