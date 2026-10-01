import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-01T00:00:00Z";

function savedWorld(session: GameSession) {
  return JSON.parse(session.serialize(SAVED_AT)) as {
    world: {
      meta: { turn: number };
      player: { countryId: string; homeRegionId: string; actions: number };
      regions: Record<string, { countryId: string }>;
      corporateSectors: Record<string, {
        id: string;
        corporationId: string;
        countryId: string;
        stateId: string | null;
        sectorType: string;
        revenue?: number;
        capitalStock?: number;
        capacityBookAnchor?: number;
        producedUnits?: number;
        soldUnits?: number;
        realizedRevenue?: number;
        soldFraction?: number;
        soldByCommodity?: Record<string, number>;
      }>;
      corporations: Record<string, { countryId: string; revenue: number }>;
      unownedSectors: Record<string, { countryId: string; regionId?: string; sectorType: string; revenue: number }>;
      referendums: Array<{ id: string; status: string; regionId: string; westminsterBillId?: string; campaignCloseTurn?: number }>;
      bills: Array<{ id: string; status: string }>;
    };
  };
}

describe("#298 saved secession ownership through GameSession", () => {
  it("requests, passes and signs an independence referendum then saves regional ownership", () => {
    const session = new GameSession();
    session.create({ era: "2019", countryId: "UK", homeRegionId: "SCO", playerName: "Tester", seed: "session-secession-ownership" });
    const opening = savedWorld(session);
    opening.world.regions.SCO!.independenceDesire = 90;
    opening.world.player.actions = 3;
    session.load(JSON.stringify(opening));

    expect(session.act("requestReferendum", { regionId: "SCO" }).ok).toBe(true);
    expect(session.politics().referendums[0]?.status).toBe("granted");
    // The source campaign-window tests cover the full configured duration.
    // Shorten this journey's persisted campaign close to exercise the same
    // public grant→campaign→poll→actuation path without simulating 48 months.
    const campaign = savedWorld(session);
    campaign.world.referendums[0]!.campaignCloseTurn = campaign.world.meta.turn + 1;
    session.load(JSON.stringify(campaign));
    for (let turn = 0; turn < 2 && session.politics().referendums[0]?.status !== "polling"; turn++) session.advance();
    expect(session.politics().referendums[0]?.status).toBe("polling");
    session.advance();

    const pending = savedWorld(session);
    const referendum = pending.world.referendums[0]!;
    expect(referendum.status).toBe("actuating");
    const parentAssets = Object.values(pending.world.corporateSectors).filter((asset) => asset.countryId === "UK" && asset.stateId === "SCO");
    const parentAssetIds = parentAssets.map((asset) => asset.id).sort();
    const additiveTotals = (assets: typeof parentAssets) => Object.fromEntries(
      ["capitalStock", "capacityBookAnchor", "producedUnits", "soldUnits", "realizedRevenue"].map((field) => [
        field,
        assets.reduce((sum, asset) => sum + (asset[field as keyof typeof asset] as number | undefined ?? 0), 0),
      ]),
    );
    const bill = pending.world.bills.find((row) => row.id === referendum.westminsterBillId);
    expect(bill).toBeDefined();
    bill!.status = "signed";
    session.load(JSON.stringify(pending));
    session.advance();

    const completed = savedWorld(session);
    expect(completed.world.referendums[0]?.status).toBe("completed");
    expect(completed.world.player.countryId).toBe("SCO");
    expect(completed.world.player.homeRegionId).toBe("LOT");
    const leafAssets = Object.values(completed.world.corporateSectors).filter((asset) => asset.countryId === "SCO" && asset.stateId !== null);
    expect(leafAssets.map((asset) => asset.id).sort()).toEqual(parentAssetIds);
    const leafPlantTotals = additiveTotals(leafAssets);
    expect(Object.values(leafPlantTotals).some((value) => value! > 0)).toBe(true);
    const leafCorporateReceipts = leafAssets.reduce((sum, asset) => sum + (asset.revenue ?? 0), 0);
    const leafPools = Object.values(completed.world.unownedSectors).filter((pool) => pool.countryId === "SCO");
    const leafUnownedReceipts = leafPools.reduce((sum, pool) => sum + pool.revenue, 0);
    expect(leafAssets.every((asset) => completed.world.regions[asset.stateId!]?.countryId === "SCO")).toBe(true);

    const restored = new GameSession();
    restored.load(session.serialize(SAVED_AT));
    const reload = savedWorld(restored);
    expect(reload.world.referendums[0]?.status).toBe("completed");
    const reloadedAssets = Object.values(reload.world.corporateSectors).filter((asset) => asset.countryId === "SCO" && asset.stateId !== null);
    expect(reloadedAssets.map((asset) => asset.id).sort()).toEqual(parentAssetIds);
    expect(additiveTotals(reloadedAssets)).toEqual(leafPlantTotals);
    expect(reloadedAssets.reduce((sum, asset) => sum + (asset.revenue ?? 0), 0)).toBeCloseTo(leafCorporateReceipts, 3);
    expect(Object.values(reload.world.unownedSectors).filter((pool) => pool.countryId === "SCO").reduce((sum, pool) => sum + pool.revenue, 0))
      .toBeCloseTo(leafUnownedReceipts, 3);
  });
});
