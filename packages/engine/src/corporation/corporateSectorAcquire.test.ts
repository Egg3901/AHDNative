import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import { buyCorporateSectorForSale } from "./corporateSectorAcquire.js";
import {
  listCorporateSectorForSale,
  unlistCorporateSectorForSale,
  updateCorporateSectorListing,
} from "./corporateSectorSale.js";

const WORLD = { era: "1953", countryId: "US", seed: "issue-295-acquire", playerName: "Alex" } as const;
const SAVED_AT = "2026-09-15T00:00:00.000Z";

/**
 * World with a live listing on US-media: the player holds a recorded share
 * block (sale authority, #294), the sector lists at its live anchor, and
 * personal cash is funded to exactly cover the anchor unless told otherwise.
 *
 * Source grounding (AHDGame e364c04954ed628beef73a993a8e9e156650a31e):
 * buyListedSector.ts debits the buyer and credits the seller through the
 * anchor at live FX, transfers ownership to the buyer corp (merge when the
 * buyer already operates the type in that state), clears forSale on transfer,
 * treats the anchor locked at listing time as the asking price, and refunds
 * on a raced listing. Corrupt anchors never reach the debit: list/update
 * validate on write and the shared asset validator fails closed first.
 * Native adaptations: the buyer is the player character (no
 * player-run corporations exist, and corp-to-corp transfer is structurally
 * impossible with one aggregate corporation per country/sector), funds are
 * same-currency personal cash (no FX — cross-currency refuses like the
 * share-trade gate), and ownership records owner "player" while the recorded
 * corporation keeps operating the sector.
 */
function worldWithListing(cash?: number) {
  const world = createWorld(WORLD);
  const assets = corporateSectorAssets(world);
  const asset = Object.values(assets).find((candidate) => candidate.corporationId === "US-media")!;
  world.corporations["US-media"]!.shareholders.push({ holder: "player", shares: 100, avgCostPerShare: 1 });
  const listed = listCorporateSectorForSale(world, asset.id, "player");
  expect(listed.ok).toBe(true);
  const anchor = listed.priceAnchor!;
  expect(anchor).toBeGreaterThan(0);
  world.player.cash = cash ?? anchor;
  return { world, asset, anchor };
}

function snapshot(world: ReturnType<typeof createWorld>) {
  return JSON.stringify({ cash: world.player.cash, sectors: world.corporateSectors, corps: world.corporations });
}

describe("#295 corporate-sector acquisition", () => {
  it("buys at the recorded anchor: debits cash, credits the seller, clears the listing, records player ownership", () => {
    const { world, asset, anchor } = worldWithListing();
    const sellerBefore = world.corporations[asset.corporationId]!.liquidCapital;
    const corpRevenueBefore = world.corporations[asset.corporationId]!.revenue;
    const { workers, representingUnionId, corporationId, countryId, stateId, sectorType } = asset;

    const result = buyCorporateSectorForSale(world, asset.id, "player");
    expect(result).toMatchObject({ ok: true, priceAnchor: anchor });
    expect(world.player.cash).toBe(0);
    expect(world.corporations[asset.corporationId]!.liquidCapital).toBe(sellerBefore + anchor);

    const stored = world.corporateSectors![asset.id]!;
    expect(stored.forSale).toBeNull();
    expect(stored.owner).toBe("player");
    // Operation stays with the recorded corporation: asset identity, labor,
    // and union state plus the corporation's turn-math revenue are untouched.
    expect(stored).toMatchObject({ workers, representingUnionId, corporationId, countryId, stateId, sectorType });
    expect(world.corporations[asset.corporationId]!.revenue).toBe(corpRevenueBefore);
  });

  it("refuses an unknown listing without touching the world", () => {
    const { world } = worldWithListing();
    const before = snapshot(world);
    const result = buyCorporateSectorForSale(world, "corporate-sector:US:media:missing", "player");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(snapshot(world)).toBe(before);
  });

  it("authorizes only the player character", () => {
    const { world, asset } = worldWithListing();
    const before = snapshot(world);
    expect(buyCorporateSectorForSale(world, asset.id, "npc").ok).toBe(false);
    expect(buyCorporateSectorForSale(world, asset.id, "npc").error).toMatch(/only the player/i);
    expect(buyCorporateSectorForSale(world, asset.id, "fund" as never).error).toMatch(/unknown buyer/i);
    expect(snapshot(world)).toBe(before);
  });

  it("requires no shareholding of the buyer and refuses a second purchase as already owned", () => {
    const world = createWorld(WORLD);
    const assets = corporateSectorAssets(world);
    const asset = Object.values(assets).find((candidate) => candidate.corporationId === "US-media")!;
    // Authority to LIST stays shareholder-gated; another block lists on the player's behalf.
    world.corporations["US-media"]!.shareholders.push({ holder: "npc", shares: 50, avgCostPerShare: 2 });
    const anchor = listCorporateSectorForSale(world, asset.id, "npc").priceAnchor!;
    world.player.cash = anchor;

    expect(buyCorporateSectorForSale(world, asset.id, "player")).toMatchObject({ ok: true, priceAnchor: anchor });
    const again = buyCorporateSectorForSale(world, asset.id, "player");
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/already own/i);
  });

  it("refuses an unlisted sector", () => {
    const { world, asset } = worldWithListing();
    const before = snapshot(world);
    expect(world.corporateSectors![asset.id]!.forSale).not.toBeNull();
    const other = Object.values(world.corporateSectors!).find((candidate) => candidate.forSale == null)!;
    const result = buyCorporateSectorForSale(world, other.id, "player");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not currently listed/i);
    expect(snapshot(world)).toBe(before);
  });

  it("fails closed on a corrupt recorded anchor before any funds move", () => {
    // A corrupt anchor cannot arise through the commands (list/update validate
    // on write), so it fails at the shared asset validator — the same boundary
    // that refuses corrupt saves at load — before the buy touches cash,
    // corporate capital, the listing, or ownership.
    const { world, asset, anchor } = worldWithListing();
    world.corporateSectors![asset.id]!.forSale = { priceAnchor: 0 };
    const cashBefore = world.player.cash;
    const capitalBefore = world.corporations[asset.corporationId]!.liquidCapital;
    expect(() => buyCorporateSectorForSale(world, asset.id, "player")).toThrow(/invalid for-sale price anchor/i);
    expect(world.player.cash).toBe(cashBefore);
    expect(world.corporations[asset.corporationId]!.liquidCapital).toBe(capitalBefore);
    expect(world.corporateSectors![asset.id]!.owner).toBe("corporation");
    void anchor;
  });

  it("refuses a foreign-currency sector instead of converting", () => {
    const world = createWorld(WORLD);
    const assets = corporateSectorAssets(world);
    const foreign = Object.values(assets).find((candidate) => candidate.countryId !== world.player.countryId)!;
    world.corporations[foreign.corporationId]!.shareholders.push({ holder: "player", shares: 100, avgCostPerShare: 1 });
    const anchor = listCorporateSectorForSale(world, foreign.id, "player").priceAnchor!;
    world.player.cash = anchor;
    const before = snapshot(world);

    const result = buyCorporateSectorForSale(world, foreign.id, "player");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not available yet/i);
    expect(snapshot(world)).toBe(before);
  });

  it("refuses short cash without touching the world", () => {
    const { world, asset, anchor } = worldWithListing();
    world.player.cash = anchor - 1;
    const before = snapshot(world);
    const result = buyCorporateSectorForSale(world, asset.id, "player");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/insufficient cash/i);
    expect(snapshot(world)).toBe(before);
  });

  it("refuses to relist or re-anchor a player-owned sector, while unlist still clears", () => {
    const { world, asset } = worldWithListing();
    expect(buyCorporateSectorForSale(world, asset.id, "player").ok).toBe(true);

    expect(listCorporateSectorForSale(world, asset.id, "player").error).toMatch(/already own/i);
    expect(updateCorporateSectorListing(world, asset.id, "player", 999).error).toMatch(/already own/i);

    // A crafted player-owned listing can still be cleared, never repriced.
    world.corporateSectors![asset.id]!.forSale = { priceAnchor: 777 };
    expect(updateCorporateSectorListing(world, asset.id, "player", 999).error).toMatch(/already own/i);
    expect(world.corporateSectors![asset.id]!.forSale).toEqual({ priceAnchor: 777 });
    expect(unlistCorporateSectorForSale(world, asset.id, "player")).toMatchObject({ ok: true });
    expect(world.corporateSectors![asset.id]!.forSale).toBeNull();
  });

  it("persists the acquisition through the save boundary and backfills pre-#295 saves", () => {
    const { world, asset, anchor } = worldWithListing();
    expect(buyCorporateSectorForSale(world, asset.id, "player").ok).toBe(true);

    const raw = serializeSave(world, { savedAt: SAVED_AT });
    const loaded = deserializeSave(raw);
    const stored = loaded.corporateSectors![asset.id]!;
    expect(stored.owner).toBe("player");
    expect(stored.forSale).toBeNull();
    expect(loaded.player.cash).toBe(0);
    expect(loaded.corporations[asset.corporationId]!.liquidCapital)
      .toBe(world.corporations[asset.corporationId]!.liquidCapital);
    void anchor;

    // Saves written before #295 carry materialized assets without the field:
    // they load as the corporation default instead of failing validation.
    const envelope = JSON.parse(raw) as { world: ReturnType<typeof createWorld> };
    for (const record of Object.values(envelope.world.corporateSectors!)) delete (record as { owner?: unknown }).owner;
    const backfilled = deserializeSave(JSON.stringify(envelope));
    expect(Object.values(backfilled.corporateSectors!).every((record) => record.owner === "corporation")).toBe(true);
  });
});
