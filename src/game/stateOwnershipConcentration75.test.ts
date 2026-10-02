import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const SAVED_AT = "2026-10-02T00:00:00.000Z";

describe("actual corporate ownership at the public turn/save boundary (#75)", () => {
  it("measures host-state revenue, includes foreign-state revenue only in the denominator, and preserves the source vector after reload", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "source-concentration-assets", playerName: "Alex", mode: "hos", homeRegionId: "NY" });
    const saved = JSON.parse(session.serialize(SAVED_AT));
    // Public simulation controls hold the exact source revenue vector while
    // ordinary turn/save orchestration measures its real ownership state.
    Object.assign(saved.world.featureFlags, { corporations: false, foreignExchange: false });
    saved.world.exchangeRates.US.rate = 1;
    saved.world.exchangeRates.UK.rate = 0.5;
    for (const asset of Object.values(saved.world.corporateSectors) as any[]) asset.revenue = 0;
    const template = (Object.values(saved.world.corporateSectors) as any[]).find(asset => asset.corporationId === "US-media");
    Object.assign(saved.world.corporations["US-media"], { countryOwnerId: "US", ownershipState: "stateOwned", isNationalCorporation: true });
    Object.assign(saved.world.corporations["UK-media"], { countryOwnerId: "UK", ownershipState: "stateOwned", isNationalCorporation: true });
    const vector = [
      { id: "source-home-owned", corporationId: "US-media", countryId: "US", stateId: "NY", revenue: 100 },
      { id: "source-private", corporationId: "US-manufacturing", countryId: "US", stateId: "NY", revenue: 200 },
      // Game stores this foreign owner's receipt as GBP150. Native's asset
      // receipt is host-local USD300; both represent anchor300 at GBP0.5.
      { id: "source-foreign-owned", corporationId: "UK-media", countryId: "US", stateId: "NY", revenue: 300 },
      { id: "source-foreign-host", corporationId: "US-media", countryId: "UK", stateId: Object.keys(saved.world.regions).find(id => saved.world.regions[id].countryId === "UK"), revenue: 999999 },
    ];
    for (const row of vector) saved.world.corporateSectors[row.id] = { ...template, representingUnionId: null, ...row };
    session.load(JSON.stringify(saved));
    session.advance();
    // Independently executed current Game computeCountryStateOwnershipConcentration.
    expect(JSON.parse(session.serialize(SAVED_AT)).world.budgets.US.stateOwnershipConcentration).toBeCloseTo(16.666666666666668, 10);
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    session.advance(); resumed.advance();
    expect(resumed.serialize(SAVED_AT)).toBe(session.serialize(SAVED_AT));
    expect(JSON.parse(resumed.serialize(SAVED_AT)).world.budgets.US.stateOwnershipConcentration).toBeCloseTo(16.666666666666668, 10);
  });

  it("records zero when no state owns an asset, including command economies", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "RU", seed: "source-no-state-assets", playerName: "Alex", mode: "hos" });
    session.advance();
    const saved = JSON.parse(session.serialize(SAVED_AT));
    expect(saved.world.budgets.RU.stateOwnershipConcentration).toBe(0);
    expect(saved.world.budgets.DD.stateOwnershipConcentration).toBe(0);
  });
});
