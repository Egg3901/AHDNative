import { describe, expect, it } from "vitest";
import { deserializeSave, type WorldState } from "@ahdclient/engine";
import { GameSession } from "./session";

function sessionWorld(session: GameSession): WorldState {
  return deserializeSave(session.serialize("2026-10-01T00:00:00.000Z"));
}

describe("corporate plants through GameSession", () => {
  it("settles real sales and receipts without compounding demand across save/reload", () => {
    const options = { era: "1953", countryId: "US", seed: "plants-session-replay", playerName: "Alex" } as const;
    const stamp = "2026-10-01T00:00:00.000Z";
    const session = new GameSession();
    session.create(options);

    session.advance();
    let world = sessionWorld(session);
    const firstAssets = Object.values(world.corporateSectors ?? {});
    expect(firstAssets.some((asset) => (asset.producedUnits ?? 0) > 0)).toBe(true);
    expect(firstAssets.some((asset) => (asset.soldUnits ?? 0) > 0)).toBe(true);
    for (const asset of firstAssets) {
      expect(world.corporations[asset.corporationId]!.revenue).toBe(asset.realizedRevenue);
      expect(asset.soldUnits).toBeLessThanOrEqual(asset.producedUnits!);
    }
    const firstExternalDemand = structuredClone(world.plantMarketDemand!.external);

    // Repeated public turn rebuilds the buyer book from the prior recorded
    // output. Its authored external component remains stable rather than
    // absorbing its own plant-input leg on each pass.
    session.advance();
    world = sessionWorld(session);
    expect(world.plantMarketDemand!.external).toEqual(firstExternalDemand);
    expect(Object.values(world.corporateSectors ?? {}).some((asset) => (asset.soldUnits ?? 0) > 0)).toBe(true);
    for (const [commodity, row] of Object.entries(world.commodityPrices)) {
      const externalSupply = world.plantMarketDemand!.externalSupply?.[commodity] ?? 0;
      const corporateSupply = world.plantMarketDemand!.corporateOutputSupply?.[commodity] ?? 0;
      expect(Math.abs(row.globalSupply - externalSupply - corporateSupply)).toBeLessThanOrEqual(30.01);
    }
    const replayBase = session.serialize(stamp);

    const continuous = new GameSession();
    continuous.load(replayBase);
    const resumed = new GameSession();
    resumed.load(replayBase);
    continuous.advance();
    resumed.advance();
    expect(resumed.serialize(stamp)).toBe(continuous.serialize(stamp));
    const replayedWorld = sessionWorld(resumed);
    expect(Object.values(replayedWorld.corporateSectors ?? {}).some((asset) => (asset.soldUnits ?? 0) > 0)).toBe(true);
    expect(replayedWorld.plantMarketDemand!.external).toEqual(firstExternalDemand);
  });
});
