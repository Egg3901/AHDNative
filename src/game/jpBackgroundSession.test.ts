import { describe, expect, it } from "vitest";
import { GameSession } from "./session.js";

describe("source JP background systems in a public session", () => {
  it("keeps JP elections active through ordinary turns and save/reload without opening character selection", () => {
    const session = new GameSession(() => new Date("2019-01-01T00:00:00.000Z"));
    session.create({ seed: "jp-public-background-session", playerName: "Tester", countryId: "US", era: "2019" });
    session.advance();

    const firstSave = session.serialize("2019-01-08T00:00:00.000Z");
    const savedWorld = JSON.parse(firstSave) as {
      world: {
        meta: { turn: number };
        countries: Record<string, { playable: boolean }>;
        regions: Record<string, { countryId: string }>;
        elections: Array<{ countryId: string; electionType: string }>;
      };
    };
    const savedJpRegionIds = Object.values(savedWorld.world.regions)
      .filter((region) => region.countryId === "JP").length;
    const savedJpElections = savedWorld.world.elections.filter((election) => election.countryId === "JP");

    expect(savedWorld.world.meta.turn).toBe(1);
    expect(savedWorld.world.countries.JP?.playable).toBe(false);
    expect(savedJpRegionIds).toBe(8);
    expect(savedJpElections.some((election) => election.electionType === "shugiin")).toBe(true);
    expect(savedJpElections.some((election) => election.electionType === "sangiin")).toBe(true);
    expect(savedJpElections.some((election) => election.electionType === "regionalCouncil")).toBe(true);

    const restored = new GameSession(() => new Date("2019-01-01T00:00:00.000Z"));
    restored.load(firstSave);
    session.advance();
    restored.advance();
    const directWorld = (JSON.parse(session.serialize("2019-01-15T00:00:00.000Z")) as { world: unknown }).world;
    const restoredWorld = (JSON.parse(restored.serialize("2019-01-15T00:00:00.000Z")) as { world: unknown }).world;
    expect(restoredWorld).toEqual(directWorld);
  });
});
