import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

// Game968 actual seedPoliticalMetrics, London2019 workerSecurity53.6.
// The generator calls the source seeder at an offline database boundary.
describe("source political cabinet board through GameSession (#263)", () => {
  it("lets an earned US defence minister drive the real safety board through turns and reload", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "native-cabinet-player-flow-262", playerName: "Alex", mode: "hos" });
    expect(session.act("sponsorCabinetNomination", { countryId: "US", positionId: "secretary_of_defense", nomineeId: "player" }).ok).toBe(true);
    for (let turn = 0; turn < 25 && !session.cabinetOffice().positions.find(row => row.id === "secretary_of_defense")?.isPlayerHolder; turn++) session.advance();
    expect(session.cabinetOffice().positions.find(row => row.id === "secretary_of_defense")?.isPlayerHolder).toBe(true);
    expect(session.issueCabinetOrder({ positionId: "secretary_of_defense", orderId: "national_guard_deployment" }).result.ok).toBe(true);
    session.advance();
    const resumed = new GameSession();
    resumed.load(session.serialize("2026-10-01T00:00:00.000Z"));
    resumed.advance();
    // No allocated stat block: actual Game uses its neutral issuer fallback.
    // Source map/fold contribution .8 -> .799, without a legacy safety row.
    expect(resumed.regions({ regionId: "AL" }).selected?.politicalMetrics?.["order.safety"]?.cabinetResidual).toBe(0.799);
    const world = JSON.parse(resumed.serialize("2026-10-01T00:00:00.000Z")).world;
    expect(world.nationalMetrics.US["publicSafety.crimeRate"]).toBeUndefined();
    expect(world.regionalMetrics.AL["publicSafety.crimeRate"]).toBeUndefined();
  }, 180_000);
  it("shows the authored London political board and preserves it on normal reload", () => {
    const session = new GameSession();
    session.create({ era: "2019", countryId: "UK", seed: "cabinet-political-263", playerName: "Alex" });
    expect(session.regions({ regionId: "LON" }).selected?.politicalMetrics?.["economy.workerSecurity"]?.value).toBe(53.6);
    const resumed = new GameSession();
    resumed.load(session.serialize("2026-10-01T00:00:00.000Z"));
    expect(resumed.regions({ regionId: "LON" }).selected?.politicalMetrics?.["economy.workerSecurity"]?.value).toBe(53.6);
  });
  it("consumes the source veterans contribution one turn later without moving another region", () => {
    const session = new GameSession();
    session.create({ era: "2019", countryId: "UK", seed: "cabinet-political-263", playerName: "Alex" });
    session.allocateStats({ charisma: 1, debate: 1, energy: 1, fundraising: 1, businessAcumen: 4, statecraft: 10, intellect: 10 });
    const saved = JSON.parse(session.serialize("2026-10-01T00:00:00.000Z"));
    // A recorded holder isolates the public order/turn/save contract. The
    // appointment itself is the separately audited canonical SP slice.
    saved.world.cabinetMembers.push({
      countryId: "UK", positionId: "defence_secretary", characterId: "player",
      characterName: "Alex", partyId: "UK_CON", appointedBy: null,
      appointedAtTurn: 0, confirmedAtTurn: 0, ministerialActions: 4,
      lastMinisterialActionRefillTurn: 0,
    });
    session.load(JSON.stringify(saved));
    const otherBefore = session.regions({ regionId: "SCO" }).selected?.politicalMetrics?.["economy.workerSecurity"]?.cabinetResidual;
    expect(session.issueCabinetOrder({ positionId: "defence_secretary", orderId: "veterans_support_programme", targetRegionId: "LON" }).result.ok).toBe(true);
    session.advance();
    expect(session.regions({ regionId: "LON" }).selected?.politicalMetrics?.["economy.workerSecurity"]?.cabinetResidual).toBe(0);
    const resumed = new GameSession();
    resumed.load(session.serialize("2026-10-01T00:00:00.000Z"));
    resumed.advance();
    // Actual Game foldCabinetResiduals output for the stat10 contribution
    // 0.944, mapped before macro strength/cap: the first residual is0.9422.
    expect(resumed.regions({ regionId: "LON" }).selected?.politicalMetrics?.["economy.workerSecurity"]?.cabinetResidual).toBe(0.9422);
    // Actual source processPoliticalMetricsDynamics with the same recorded
    // macro unemployment and standing order, including its bounded macro term.
    expect(resumed.regions({ regionId: "LON" }).selected?.politicalMetrics?.["economy.workerSecurity"]?.value).toBeCloseTo(53.858844, 9);
    expect(resumed.regions({ regionId: "SCO" }).selected?.politicalMetrics?.["economy.workerSecurity"]?.cabinetResidual).toBe(otherBefore);
    const secondReload = new GameSession();
    secondReload.load(resumed.serialize("2026-10-01T00:00:00.000Z"));
    expect(secondReload.regions({ regionId: "LON" }).selected?.politicalMetrics?.["economy.workerSecurity"]?.cabinetResidual).toBe(0.9422);
  });

});
