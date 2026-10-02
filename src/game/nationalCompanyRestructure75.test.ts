import { describe, expect, it } from "vitest";
import { deserializeSave } from "@ahdclient/engine";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-02T00:00:00.000Z";

describe("public National Corporation reorganization (#75)", () => {
  it("splits a taken industry without money or asset damage, routes future takings, and merges it back after resume", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "national-company-reorganization", playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "seizure" }).ok).toBe(true);
    const before = deserializeSave(session.serialize(SAVED_AT));
    const primaryId = session.stateOwnership().nationalCorporationId!;
    const mediaAssets = Object.values(before.corporateSectors!).filter(asset => asset.corporationId === primaryId);
    const treasury = before.budgets.US!.treasuryBalance;
    const unowned = structuredClone(before.unownedSectors);
    const ledger = structuredClone(before.stateOwnershipLedger);
    expect(session.act("splitNationalCorporation", { sectorType: "media", newCorpName: "State Media" })).toMatchObject({ ok: true });
    const split = deserializeSave(session.serialize(SAVED_AT));
    const secondary = Object.values(split.corporations).find(corporation => corporation.assignedSectorTypes?.includes("media"))!;
    expect(secondary).toMatchObject({ name: "State Media", countryOwnerId: "US", sectorType: "media", isPrimaryNationalCorporation: false, assignedSectorTypes: ["media"], ceoVacant: true, liquidCapital: 0, totalShares: 0, publicFloat: 0, shareholders: [] });
    for (const asset of mediaAssets) expect(split.corporateSectors![asset.id]).toEqual({ ...asset, corporationId: secondary.id });
    expect(split.budgets.US!.treasuryBalance).toBe(treasury);
    expect(split.unownedSectors).toEqual(unowned);
    expect(split.stateOwnershipLedger).toEqual(ledger);
    expect(session.act("splitNationalCorporation", { sectorType: "media", newCorpName: "Duplicate" })).toMatchObject({ ok: false });
    expect(session.act("mergeNationalCorporation", { sectorType: "media", intoCorpId: secondary.id })).toMatchObject({ ok: false });

    const resumed = new GameSession(); resumed.load(session.serialize(SAVED_AT));
    expect(resumed.act("nationalizeCorporation", { corporationId: "US-energy", tier: "seizure" }).ok).toBe(true);
    expect(resumed.stateOwnership().nationalCorporationId).toBe(primaryId);
    expect(resumed.act("mergeNationalCorporation", { sectorType: "media" })).toMatchObject({ ok: true });
    const merged = deserializeSave(resumed.serialize(SAVED_AT));
    expect(merged.corporations[secondary.id]).toBeUndefined();
    for (const asset of mediaAssets) expect(merged.corporateSectors![asset.id]).toEqual({ ...asset, corporationId: primaryId });
    expect(merged.corporations[primaryId]!.assignedSectorTypes).toEqual([]);
    expect(merged.unownedSectors).toEqual(unowned);
    expect(resumed.stateOwnership().holdings).toHaveLength(1);
    resumed.advance();
    const continued = new GameSession(); continued.load(resumed.serialize(SAVED_AT));
    expect(continued.stateOwnership().nationalCorporationId).toBe(primaryId);
    expect(continued.stateOwnership().holdings).toHaveLength(1);
  });

  it("pre-claims a type, routes a later public taking, and merges into another split-off", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "national-company-preclaim", playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    expect(session.act("splitNationalCorporation", { sectorType: "media", newCorpName: "State Media" }).ok).toBe(true);
    expect(session.act("splitNationalCorporation", { sectorType: "energy", newCorpName: "State Energy" }).ok).toBe(true);
    const claimed = deserializeSave(session.serialize(SAVED_AT));
    const media = Object.values(claimed.corporations).find(corporation => corporation.assignedSectorTypes?.includes("media"))!;
    const energy = Object.values(claimed.corporations).find(corporation => corporation.assignedSectorTypes?.includes("energy"))!;
    expect(media.soe).toMatchObject({ sector: "media", capacity: 0, output: 0, planTarget: 0, efficiency: 1, cumulativeLosses: 0, directorId: null });
    expect(Object.values(claimed.corporateSectors!).some(asset => asset.corporationId === media.id)).toBe(false);
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "seizure" }).ok).toBe(true);
    const taken = deserializeSave(session.serialize(SAVED_AT));
    const takenAssets = Object.values(taken.corporateSectors!).filter(asset => asset.corporationId === media.id);
    expect(takenAssets.length).toBeGreaterThan(0);
    expect(session.act("mergeNationalCorporation", { sectorType: "media", intoCorpId: "US-energy" })).toMatchObject({ ok: false });
    expect(session.act("mergeNationalCorporation", { sectorType: "media", intoCorpId: energy.id }).ok).toBe(true);
    const merged = deserializeSave(session.serialize(SAVED_AT));
    expect(merged.corporations[media.id]).toBeUndefined();
    expect(merged.corporations[energy.id]!.assignedSectorTypes).toEqual(["energy", "media"]);
    for (const asset of takenAssets) expect(merged.corporateSectors![asset.id]).toEqual({ ...asset, corporationId: energy.id });
    expect(merged.budgets.US!.treasuryBalance).toBe(taken.budgets.US!.treasuryBalance);
    const resumed = new GameSession(); resumed.load(session.serialize(SAVED_AT));
    expect(resumed.stateOwnership()).toEqual(session.stateOwnership());
  });

});
