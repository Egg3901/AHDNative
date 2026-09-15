import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const options = { era: "1953", countryId: "US", seed: "native-sector-sale-v1", playerName: "Alex" };
const SAVED_AT = "2026-09-15T00:00:00.000Z";

/** Recorded sector-asset id for US-media through the public markets projection. */
function mediaAssetId(session: GameSession): string {
  const listing = session.markets().listings.find((entry) => entry.id === "US-media");
  expect(listing).toBeDefined();
  return listing!.sectorAsset.id;
}

/** Buy one recorded share so the player passes sale authority (#294 gates on the shareholder roster). */
function sessionWithShare(): GameSession {
  const session = new GameSession();
  session.create(options);
  expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
  return session;
}

describe("#294 corporate-sector sale through the public session", () => {
  it("runs the scoped player flow: buy a share, list, reload, update, unlist", () => {
    const session = sessionWithShare();
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

  it("refuses every command for a non-shareholder without touching the world", () => {
    const session = new GameSession();
    session.create(options);
    const assetId = mediaAssetId(session);
    const before = session.serialize(SAVED_AT);

    const listed = session.listSectorForSale(assetId);
    expect(listed.ok).toBe(false);
    expect(listed.error).toMatch(/shareholder/i);
    expect(session.updateSectorListing(assetId, 100).ok).toBe(false);
    expect(session.unlistSectorForSale(assetId).ok).toBe(false);
    expect(session.markets().listings.find((entry) => entry.id === "US-media")!.sectorAsset.forSale).toBeNull();
    expect(session.serialize(SAVED_AT)).toBe(before);
  });

  it("refuses every command for an unknown listing", () => {
    const session = sessionWithShare();
    const missing = "corporate-sector:US:media:missing";
    expect(session.listSectorForSale(missing).ok).toBe(false);
    expect(session.updateSectorListing(missing, 100).ok).toBe(false);
    expect(session.unlistSectorForSale(missing).ok).toBe(false);
  });

  it("rejects bad asking prices atomically and refuses update/unlist while unlisted", () => {
    const session = sessionWithShare();
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
