import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-02T00:00:00.000Z";

// Actual canonical Game absorbSectorIntoNatCorp, independently executed:
// reparent stock1000/book200000 ->850/170000; merge survivor2000/600000
// ->2850/770000. Paid construction40000+10000 transfers without haircut.
describe("source plants ownership transition (#75, #298)", () => {
  it.each([false, true])("preserves the source physical haircut and paid construction through public taking, turn and reload (merge=%s)", merge => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", homeRegionId: "NY", mode: "hos", seed: "source-taking-plant-transition", playerName: "Alex" });
    const saved = JSON.parse(session.serialize(SAVED_AT));
    const donor = saved.world.corporations["US-media"];
    const assetId = Object.keys(saved.world.corporateSectors).find(id => saved.world.corporateSectors[id].corporationId === donor.id)!;
    const asset = saved.world.corporateSectors[assetId];
    Object.assign(asset, {
      capitalStock: 1000, capacityBookAnchor: 200000, constructionInProgressAnchor: 40000,
      buildQueue: [{ unitsOrdered: 100, costPaidAnchor: 40000, startTurn: 0, onlineTurn: 20 }], plantsStartTurn: 0,
    });
    const resultAssetId = merge ? "source-national-survivor" : assetId;
    if (merge) {
      saved.world.corporations["NAT-US-media"] = {
        ...donor, id: "NAT-US-media", isNationalCorporation: true, countryOwnerId: "US", ownershipState: "stateOwned",
        shareholders: [], totalShares: 0, publicFloat: 0, ceoType: "npp", ceoId: "state-US", ceoVacant: false,
      };
      saved.world.corporateSectors[resultAssetId] = {
        ...asset, id: resultAssetId, corporationId: "NAT-US-media", capitalStock: 2000, capacityBookAnchor: 600000,
        constructionInProgressAnchor: 10000, plantsStartTurn: 1,
        buildQueue: [{ unitsOrdered: 10, costPaidAnchor: 10000, startTurn: 0, onlineTurn: 9 }],
      };
    }
    const unowned = saved.world.unownedSectors;
    session.load(JSON.stringify(saved));
    expect(session.act("nationalizeCorporation", { corporationId: donor.id, tier: "seizure" }).ok).toBe(true);
    const taken = JSON.parse(session.serialize(SAVED_AT));
    const result = taken.world.corporateSectors[resultAssetId];
    expect(result.capitalStock).toBe(merge ? 2850 : 850);
    expect(result.capacityBookAnchor).toBe(merge ? 770000 : 170000);
    expect(result.constructionInProgressAnchor).toBe(merge ? 50000 : 40000);
    expect(result.buildQueue.map((order: { onlineTurn: number }) => order.onlineTurn)).toEqual(merge ? [9, 20] : [20]);
    expect(result.buildQueue.reduce((sum: number, order: { costPaidAnchor: number }) => sum + order.costPaidAnchor, 0)).toBe(result.constructionInProgressAnchor);
    expect(result.plantsStartTurn).toBe(0);
    expect(taken.world.corporations[donor.id]).toBeUndefined();
    expect(taken.world.unownedSectors).toEqual(unowned);
    const resumed = new GameSession();
    resumed.load(JSON.stringify(taken));
    resumed.advance();
    const continued = JSON.parse(resumed.serialize(SAVED_AT));
    const continuingAsset = continued.world.corporateSectors[resultAssetId];
    expect(continuingAsset.capitalStock).toBeCloseTo((merge ? 2850 : 850) * 0.9995, 8);
    expect(continuingAsset.capacityBookAnchor).toBeCloseTo((merge ? 770000 : 170000) * 0.9995, 8);
    expect(continuingAsset.constructionInProgressAnchor).toBe(merge ? 50000 : 40000);
    const reload = new GameSession();
    reload.load(JSON.stringify(continued));
    expect(JSON.parse(reload.serialize(SAVED_AT)).world.corporateSectors[resultAssetId]).toEqual(continuingAsset);
  });
});
