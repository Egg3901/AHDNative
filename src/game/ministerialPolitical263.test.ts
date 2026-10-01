import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

// Game968 actual seedPoliticalMetrics, London2019 workerSecurity53.6.
// The generator calls the source seeder at an offline database boundary.
describe("source political cabinet board through GameSession (#263)", () => {
  it("shows the authored London political board and preserves it on normal reload", () => {
    const session = new GameSession();
    session.create({ era: "2019", countryId: "UK", seed: "cabinet-political-263", playerName: "Alex" });
    expect(session.regions({ regionId: "LON" }).selected?.politicalMetrics?.["economy.workerSecurity"]?.value).toBe(53.6);
    const resumed = new GameSession();
    resumed.load(session.serialize("2026-10-01T00:00:00.000Z"));
    expect(resumed.regions({ regionId: "LON" }).selected?.politicalMetrics?.["economy.workerSecurity"]?.value).toBe(53.6);
  });
});
