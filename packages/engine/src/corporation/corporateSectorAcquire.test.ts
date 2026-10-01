import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import { buyCorporateSectorForSale } from "./corporateSectorAcquire.js";

const WORLD = { era: "1953", countryId: "US", seed: "issue-299-buy", playerName: "Alex" } as const;

function listedWorld() {
  const world = createWorld(WORLD);
  const assets = corporateSectorAssets(world);
  const asset = Object.values(assets).find((row) => row.corporationId === "US-media")!;
  const buyer = world.corporations["US-financial"]!;
  const seller = world.corporations["US-media"]!;
  buyer.ceoId = "player";
  buyer.ceoType = "player";
  buyer.ceoVacant = false;
  asset.forSale = { priceAnchor: 100_000 };
  buyer.liquidCapital = Math.round(asset.forSale.priceAnchor * world.exchangeRates[buyer.countryId]!.rate) * 2;
  return { world, asset, buyer, seller, price: asset.forSale.priceAnchor };
}

describe("#295 corporate-sector acquisition", () => {
  it("debits the active player CEO's corporation, credits the seller, and transfers the listed asset", () => {
    const { world, asset, buyer, seller, price } = listedWorld();
    const buyerBefore = buyer.liquidCapital;
    const sellerBefore = seller.liquidCapital;
    const playerCash = world.player.cash;
    const originalSector = { ...asset };
    const result = buyCorporateSectorForSale(world, asset.id, buyer.id);

    expect(result).toMatchObject({ ok: true, priceAnchor: price, merged: false });
    expect(buyer.liquidCapital).toBe(buyerBefore - Math.round(price * world.exchangeRates[buyer.countryId]!.rate));
    expect(seller.liquidCapital).toBe(sellerBefore + Math.round(price * world.exchangeRates[seller.countryId]!.rate));
    expect(world.player.cash).toBe(playerCash);
    expect(asset).toMatchObject({
      corporationId: buyer.id,
      countryId: originalSector.countryId,
      stateId: originalSector.stateId,
      sectorType: originalSector.sectorType,
      workers: originalSector.workers,
      representingUnionId: originalSector.representingUnionId,
      forSale: null,
      owner: "corporation",
    });
  });

  it("fails closed for missing, self, non-CEO, vacant-CEO, unlisted, and underfunded buyers", () => {
    const { world, asset, buyer, seller } = listedWorld();
    const snapshot = () => JSON.stringify({ cash: world.player.cash, assets: world.corporateSectors, corps: world.corporations });
    const before = snapshot();
    expect(buyCorporateSectorForSale(world, asset.id, "missing").error).toMatch(/buyer corporation not found/i);
    expect(buyCorporateSectorForSale(world, asset.id, seller.id).error).toMatch(/own sector/i);
    buyer.ceoId = "npc";
    expect(buyCorporateSectorForSale(world, asset.id, buyer.id).error).toMatch(/active ceo/i);
    buyer.ceoId = "player";
    buyer.ceoVacant = true;
    expect(buyCorporateSectorForSale(world, asset.id, buyer.id).error).toMatch(/active ceo/i);
    buyer.ceoVacant = false;
    const debit = Math.round(asset.forSale!.priceAnchor * world.exchangeRates[buyer.countryId]!.rate);
    buyer.liquidCapital = debit - 1;
    expect(buyCorporateSectorForSale(world, asset.id, buyer.id).error).toMatch(/insufficient corporate funds/i);
    expect(snapshot()).not.toBe(before); // only the test's deliberately changed CEO/cash fields differ

    buyer.liquidCapital = debit + 1;
    asset.forSale = null;
    const unlistedSnapshot = snapshot();
    expect(buyCorporateSectorForSale(world, asset.id, buyer.id).error).toMatch(/not currently listed/i);
    expect(snapshot()).toBe(unlistedSnapshot);
  });

  it("converts the same recorded anchor price into each side's home currency", () => {
    const { world, asset, buyer, seller, price } = listedWorld();
    buyer.countryId = "UK";
    world.exchangeRates.UK!.rate = 2;
    world.exchangeRates.US!.rate = 1;
    buyer.liquidCapital = Math.round(price * 2) + 1;
    const buyerBefore = buyer.liquidCapital;
    const sellerBefore = seller.liquidCapital;
    expect(buyCorporateSectorForSale(world, asset.id, buyer.id).ok).toBe(true);
    expect(buyer.liquidCapital).toBe(buyerBefore - Math.round(price * 2));
    expect(seller.liquidCapital).toBe(sellerBefore + Math.round(price));
  });

  it("rejects private acquisition in a still-planned target economy without changing ledgers", () => {
    const world = createWorld(WORLD);
    const asset = Object.values(corporateSectorAssets(world)).find((row) => row.corporationId === "RU-media")!;
    const buyer = world.corporations["US-financial"]!;
    const seller = world.corporations[asset.corporationId]!;
    buyer.ceoId = "player";
    buyer.ceoType = "player";
    buyer.ceoVacant = false;
    asset.forSale = { priceAnchor: 100_000 };
    buyer.liquidCapital = Math.round(asset.forSale.priceAnchor * world.exchangeRates[buyer.countryId]!.rate) * 2;
    world.commandEconomy[asset.countryId]!.marketizationLevel = 0;
    const balance = buyer.liquidCapital;
    const sale = structuredClone(asset.forSale);
    expect(buyCorporateSectorForSale(world, asset.id, buyer.id).error).toMatch(/state-controlled.*command economy/i);
    expect(buyer.liquidCapital).toBe(balance);
    expect(asset.forSale).toEqual(sale);
    expect(asset.corporationId).toBe(seller.id);
  });

  it("merges an acquired same-country, same-region, same-type sector into the buyer portfolio", () => {
    const { world, asset, buyer } = listedWorld();
    const assets = world.corporateSectors!;
    const existing = Object.values(assets).find((row) => row.corporationId === buyer.id)!;
    existing.sectorType = asset.sectorType;
    existing.stateId = asset.stateId;
    existing.representingUnionId = asset.representingUnionId;
    existing.workers = 300;
    existing.unionization = 20;
    asset.workers = 700;
    asset.unionization = 80;
    const existingId = existing.id;
    const acquiredId = asset.id;

    expect(buyCorporateSectorForSale(world, acquiredId, buyer.id)).toMatchObject({ ok: true, merged: true });
    expect(world.corporateSectors![existingId]!.workers).toBe(1_000);
    expect(world.corporateSectors![existingId]!.unionization).toBe(62);
    expect(world.corporateSectors![acquiredId]).toBeUndefined();
  });

  it("persists corporate ownership and both local cash balances through save/reload", () => {
    const { world, asset, buyer, seller } = listedWorld();
    expect(buyCorporateSectorForSale(world, asset.id, buyer.id).ok).toBe(true);
    const loaded = deserializeSave(serializeSave(world, { savedAt: "2026-10-01T00:00:00.000Z" }));
    expect(loaded.corporateSectors![asset.id]).toMatchObject({ corporationId: buyer.id, owner: "corporation", forSale: null });
    expect(loaded.corporations[buyer.id]!.liquidCapital).toBe(buyer.liquidCapital);
    expect(loaded.corporations[seller.id]!.liquidCapital).toBe(seller.liquidCapital);
  });
});
