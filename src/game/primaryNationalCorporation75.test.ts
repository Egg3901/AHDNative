import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-02T00:00:00.000Z";

describe("source primary National Corporation (#75)", () => {
  it("routes different-industry takings to one vacant primary issuer and continues it after reload", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "primary-national-company", playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    const beforeQuery = session.serialize(SAVED_AT);
    expect(session.stateOwnership().nationalCorporationId).toBeUndefined();
    expect(session.serialize(SAVED_AT)).toBe(beforeQuery);

    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "seizure" }).ok).toBe(true);
    const primaryId = session.stateOwnership().nationalCorporationId;
    const first = JSON.parse(session.serialize(SAVED_AT));
    // Independent Game buildNationalCorporationDoc/ensurePrimary contract:
    // financial holding company, no bank charter, vacant CEO, zero own cash,
    // zero shares, and an empty type assignment meaning all remaining types.
    expect(first.world.corporations[primaryId!]).toMatchObject({
      name: "United States National Corporation", sectorType: "financial",
      countryOwnerId: "US", ownershipState: "stateOwned", isPrimaryNationalCorporation: true,
      assignedSectorTypes: [], ceoVacant: true, liquidCapital: 0,
      totalShares: 0, publicFloat: 0, shareholders: [],
    });
    expect(session.markets().listings.find(listing => listing.id === primaryId)).toMatchObject({ isBank: false, isStateOwned: true });

    expect(session.act("nationalizeCorporation", { corporationId: "US-energy", tier: "seizure" }).ok).toBe(true);
    const ownership = session.stateOwnership();
    expect(ownership.nationalCorporationId).toBe(primaryId);
    expect(ownership.holdings).toHaveLength(1);
    expect(ownership.holdings[0]!.assets.map(asset => asset.sectorType)).toEqual(expect.arrayContaining(["media", "energy"]));
    expect(ownership.rows.map(row => row.nationalCorporationId)).toEqual([primaryId, primaryId]);

    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.stateOwnership()).toEqual(ownership);
    resumed.advance();
    const continued = new GameSession();
    continued.load(resumed.serialize(SAVED_AT));
    expect(continued.stateOwnership().nationalCorporationId).toBe(primaryId);
    expect(continued.stateOwnership().holdings).toHaveLength(1);
    expect(continued.markets().listings.find(listing => listing.id === primaryId)).toMatchObject({ isBank: false, ceoVacant: true });
  });

  it("prefers the primary for the register while routing assigned sectors to a historical split-off", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "national-company-routing", playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    expect(session.act("nationalizeCorporation", { corporationId: "US-energy", tier: "seizure" }).ok).toBe(true);
    const save = JSON.parse(session.serialize(SAVED_AT));
    const primaryId = session.stateOwnership().nationalCorporationId!;
    const primary = save.world.corporations[primaryId];
    // Persisted source split-off contract, not a claim that Native already has
    // the restructuring command which creates this historical secondary.
    const secondaryId = "000-source-media-secondary";
    save.world.corporations[secondaryId] = { ...primary, id: secondaryId,
      name: "State Media", isPrimaryNationalCorporation: false,
      assignedSectorTypes: ["media"], revenue: 0, foundingRevenue: 0,
    };
    const donor = save.world.corporations["US-media"];
    const assetIds = Object.values(save.world.corporateSectors)
      .filter((asset: any) => asset.corporationId === donor.id).map((asset: any) => asset.id);
    session.load(JSON.stringify(save));
    const beforeQuery = session.serialize(SAVED_AT);
    expect(session.stateOwnership().nationalCorporationId).toBe(primaryId);
    expect(session.serialize(SAVED_AT)).toBe(beforeQuery);
    expect(session.act("nationalizeCorporation", { corporationId: donor.id, tier: "seizure" }).ok).toBe(true);
    const taken = JSON.parse(session.serialize(SAVED_AT));
    for (const id of assetIds) expect(taken.world.corporateSectors[id].corporationId).toBe(secondaryId);
    expect(taken.world.corporations[primaryId].revenue).toBe(primary.revenue);
    expect(taken.world.corporations[secondaryId].revenue).toBeGreaterThan(0);
    expect(session.stateOwnership().rows[0]!.nationalCorporationId).toBe(primaryId);
    const resumed = new GameSession(); resumed.load(session.serialize(SAVED_AT));
    expect(resumed.stateOwnership()).toEqual(session.stateOwnership());
  });

  it("preserves an unflagged historical national issuer and refuses ambiguous primary save state", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "national-company-legacy", playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    expect(session.act("nationalizeCorporation", { corporationId: "US-media", tier: "seizure" }).ok).toBe(true);
    const save = JSON.parse(session.serialize(SAVED_AT));
    const primaryId = session.stateOwnership().nationalCorporationId!;
    delete save.world.corporations[primaryId].isPrimaryNationalCorporation;
    delete save.world.corporations[primaryId].assignedSectorTypes;
    session.load(JSON.stringify(save));
    const beforeQuery = session.serialize(SAVED_AT);
    expect(session.stateOwnership().nationalCorporationId).toBe(primaryId);
    expect(session.serialize(SAVED_AT)).toBe(beforeQuery);
    expect(session.act("nationalizeCorporation", { corporationId: "US-energy", tier: "seizure" }).ok).toBe(true);
    const continued = JSON.parse(session.serialize(SAVED_AT));
    expect(continued.world.corporations[primaryId]).not.toHaveProperty("isPrimaryNationalCorporation");
    expect(continued.world.corporations[primaryId]).not.toHaveProperty("assignedSectorTypes");
    expect(session.stateOwnership().holdings).toHaveLength(1);

    const ambiguous = structuredClone(continued);
    ambiguous.world.corporations[primaryId].isPrimaryNationalCorporation = true;
    ambiguous.world.corporations["duplicate-primary"] = { ...ambiguous.world.corporations[primaryId], id: "duplicate-primary" };
    const refused = new GameSession();
    expect(() => refused.load(JSON.stringify(ambiguous))).toThrow(/Multiple primary National Corporations/);
  });

});
