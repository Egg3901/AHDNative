import { describe, expect, it } from "vitest";
import { deserializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";
import { projectMyCorporation } from "./identityOrg";

const OPTIONS = { era: "1953", countryId: "US", seed: "native-identity-org-51", playerName: "Alex" };
const SAVED_AT = "2026-09-18T00:00:00.000Z";

/**
 * Full public owner flow: buy a recorded share (sale authority), list the
 * sector, fund the asking price through a save round-trip, then acquire.
 */
function sessionOwningMedia(): GameSession {
  const session = new GameSession();
  session.create(OPTIONS);
  expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
  const assetId = session.markets().listings.find((entry) => entry.id === "US-media")!.sectorAsset.id;
  const listed = session.listSectorForSale(assetId);
  expect(listed.ok).toBe(true);
  const raw = JSON.parse(session.serialize(SAVED_AT));
  raw.world.player.cash = listed.ok ? listed.priceAnchor : 0;
  const funded = new GameSession();
  funded.load(JSON.stringify(raw));
  expect(funded.buySectorForSale(assetId).ok).toBe(true);
  return funded;
}

describe("#51/#84 drawer My Corporation signal", () => {
  it("is null for a fresh player with no recorded ownership", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    expect(projectMyCorporation(deserializeSave(session.serialize(SAVED_AT)))).toBeNull();
    expect(session.view().myCorporation).toBeUndefined();
  });

  it("is null for a recorded shareholder who owns no sector (no inferred corporation)", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    expect(session.act("buyShares", { corpId: "US-media", shares: 1 }).ok).toBe(true);
    expect(projectMyCorporation(deserializeSave(session.serialize(SAVED_AT)))).toBeNull();
    expect(session.view().myCorporation).toBeUndefined();
  });

  it("links the owned corporation through the live view", () => {
    const session = sessionOwningMedia();
    expect(projectMyCorporation(deserializeSave(session.serialize(SAVED_AT)))).toEqual({ id: "US-media", name: "US-media" });
    expect(session.view().myCorporation).toEqual({ id: "US-media", name: "US-media" });
  });

  it("follows persisted ownership across save and reload, and vanishes when the role reverts", () => {
    const session = sessionOwningMedia();
    const reloaded = new GameSession();
    reloaded.load(session.serialize(SAVED_AT));
    expect(reloaded.view().myCorporation).toEqual(session.view().myCorporation);

    const raw = JSON.parse(session.serialize(SAVED_AT));
    const assetId = session.markets().listings.find((entry) => entry.id === "US-media")!.sectorAsset.id;
    raw.world.corporateSectors[assetId].owner = "corporation";
    const reverted = new GameSession();
    reverted.load(JSON.stringify(raw));
    expect(reverted.view().myCorporation).toBeUndefined();
  });
});
