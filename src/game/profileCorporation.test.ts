import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const options = { era: "1953", countryId: "US", seed: "native-profile-corporation", playerName: "Alex" };
const SAVED_AT = "2026-09-15T00:00:00.000Z";

/** Recorded sector-asset id for US-media through the public markets projection. */
function mediaAssetId(session: GameSession): string {
  const listing = session.markets().listings.find((entry) => entry.id === "US-media");
  expect(listing).toBeDefined();
  return listing!.sectorAsset.id;
}

/**
 * Session that owns the US-media sector through the public commands: buy a
 * recorded share (sale authority, #294), list, fund personal cash to the
 * recorded anchor through the save boundary, then acquire (#295).
 */
function sessionOwningMedia(): GameSession {
  const session = new GameSession();
  session.create(options);
  expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
  const assetId = mediaAssetId(session);
  const listed = session.listSectorForSale(assetId);
  expect(listed.ok).toBe(true);
  const anchor = listed.priceAnchor!;
  expect(anchor).toBeGreaterThan(0);

  const raw = JSON.parse(session.serialize(SAVED_AT));
  raw.world.player.cash = anchor;
  const funded = new GameSession();
  funded.load(JSON.stringify(raw));
  expect(funded.buySectorForSale(assetId)).toMatchObject({ ok: true, priceAnchor: anchor });
  return funded;
}

describe("#51 profile corporation card through the public session", () => {
  it("omits the card for an ordinary player with no recorded acquisition", () => {
    const session = new GameSession();
    session.create(options);
    expect(session.profile().corporations).toEqual([]);
  });

  it("never infers ownership from share holdings alone", () => {
    const session = new GameSession();
    session.create(options);
    expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    expect(session.markets().listings.find((entry) => entry.id === "US-media")!.playerShares).toBe(1);
    // A recorded shareholder block is not a CEO or ownership relationship:
    // the reference gates its card on ceoId, so shares alone show no card.
    expect(session.profile().corporations).toEqual([]);
  });

  it("shows the acquired corporation with the company-detail values", () => {
    const session = sessionOwningMedia();
    const listing = session.markets().listings.find((entry) => entry.id === "US-media")!;
    expect(listing.sectorAsset.owner).toBe("player");

    const corporations = session.profile().corporations;
    expect(corporations).toHaveLength(1);
    expect(corporations[0]).toEqual({
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
      marketValue: Math.round(listing.sharePrice * listing.totalShares * 100) / 100,
      liquidCapital: listing.liquidCapital,
      revenue: listing.revenue,
      playerShares: listing.playerShares,
      playerAvgCostPerShare: listing.playerAvgCostPerShare,
      scope: listing.sectorAsset.scope,
      regionName: listing.sectorAsset.regionName,
    });
  });

  it("follows the persisted role across save and reload", () => {
    const session = sessionOwningMedia();
    const before = session.serialize(SAVED_AT);

    const reloaded = new GameSession();
    reloaded.load(before);
    expect(reloaded.profile().corporations.map((entry) => entry.id)).toEqual(["US-media"]);

    // The pre-acquisition save carries no ownership, so the card disappears with the role.
    const fresh = new GameSession();
    fresh.create(options);
    const pristine = new GameSession();
    pristine.load(fresh.serialize(SAVED_AT));
    expect(pristine.profile().corporations).toEqual([]);
    expect(pristine.serialize(SAVED_AT)).toBe(fresh.serialize(SAVED_AT));
  });
});
