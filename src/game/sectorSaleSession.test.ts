import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const options = { era: "1953", countryId: "US", homeRegionId: "DC", seed: "native-sector-sale-v1", playerName: "Alex" };
const SAVED_AT = "2026-09-15T00:00:00.000Z";

/** Recorded sector-asset id for US-media through the public markets projection. */
function mediaAssetId(session: GameSession): string {
  const listing = session.markets().listings.find((entry) => entry.id === "US-media");
  expect(listing).toBeDefined();
  return listing!.sectorAsset.id;
}

/** Use the public vote and acceptance commands so the player is the recorded active seller CEO. */
function sessionWithSellerCeo(): GameSession {
  const session = new GameSession();
  session.create(options);
  expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
  expect(session.act("voteCeo", { corpId: "US-media", candidateId: "player" }).ok).toBe(true);
  expect(session.act("acceptCeoAppointment", { corpId: "US-media" }).ok).toBe(true);
  return session;
}

function sessionWithActiveBuyer(session: GameSession, liquidCapital: number): GameSession {
  const raw = JSON.parse(session.serialize(SAVED_AT));
  Object.assign(raw.world.corporations["US-financial"], { ceoId: "player", ceoType: "player", ceoVacant: false, liquidCapital });
  const funded = new GameSession();
  funded.load(JSON.stringify(raw));
  return funded;
}

describe("#294 corporate-sector sale through the public session", () => {
  it("runs the scoped player flow: buy a share, list, reload, update, unlist", () => {
    const session = sessionWithSellerCeo();
    const assetId = mediaAssetId(session);

    const listed = session.listSectorForSale(assetId);
    expect(listed.ok).toBe(true);
    expect(listed.priceAnchor).toBeGreaterThan(0);

    const projected = session.markets().listings.find((entry) => entry.id === "US-media")!;
    expect(projected.sectorAsset.forSale).toEqual({ priceAnchor: listed.priceAnchor });
    expect(session.markets().sectors.find((sector) => sector.sectorType === "media")!.forSaleCount).toBe(1);

    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.markets().listings.find((entry) => entry.id === "US-media")!.sectorAsset.forSale)
      .toEqual({ priceAnchor: listed.priceAnchor });

    expect(reloaded.updateSectorListing(assetId, 12345)).toMatchObject({ ok: true, priceAnchor: 12345 });
    expect(reloaded.markets().listings.find((entry) => entry.id === "US-media")!.sectorAsset.forSale)
      .toEqual({ priceAnchor: 12345 });

    expect(reloaded.unlistSectorForSale(assetId)).toMatchObject({ ok: true });
    expect(reloaded.markets().listings.find((entry) => entry.id === "US-media")!.sectorAsset.forSale).toBeNull();
    expect(reloaded.markets().sectors.find((sector) => sector.sectorType === "media")!.forSaleCount).toBe(0);

    const cleared = new GameSession();
    cleared.load(reloaded.serialize(SAVED_AT));
    expect(cleared.markets().listings.find((entry) => entry.id === "US-media")!.sectorAsset.forSale).toBeNull();
  });

  it("refuses every seller command for a shareholder who is not CEO without touching the world", () => {
    const session = new GameSession();
    session.create(options);
    expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    const assetId = mediaAssetId(session);
    const before = session.serialize(SAVED_AT);

    const listed = session.listSectorForSale(assetId);
    expect(listed.ok).toBe(false);
    expect(listed.error).toMatch(/active CEO/i);
    expect(session.updateSectorListing(assetId, 100).ok).toBe(false);
    expect(session.unlistSectorForSale(assetId).ok).toBe(false);
    expect(session.markets().listings.find((entry) => entry.id === "US-media")!.sectorAsset.forSale).toBeNull();
    expect(session.serialize(SAVED_AT)).toBe(before);
  });

  it("refuses every command for an unknown listing", () => {
    const session = sessionWithSellerCeo();
    const missing = "corporate-sector:US:media:missing";
    expect(session.listSectorForSale(missing).ok).toBe(false);
    expect(session.updateSectorListing(missing, 100).ok).toBe(false);
    expect(session.unlistSectorForSale(missing).ok).toBe(false);
  });

  it("rejects bad asking prices atomically and refuses update/unlist while unlisted", () => {
    const session = sessionWithSellerCeo();
    const assetId = mediaAssetId(session);
    expect(session.updateSectorListing(assetId, 100).ok).toBe(false);
    expect(session.unlistSectorForSale(assetId).ok).toBe(false);

    const listed = session.listSectorForSale(assetId);
    expect(listed.ok).toBe(true);
    expect(session.listSectorForSale(assetId).ok).toBe(false);

    for (const bad of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const refused = session.updateSectorListing(assetId, bad);
      expect(refused.ok).toBe(false);
      expect(refused.error).toMatch(/positive finite/i);
      expect(session.markets().listings.find((entry) => entry.id === "US-media")!.sectorAsset.forSale)
        .toEqual({ priceAnchor: listed.priceAnchor });
    }
  });
});

describe("#295 corporate-sector acquisition through the public session", () => {
  it("buys at an affordable re-anchor: commits cash, listing, and owner, and persists them", () => {
    const session = sessionWithSellerCeo();
    const assetId = mediaAssetId(session);
    expect(session.listSectorForSale(assetId).ok).toBe(true);
    expect(session.updateSectorListing(assetId, 100)).toMatchObject({ ok: true, priceAnchor: 100 });
    const sessionWithBuyer = sessionWithActiveBuyer(session, 1_000_000);
    const buyerCashBefore = sessionWithBuyer.markets().listings.find((entry) => entry.id === "US-financial")!.liquidCapital;
    expect(sessionWithBuyer.buySectorForSale(assetId, "US-financial")).toMatchObject({ ok: true, priceAnchor: 100 });
    const held = sessionWithBuyer.markets().listings.find((entry) => entry.id === "US-financial")!;
    expect(held.sectorAssets?.some((asset) => asset.id === assetId && asset.owner === "corporation")).toBe(true);
    expect(held.liquidCapital).toBeLessThan(buyerCashBefore);
    expect(sessionWithBuyer.markets().sectors.find((sector) => sector.sectorType === "media")!.forSaleCount).toBe(0);

    const reloaded = new GameSession();
    reloaded.load(sessionWithBuyer.serialize(SAVED_AT));
    const kept = reloaded.markets().listings.find((entry) => entry.id === "US-financial")!;
    expect(kept.sectorAssets?.some((asset) => asset.id === assetId && asset.forSale === null)).toBe(true);
    expect(kept.liquidCapital).toBe(held.liquidCapital);
  });

  it("refuses buy while unlisted or unknown without touching the world", () => {
    const session = sessionWithSellerCeo();
    const assetId = mediaAssetId(session);
    const before = session.serialize(SAVED_AT);
    expect(session.buySectorForSale(assetId, "US-financial").ok).toBe(false);
    expect(session.buySectorForSale("corporate-sector:US:media:missing").ok).toBe(false);
    expect(session.serialize(SAVED_AT)).toBe(before);
  });

  it("refuses insufficient buyer-corporation cash atomically", () => {
    const session = sessionWithSellerCeo();
    const assetId = mediaAssetId(session);
    expect(session.listSectorForSale(assetId).ok).toBe(true);
    const funded = sessionWithActiveBuyer(session, 0);
    const before = funded.serialize(SAVED_AT);
    expect(funded.buySectorForSale(assetId, "US-financial").error).toMatch(/insufficient corporate funds/i);
    expect(funded.serialize(SAVED_AT)).toBe(before);
  });

  it("loads a pre-#295 save without owners as the corporation default", () => {
    const session = sessionWithSellerCeo();
    const assetId = mediaAssetId(session);
    // The listing call materializes world.corporateSectors; the save then
    // mimics a pre-#295 payload with the owner field stripped throughout.
    expect(session.listSectorForSale(assetId).ok).toBe(true);
    const anchor = session.markets().listings.find((entry) => entry.id === "US-media")!.sectorAsset.forSale!.priceAnchor;
    const raw = JSON.parse(session.serialize(SAVED_AT)) as {
      world: { corporateSectors: Record<string, Record<string, unknown>> };
    };
    for (const record of Object.values(raw.world.corporateSectors)) delete record.owner;
    const reloaded = new GameSession();
    reloaded.load(JSON.stringify(raw));
    const listing = reloaded.markets().listings.find((entry) => entry.id === "US-media")!;
    expect(listing.sectorAsset.owner).toBe("corporation");
    expect(listing.sectorAsset.forSale).toEqual({ priceAnchor: anchor });
  });
});
