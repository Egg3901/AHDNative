import { describe, expect, it } from "vitest";
import { adExposure } from "@ahdclient/engine";
import { GameSession } from "./session.js";

describe("public standing targeted-ad journey", () => {
  it("buys a quoted home-region audience, advances, and reloads source exposure", () => {
    const session = new GameSession();
    const before = session.create({ seed: "standing-ad-public", playerName: "Tester", countryId: "US", era: "1953" });
    const action = before.actions.find((entry) => entry.id === "targetedAds")!;
    expect(action).toMatchObject({ available: true, requires: "targetedAd", quoteRevision: 0, fundCost: 100 });
    const region = action.regionChoices?.[0];
    const target = action.choices?.[0];
    expect(region).toBeDefined();
    expect(target).toBeDefined();

    const result = session.act("targetedAds", {
      regionId: region!.id,
      demographicCategory: target!.id.split(":")[0],
      demographicGroup: target!.id.split(":")[1],
      expectedRevision: action.quoteRevision,
    });
    expect(result.ok).toBe(true);
    const afterPurchase = JSON.parse(session.serialize("2026-10-03T00:00:00.000Z")) as {
      world: { meta: { turn: number }; player: { targetedAds: Array<{ stateId: string; dimension: string; bucket: string; bonus: number; lastPurchaseTurn: number }>; targetedAdsRevision: number } };
    };
    expect(afterPurchase.world.player.targetedAds).toEqual([{
      stateId: region!.id,
      dimension: target!.id.split(":")[0],
      bucket: target!.id.split(":")[1],
      bonus: 0.01,
      lastPurchaseTurn: before.turn,
    }]);
    expect(afterPurchase.world.player.targetedAdsRevision).toBe(1);

    const next = session.advance();
    expect(next.turn).toBe(before.turn + 1);
    const save = session.serialize("2026-10-03T00:01:00.000Z");
    const resumed = new GameSession();
    const loaded = resumed.load(save);
    expect(loaded.turn).toBe(next.turn);
    const reloaded = JSON.parse(resumed.serialize("2026-10-03T00:02:00.000Z")) as {
      world: { player: { targetedAds: Array<{ stateId: string; dimension: string; bucket: string; bonus: number; lastPurchaseTurn: number }>; targetedAdsRevision: number } };
    };
    expect(reloaded.world.player.targetedAdsRevision).toBe(1);
    expect(reloaded.world.player.targetedAds[0]).toMatchObject(afterPurchase.world.player.targetedAds[0]!);
    expect(reloaded.world.player.targetedAds[0]!.bonus).toBe(0.01);
    expect(adExposure(reloaded.world.player.targetedAds[0]!, loaded.turn)).toBeCloseTo(0.01 * 2 ** (-1 / 24), 12);
  });
});
