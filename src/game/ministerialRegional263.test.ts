import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

// Independently executed loadSeededStateMetrics at Game 96831835. These
// are existing source StateMetrics rows, not order-created metric defaults.
describe("source regional ministerial targets (#263)", () => {
  it("starts a UK player with the authored London unemployment row and preserves it on reload", () => {
    const session = new GameSession();
    session.create({ era: "2019", countryId: "UK", seed: "regional-orders-263", playerName: "Alex" });
    expect(session.regions({ regionId: "LON" }).selected?.metrics["economic.unemploymentRate"]).toBe(4.5);
    const resumed = new GameSession();
    resumed.load(session.serialize("2026-10-01T00:00:00.000Z"));
    expect(resumed.regions({ regionId: "LON" }).selected?.metrics["economic.unemploymentRate"]).toBe(4.5);
  });

  it("issues the authored veteran order to the source regional path through a controlled held-office save", () => {
    const session = new GameSession();
    session.create({ era: "2019", countryId: "UK", seed: "regional-orders-263", playerName: "Alex" });
    // This fixture isolates a holder's issuance contract. It does not claim
    // to earn a UK cabinet appointment or create a head-of-government seat.
    const saved = JSON.parse(session.serialize("2026-10-01T00:00:00.000Z"));
    saved.world.cabinetMembers.push({
      countryId: "UK", positionId: "defence_secretary", characterId: "player",
      characterName: "Alex", partyId: "UK_CON", appointedBy: null,
      appointedAtTurn: 0, confirmedAtTurn: 0, ministerialActions: 4,
      lastMinisterialActionRefillTurn: 0,
    });
    session.load(JSON.stringify(saved));
    const issued = session.issueCabinetOrder({
      positionId: "defence_secretary", orderId: "veterans_support_programme", targetRegionId: "LON",
    });
    expect(issued.result.ok).toBe(true);
    expect(session.cabinetOffice().activeOrders[0]?.effects).toEqual([
      { metric: "economic.unemploymentRate", modifier: -0.04, scope: "regional", regionId: "LON" },
    ]);
  });

  it("applies the source issuer statecraft strength during a normal turn and keeps the regional result on reload", () => {
    const session = new GameSession();
    session.create({ era: "2019", countryId: "UK", seed: "regional-orders-263", playerName: "Alex" });
    session.allocateStats({ charisma: 1, debate: 1, energy: 1, fundraising: 1, businessAcumen: 4, statecraft: 10, intellect: 10 });
    const saved = JSON.parse(session.serialize("2026-10-01T00:00:00.000Z"));
    saved.world.cabinetMembers.push({
      countryId: "UK", positionId: "defence_secretary", characterId: "player",
      characterName: "Alex", partyId: "UK_CON", appointedBy: null,
      appointedAtTurn: 0, confirmedAtTurn: 0, ministerialActions: 4,
      lastMinisterialActionRefillTurn: 0,
    });
    session.load(JSON.stringify(saved));
    expect(session.issueCabinetOrder({ positionId: "defence_secretary", orderId: "veterans_support_programme", targetRegionId: "LON" }).result.ok).toBe(true);
    session.advance();
    // Game968 issuer stat10 gives1.18; source order-.04 receives1.25
    // strength, below the.08 cap. London4.5 becomes4.441.
    expect(session.regions({ regionId: "LON" }).selected?.metrics["economic.unemploymentRate"]).toBeCloseTo(4.441, 10);
    const resumed = new GameSession();
    resumed.load(session.serialize("2026-10-01T00:00:00.000Z"));
    expect(resumed.regions({ regionId: "LON" }).selected?.metrics["economic.unemploymentRate"]).toBeCloseTo(4.441, 10);
    expect(resumed.regions({ regionId: "SCO" }).selected?.metrics["economic.unemploymentRate"]).toBe(3.8);
  });
});
