import { describe, expect, it } from "vitest";
import { applyResolution } from "../../packages/engine/src/elections/orchestration.js";
import { deserializeSave, serializeSave } from "@ahdclient/engine";
import type { ElectionRecord } from "@ahdclient/engine";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-01T00:00:00Z";

function savedWorld(session: GameSession) {
  return JSON.parse(session.serialize(SAVED_AT)) as {
    world: {
      meta: { turn: number };
      elections: ElectionRecord[];
      player: {
        countryId: string;
        homeRegionId: string;
        actions: number;
        legislativeSeat: {
          countryId: string;
          chamberKey: string;
          regionId?: string;
        } | null;
      };
      regions: Record<string, { countryId: string; independenceDesire?: number }>;
      corporateSectors: Record<
        string,
        {
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
        }
      >;
      corporations: Record<string, { countryId: string; revenue: number }>;
      unownedSectors: Record<
        string,
        {
          countryId: string;
          regionId?: string;
          sectorType: string;
          revenue: number;
        }
      >;
      referendums: Array<{
        id: string;
        status: string;
        regionId: string;
        westminsterBillId?: string;
        campaignCloseTurn?: number;
      }>;
      bills: Array<{
        id: string;
        status: string;
        currentChamber: string;
        votingEndsOnTurn?: number;
        presidentActionDeadlineOnTurn?: number;
      }>;
    };
  };
}

describe("#298 saved secession ownership through GameSession", () => {
  it("requests, passes and signs an independence referendum then saves regional ownership", () => {
    const session = new GameSession();
    session.create({
      era: "2019",
      countryId: "UK",
      homeRegionId: "SCO",
      playerName: "Tester",
      seed: "session-secession-ownership",
    });
    const opening = savedWorld(session);
    opening.world.regions.SCO!.independenceDesire = 90;
    opening.world.player.actions = 3;
    const sourceSeat: ElectionRecord = {
      id: "UK-commons-player-seat",
      electionType: "commons",
      countryId: "UK",
      cycle: 1,
      status: "active" as const,
      startTurn: opening.world.meta.turn,
      primaryEndTurn: opening.world.meta.turn,
      endTurn: opening.world.meta.turn,
      totalSeats: 1,
      chamberKey: "commons",
      candidates: [
        {
          id: "player",
          name: "Tester",
          partyId: "UK_SNP",
          isNPP: false,
          incumbent: false,
        },
      ],
      tally: { player: 100 },
    };
    session.load(JSON.stringify(opening));
    const electedWorld = deserializeSave(session.serialize(SAVED_AT));
    electedWorld.elections.push(sourceSeat);
    applyResolution(electedWorld, sourceSeat);
    expect(electedWorld.player.legislativeSeat).toMatchObject({
      countryId: "UK",
      chamberKey: "commons",
    });
    session.load(serializeSave(electedWorld, SAVED_AT));

    expect(session.act("requestReferendum", { regionId: "SCO" }).ok).toBe(true);
    expect(session.politics().referendums[0]?.status).toBe("granted");
    // Separate lifecycle tests cover the full configured campaign and consent
    // windows. This integration shortens persisted deadlines only; request,
    // player vote, ordinary bill processing and actuation remain public paths.
    const campaign = savedWorld(session);
    campaign.world.referendums[0]!.campaignCloseTurn =
      campaign.world.meta.turn + 1;
    session.load(JSON.stringify(campaign));
    for (
      let turn = 0;
      turn < 2 && session.politics().referendums[0]?.status !== "polling";
      turn++
    )
      session.advance();
    expect(session.politics().referendums[0]?.status).toBe("polling");
    session.advance();

    const pending = savedWorld(session);
    const referendum = pending.world.referendums[0]!;
    expect(referendum.status).toBe("actuating");
    const bill = pending.world.bills.find(
      (row) => row.id === referendum.westminsterBillId,
    );
    expect(bill).toBeDefined();
    expect(bill!.status).toBe("active");
    expect(bill!.currentChamber).toBe("commons");
    expect(
      session.view().legislature.bills.find((row) => row.id === bill!.id)
        ?.voting.available,
    ).toBe(true);
    // Keep the successful public session journey short; separate lifecycle tests
    // retain source's full campaign and consent windows.
    bill!.votingEndsOnTurn = pending.world.meta.turn + 1;
    session.load(JSON.stringify(pending));
    expect(
      session.act("voteOnBill", { billId: bill!.id, vote: "for" }),
    ).toMatchObject({ ok: true });

    const afterVote = new GameSession();
    afterVote.load(session.serialize(SAVED_AT));
    afterVote.advance();
    expect(
      savedWorld(afterVote).world.bills.find((row) => row.id === bill!.id)
        ?.status,
    ).toBe("enrolled");
    const enrolled = savedWorld(afterVote);
    const enrolledBill = enrolled.world.bills.find(
      (row) => row.id === bill!.id,
    )!;
    enrolledBill.presidentActionDeadlineOnTurn = enrolled.world.meta.turn + 1;
    afterVote.load(JSON.stringify(enrolled));

    const control = new GameSession();
    const failedControl = savedWorld(afterVote);
    failedControl.world.bills.find((row) => row.id === bill!.id)!.status =
      "failed";
    control.load(JSON.stringify(failedControl));
    afterVote.advance();
    control.advance();
    expect(savedWorld(afterVote).world.referendums[0]?.status).toBe(
      "completed",
    );
    expect(savedWorld(control).world.referendums[0]?.status).toBe("cancelled");

    const completed = savedWorld(afterVote);
    expect(completed.world.referendums[0]?.status).toBe("completed");
    expect(completed.world.player.countryId).toBe("SCO");
    expect(completed.world.player.homeRegionId).toBe("LOT");
    const leafAssets = Object.values(completed.world.corporateSectors).filter(
      (asset) => asset.countryId === "SCO" && asset.stateId !== null,
    );
    const controlWorld = savedWorld(control).world;
    const controlParentAssets = Object.values(
      controlWorld.corporateSectors,
    ).filter((asset) => asset.countryId === "UK" && asset.stateId === "SCO");
    expect(leafAssets.map((asset) => asset.id).sort()).toEqual(
      controlParentAssets.map((asset) => asset.id).sort(),
    );
    const additiveTotals = (assets: typeof leafAssets) =>
      Object.fromEntries(
        [
          "capitalStock",
          "capacityBookAnchor",
          "producedUnits",
          "soldUnits",
          "realizedRevenue",
        ].map((field) => [
          field,
          assets.reduce(
            (sum, asset) =>
              sum +
              ((asset[field as keyof typeof asset] as number | undefined) ?? 0),
            0,
          ),
        ]),
      );
    expect(additiveTotals(leafAssets)).toEqual(
      additiveTotals(controlParentAssets),
    );
    const leafCorporateReceipts = leafAssets.reduce(
      (sum, asset) => sum + (asset.revenue ?? 0),
      0,
    );
    expect(leafCorporateReceipts).toBeCloseTo(
      controlParentAssets.reduce((sum, asset) => sum + (asset.revenue ?? 0), 0),
      3,
    );
    const leafPools = Object.values(completed.world.unownedSectors).filter(
      (pool) => pool.countryId === "SCO",
    );
    const leafUnownedReceipts = leafPools.reduce(
      (sum, pool) => sum + pool.revenue,
      0,
    );
    const controlParentPools = Object.values(
      controlWorld.unownedSectors,
    ).filter((pool) => pool.countryId === "UK" && pool.regionId === "SCO");
    expect(leafUnownedReceipts).toBeCloseTo(
      controlParentPools.reduce((sum, pool) => sum + pool.revenue, 0),
      3,
    );
    expect(
      leafAssets.every(
        (asset) => completed.world.regions[asset.stateId!]?.countryId === "SCO",
      ),
    ).toBe(true);

    const eventCountryCorporateReceipts = Object.values(
      completed.world.corporateSectors,
    )
      .filter((asset) => asset.countryId === "UK" || asset.countryId === "SCO")
      .reduce((sum, asset) => sum + (asset.revenue ?? 0), 0);
    const controlCountryCorporateReceipts = Object.values(
      controlWorld.corporateSectors,
    )
      .filter((asset) => asset.countryId === "UK")
      .reduce((sum, asset) => sum + (asset.revenue ?? 0), 0);
    expect(eventCountryCorporateReceipts).toBeCloseTo(
      controlCountryCorporateReceipts,
      3,
    );
    const eventCountryUnownedReceipts = Object.values(
      completed.world.unownedSectors,
    )
      .filter((pool) => pool.countryId === "UK" || pool.countryId === "SCO")
      .reduce((sum, pool) => sum + pool.revenue, 0);
    const controlCountryUnownedReceipts = Object.values(
      controlWorld.unownedSectors,
    )
      .filter((pool) => pool.countryId === "UK")
      .reduce((sum, pool) => sum + pool.revenue, 0);
    expect(eventCountryUnownedReceipts).toBeCloseTo(
      controlCountryUnownedReceipts,
      3,
    );

    const restored = new GameSession();
    restored.load(afterVote.serialize(SAVED_AT));
    const reload = savedWorld(restored);
    expect(reload.world.referendums[0]?.status).toBe("completed");
    const reloadedAssets = Object.values(reload.world.corporateSectors).filter(
      (asset) => asset.countryId === "SCO" && asset.stateId !== null,
    );
    expect(reloadedAssets.map((asset) => asset.id).sort()).toEqual(
      leafAssets.map((asset) => asset.id).sort(),
    );
    expect(additiveTotals(reloadedAssets)).toEqual(additiveTotals(leafAssets));
    expect(
      reloadedAssets.reduce((sum, asset) => sum + (asset.revenue ?? 0), 0),
    ).toBeCloseTo(leafCorporateReceipts, 3);
    expect(
      Object.values(reload.world.unownedSectors)
        .filter((pool) => pool.countryId === "SCO")
        .reduce((sum, pool) => sum + pool.revenue, 0),
    ).toBeCloseTo(leafUnownedReceipts, 3);
  }, 120_000);
});
