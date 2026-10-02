import { describe, expect, it } from "vitest";
import { executeAction } from "../actions/execute.js";
import { createWorld } from "../world.js";
import { deserializeSave, serializeSave } from "../save.js";
import { getEraNominalScale } from "../commodity/constants.js";
import { getRateForCountry } from "../forex/conversion.js";

describe("source player corporation founding", () => {
  it("debits the founder, seeds the private issuer and persists player origin, CEO, shares, HQ, and cooldown", () => {
    const world = createWorld({ era: "1953", countryId: "US", seed: "player-corp-founding", playerName: "Alex", startingCash: 1_000_000 });
    world.player.cash = 1_000_000;
    const scale = getEraNominalScale(world.meta.era);
    const rate = getRateForCountry(world, "US");
    const baseline = Math.round(1_000_000 * scale);
    const cashBefore = world.player.cash;
    const result = executeAction(world, "player", "foundCorporation", {
      corporationName: "Northstar Works", tickerSymbol: "NSW", sectorType: "manufacturing", startingCapital: baseline,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const corp = Object.values(world.corporations).find((row) => row.tickerSymbol === "NSW")!;
    expect(corp).toMatchObject({
      name: "Northstar Works", countryId: "US", headquartersRegionId: world.player.homeRegionId,
      ceoId: "player", ceoType: "player", nationalizationOwnerKind: "player",
      ownershipState: "private", liquidCapital: Math.round(baseline * rate),
      totalShares: 10_000_000, publicFloat: 0,
      shareholders: [{ holder: "player", shares: 10_000_000 }],
    });
    expect(world.player.cash).toBe(cashBefore - Math.round(baseline * rate));
    expect(world.player.lastCorporationFoundedTurn).toBe(world.meta.turn);
    const reloaded = deserializeSave(serializeSave(world, "2026-10-02T00:00:00.000Z"));
    expect(reloaded.corporations[corp.id]).toEqual(corp);
    expect(reloaded.player.lastCorporationFoundedTurn).toBe(world.meta.turn);
  });

  it("rejects inaccessible home markets and cooldown attempts without debiting cash", () => {
    const world = createWorld({ era: "1953", countryId: "RU", seed: "player-corp-founding-command", playerName: "Alex", startingCash: 1_000_000 });
    const baseline = Math.round(1_000_000 * getEraNominalScale(world.meta.era));
    const cash = world.player.cash;
    const blocked = executeAction(world, "player", "foundCorporation", {
      corporationName: "Private Works", tickerSymbol: "PWRK", sectorType: "manufacturing", startingCapital: baseline,
    });
    expect(blocked).toMatchObject({ ok: false });
    expect(world.player.cash).toBe(cash);
    expect(world.player.lastCorporationFoundedTurn).toBeUndefined();

    const market = createWorld({ era: "1953", countryId: "US", seed: "player-corp-founding-cooldown", playerName: "Alex", startingCash: 1_000_000 });
    market.player.cash = 1_000_000;
    market.player.lastCorporationFoundedTurn = market.meta.turn;
    const heldCash = market.player.cash;
    const cooldown = executeAction(market, "player", "foundCorporation", {
      corporationName: "Second Works", tickerSymbol: "SECO", sectorType: "manufacturing", startingCapital: baseline,
    });
    expect(cooldown).toMatchObject({ ok: false });
    expect(market.player.cash).toBe(heldCash);
  });
});
