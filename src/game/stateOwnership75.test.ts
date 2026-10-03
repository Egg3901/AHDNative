import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-01T00:00:00.000Z";

describe("country state ownership register (#75)", () => {
  it("records an actual taking across national issuers and preserves it through a normal turn and reload", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "state-ownership-register", playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    const initial = session.stateOwnership();
    expect(initial.countryId).toBe("US");
    expect(initial.currency).toBe("USD");
    expect(initial.rows).toEqual([]);
    const save = JSON.parse(session.serialize(SAVED_AT));
    const issuer = save.world.corporations["US-media"];
    issuer.insolventSinceTurn = save.world.meta.turn;
    issuer.liquidCapital = 12345.6;
    const treasuryBefore = save.world.budgets.US.treasuryBalance;
    // Source ownershipTransition captures non-matured principal before the
    // issuer is retargeted. Native corporate bonds require home denomination.
    const bond = (id: string, totalIssued: number, matured = false) => ({
      id, issuerType: "corporation", corporationId: issuer.id, countryId: "US", issuerName: issuer.name,
      currencyCode: "USD", faceValue: 1000, totalIssued, couponRate: 0, maturityTurns: 96,
      issuedAtTurn: 0, maturityTurn: 96, marketPrice: 1000, publicFloat: totalIssued / 1000,
      holders: [], matured, defaulted: false, defaultedAtTurn: null, createdAt: SAVED_AT, updatedAt: SAVED_AT,
    });
    save.world.bonds["source-assumed-a"] = bond("source-assumed-a", 10000);
    save.world.bonds["source-assumed-b"] = bond("source-assumed-b", 2500);
    save.world.bonds["source-matured"] = bond("source-matured", 99000, true);
    session.load(JSON.stringify(save));
    const name = issuer.name ?? issuer.tickerSymbol ?? issuer.id;
    expect(session.act("nationalizeCorporation", { corporationId: issuer.id, tier: "seizure" }).ok).toBe(true);
    const takenSave = JSON.parse(session.serialize(SAVED_AT));
    expect(takenSave.world.budgets.US.treasuryBalance).toBe(treasuryBefore + 12346);
    expect(takenSave.world.corporations["NAT-US"].liquidCapital).toBe(0);
    const result = session.stateOwnership();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ firm: name, countryId: "US", nationalCorporationId: "NAT-US", kind: "nationalize_whole", method: "executive", tier: "seizure", turn: 0, compensationLocal: null, debtAnchor: 12500, debtLocal: 12500, shareholdersSettled: issuer.shareholders.length });
    expect(result.totals.firmsAbsorbed).toBe(1);
    expect(result.totals.debtLocal).toBe(12500);
    expect(session.stateOwnership("UK").rows).toEqual([]);
    expect(session.stateOwnership("UK").currency).toBe("GBP");
    expect(() => session.stateOwnership("UNKNOWN")).toThrow("Unknown country");
    const recorded = result.rows[0];
    session.advance();
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.stateOwnership().rows).toEqual([recorded]);
    expect(resumed.stateOwnership().holdings.some((holding) => holding.corporationId === "NAT-US")).toBe(true);
    const beforeQuery = resumed.serialize(SAVED_AT);
    resumed.stateOwnership();
    expect(resumed.serialize(SAVED_AT)).toBe(beforeQuery);
  });

  it("settles a repeated seizure into the treasury without destroying cash or duplicating the existing state issuer", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "state-ownership-repeat", playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    const before = JSON.parse(session.serialize(SAVED_AT));
    const donor = before.world.corporations["US-media"];
    donor.insolventSinceTurn = before.world.meta.turn;
    const assetId = Object.keys(before.world.corporateSectors).find(id => before.world.corporateSectors[id].corporationId === donor.id)!;
    const asset = before.world.corporateSectors[assetId];
    session.load(JSON.stringify(before));
    expect(session.act("nationalizeCorporation", { corporationId: donor.id, tier: "seizure" }).ok).toBe(true);
    const after = JSON.parse(session.serialize(SAVED_AT));
    after.world.corporations["NAT-US"].liquidCapital = 600;
    after.world.corporations["repeat-media"] = { ...donor, id: "repeat-media", name: "Repeated Media", liquidCapital: 500 };
    after.world.corporateSectors["repeat-media-asset"] = { ...asset, id: "repeat-media-asset", corporationId: "repeat-media" };
    const treasuryBefore = after.world.budgets.US.treasuryBalance;
    session.load(JSON.stringify(after));
    expect(session.act("nationalizeCorporation", { corporationId: "repeat-media", tier: "seizure" }).ok).toBe(true);
    const taken = JSON.parse(session.serialize(SAVED_AT));
    expect(taken.world.budgets.US.treasuryBalance).toBe(treasuryBefore + 500);
    expect(taken.world.corporations["NAT-US"].liquidCapital).toBe(600);
    expect(taken.world.corporations["repeat-media"]).toBeUndefined();
    expect(session.stateOwnership().totals.firmsAbsorbed).toBe(2);
    expect(session.stateOwnership().rows[0].firm).toBe("Repeated Media");
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(resumed.stateOwnership()).toEqual(session.stateOwnership());
  });
});
