import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { corporateSectorAssets } from "./corporateSectorAssets.js";
import { executeAction } from "../actions/execute.js";
import { applyPresidentialResolution } from "../elections/presidentialResolution.js";
import type { ElectionRecord } from "../elections/types.js";
import { deserializeSave, serializeSave } from "../save.js";

const OPTIONS = { era: "1953", countryId: "US", playerName: "Test Player", seed: "nationalization-ownership" };

function distressedPrivateWorld(mode: "career" | "hos" = "career") {
  const world = createWorld({ ...OPTIONS, mode });
  const corporation = world.corporations["US-media"]!;
  corporation.insolventSinceTurn = world.meta.turn;
  const assets = corporateSectorAssets(world);
  return { world, corporation, asset: Object.values(assets).find((row) => row.corporationId === corporation.id)! };
}

function recordElectedPresident(world: ReturnType<typeof createWorld>) {
  const election: ElectionRecord = {
    id: "US-president-elected-player",
    electionType: "president",
    countryId: "US",
    cycle: 1,
    status: "active",
    startTurn: world.meta.turn,
    primaryEndTurn: world.meta.turn,
    endTurn: world.meta.turn,
    totalSeats: 1,
    chamberKey: "president",
    candidates: [{ id: "player", name: world.player.name, partyId: "US_DEM", isNPP: false, incumbent: false }],
    tally: { player: 1000 },
  };
  // Use the public election resolver so the action gate is backed by a
  // recorded winner and seated executive rather than a hand-built HOG flag.
  world.elections.push(election);
  applyPresidentialResolution(world, election);
}

describe("executive nationalization ownership transfer", () => {
  it("absorbs a domestic distressed issuer into a non-tradable state corporation and preserves the separate unowned pool", () => {
    const { world, corporation, asset } = distressedPrivateWorld();
    recordElectedPresident(world);
    const poolKey = `${corporation.countryId}:${corporation.sectorType}`;
    const unownedBefore = structuredClone(world.unownedSectors[poolKey]);
    const expectedRevenue = Math.round(corporation.revenue * 0.85);
    const expectedAssetRevenue = Math.round((asset.revenue ?? corporation.revenue) * 0.85);

    const result = executeAction(world, "player", "nationalizeCorporation", {
      corporationId: corporation.id,
      tier: "seizure",
    });

    expect(result).toMatchObject({ ok: true });
    expect(world.corporations[corporation.id]).toBeUndefined();
    const national = world.corporations[`NAT-${corporation.countryId}-${corporation.sectorType}`]!;
    expect(national).toMatchObject({
      isNationalCorporation: true,
      countryOwnerId: corporation.countryId,
      ownershipState: "stateOwned",
      revenue: expectedRevenue,
      totalShares: 0,
      publicFloat: 0,
      shareholders: [],
    });
    expect(world.corporateSectors![asset.id]).toMatchObject({
      id: asset.id,
      corporationId: national.id,
      owner: "corporation",
      revenue: expectedAssetRevenue,
      forSale: null,
    });
    expect(world.unownedSectors[poolKey]).toEqual(unownedBefore);

    const restored = deserializeSave(serializeSave(world, "2026-10-01T00:00:00Z"));
    expect(restored.corporations[national.id]).toMatchObject({
      isNationalCorporation: true,
      countryOwnerId: corporation.countryId,
      ownershipState: "stateOwned",
      revenue: expectedRevenue,
    });
    expect(restored.corporateSectors![asset.id]).toMatchObject({
      corporationId: national.id,
      owner: "corporation",
      revenue: expectedAssetRevenue,
    });
    expect(restored.unownedSectors[poolKey]).toEqual(unownedBefore);
  });

  it("merges a distressed asset into an existing National Corporation holding without touching unowned revenue", () => {
    const { world, corporation, asset } = distressedPrivateWorld();
    recordElectedPresident(world);
    const poolKey = `${corporation.countryId}:${corporation.sectorType}`;
    const unownedBefore = structuredClone(world.unownedSectors[poolKey]);
    const nationalId = `NAT-${corporation.countryId}-${corporation.sectorType}`;
    const existing = {
      ...corporation,
      id: nationalId,
      isNationalCorporation: true as const,
      countryOwnerId: corporation.countryId,
      ownershipState: "stateOwned" as const,
      ceoId: `state-${corporation.countryId}`,
      ceoVacant: false,
      revenue: 2_000,
      foundingRevenue: 4_000,
      shareholders: [],
      totalShares: 0,
      publicFloat: 0,
    };
    world.corporations[nationalId] = existing;
    const survivorId = `state-sector:${nationalId}:${asset.stateId ?? "national"}:${asset.sectorType}`;
    const survivor = {
      ...asset,
      id: survivorId,
      corporationId: nationalId,
      revenue: 3_000,
      workers: 21,
    };
    world.corporateSectors![survivorId] = survivor;
    const beforeWorkers = survivor.workers + asset.workers;
    const expectedMergedRevenue = survivor.revenue + Math.round((asset.revenue ?? corporation.revenue) * 0.85);
    const expectedNationalRevenue = existing.revenue + Math.round(corporation.revenue * 0.85);

    const result = executeAction(world, "player", "nationalizeCorporation", {
      corporationId: corporation.id,
      tier: "seizure",
    });

    expect(result).toMatchObject({ ok: true });
    expect(world.corporations[nationalId]?.revenue).toBe(expectedNationalRevenue);
    expect(world.corporateSectors![survivorId]).toMatchObject({
      corporationId: nationalId,
      revenue: expectedMergedRevenue,
      workers: beforeWorkers,
    });
    expect(world.corporateSectors![asset.id]).toBeUndefined();
    expect(world.unownedSectors[poolKey]).toEqual(unownedBefore);
    const restored = deserializeSave(serializeSave(world, "2026-10-01T00:00:00Z"));
    expect(restored.corporateSectors![survivorId]).toMatchObject({ revenue: expectedMergedRevenue, workers: beforeWorkers });
    expect(restored.unownedSectors[poolKey]).toEqual(unownedBefore);
  });

  it("rejects a Head-of-State mode identity even when the seeded office says president", () => {
    const { world, corporation } = distressedPrivateWorld("hos");
    const result = executeAction(world, "player", "nationalizeCorporation", {
      corporationId: corporation.id,
      tier: "seizure",
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/sitting head of government/i) });
    expect(world.corporations[corporation.id]).toBe(corporation);
  });

  it("rejects actors without a recorded elected executive office", () => {
    const { world, corporation } = distressedPrivateWorld();
    const result = executeAction(world, "player", "nationalizeCorporation", {
      corporationId: corporation.id,
      tier: "seizure",
    });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/sitting head of government/i) });
  });
});
