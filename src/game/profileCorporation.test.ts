import { describe, expect, it } from "vitest";
import { deserializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";
import { projectProfileCorporations } from "./profileCorporation";

const OPTIONS = { era: "1953", countryId: "US", seed: "native-profile-ceo-51", playerName: "Alex" };
const SAVED_AT = "2026-09-18T00:00:00.000Z";

/** Recorded sector-asset id for US-media through the public markets projection. */
function mediaAssetId(session: GameSession): string {
  const listing = session.markets().listings.find((entry) => entry.id === "US-media");
  expect(listing).toBeDefined();
  return listing!.sectorAsset.id;
}

/**
 * Full public owner flow: buy a recorded share (sale authority), list the
 * sector, fund the asking price through a save round-trip, then acquire.
 */
function sessionOwningMedia(): { session: GameSession; assetId: string } {
  const session = new GameSession();
  session.create(OPTIONS);
  expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
  const assetId = mediaAssetId(session);
  const listed = session.listSectorForSale(assetId);
  expect(listed.ok).toBe(true);
  const raw = JSON.parse(session.serialize(SAVED_AT));
  raw.world.player.cash = listed.ok ? listed.priceAnchor : 0;
  const funded = new GameSession();
  funded.load(JSON.stringify(raw));
  expect(funded.buySectorForSale(assetId).ok).toBe(true);
  return { session: funded, assetId };
}

describe("#51 profile corporation projection", () => {
  it("is empty for a fresh player with no recorded ownership", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    const world = deserializeSave(session.serialize(SAVED_AT));
    expect(projectProfileCorporations(world)).toEqual([]);
    expect(session.profile().corporations).toEqual([]);
  });

  it("is empty for a recorded shareholder who owns no sector (no inferred CEO status)", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    expect(session.profile().corporations).toEqual([]);
  });

  it("copies the owned listing verbatim from the same projection the company detail renders", () => {
    const { session } = sessionOwningMedia();
    const world = deserializeSave(session.serialize(SAVED_AT));
    const entries = projectProfileCorporations(world);
    expect(entries).toHaveLength(1);
    const listing = session.markets().listings.find((entry) => entry.id === "US-media")!;
    expect(entries[0]).toEqual({
      id: listing.id,
      ticker: listing.ticker,
      name: listing.name,
      countryId: listing.countryId,
      countryName: listing.countryName,
      sectorType: listing.sectorType,
      sectorLabel: listing.sectorLabel,
      currency: listing.currency,
      sharePrice: listing.sharePrice,
      totalShares: listing.totalShares,
      liquidCapital: listing.liquidCapital,
      revenue: listing.revenue,
      playerShares: listing.playerShares,
      playerAvgCostPerShare: listing.playerAvgCostPerShare,
      controllingHolder: listing.controllingHolder,
      scope: listing.sectorAsset.scope,
      regionName: listing.sectorAsset.regionName,
    });
    expect(session.profile().corporations).toEqual(entries);
  });

  it("follows persisted ownership across save and reload", () => {
    const { session } = sessionOwningMedia();
    const before = session.profile().corporations;
    expect(before).toHaveLength(1);
    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.profile().corporations).toEqual(before);
  });

  it("loses the entry when the persisted owner reverts (role lost)", () => {
    const { session, assetId } = sessionOwningMedia();
    const raw = JSON.parse(session.serialize(SAVED_AT));
    expect(raw.world.corporateSectors?.[assetId]?.owner).toBe("player");
    raw.world.corporateSectors[assetId].owner = "corporation";
    const reloaded = new GameSession();
    reloaded.load(JSON.stringify(raw));
    expect(reloaded.profile().corporations).toEqual([]);
  });

  it("cannot go stale when the corporation leaves the world (removed)", () => {
    // Save validation rejects a sector asset whose corporation is gone, so a
    // removed corporation fails loudly at load instead of projecting a card
    // for a company that no longer exists.
    const { session } = sessionOwningMedia();
    const raw = JSON.parse(session.serialize(SAVED_AT));
    delete raw.world.corporations["US-media"];
    const reloaded = new GameSession();
    expect(() => reloaded.load(JSON.stringify(raw))).toThrow(/invalid corporation/i);
  });
});
