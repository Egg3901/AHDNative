import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { electionSeriesForWorld } from "./orchestration.js";

describe("source JP background election producer", () => {
  it.each(["1953", "1979", "1991", "1999", "2007", "2019", "2023"] as const)(
    "seeds source eight-region JP political systems for %s without enabling JP character selection",
    (era) => {
      const world = createWorld({ seed: `jp-background-${era}`, playerName: "Tester", countryId: "US", era });
      const regions = Object.values(world.regions).filter((region) => region.countryId === "JP");
      expect(world.countries.JP?.playable).toBe(false);
      expect(regions.map((region) => region.id).sort()).toEqual(["CGK", "CHU", "HOK", "KAN", "KNS", "KYU", "SHI", "TOH"]);
      expect(Object.keys(world.stateDemographics).filter((regionId) => world.stateDemographics[regionId]?.countryId === "JP")).toHaveLength(8);
      const series = electionSeriesForWorld(world).filter((row) => row.countryId === "JP");
      expect(series.filter((row) => row.electionType === "shugiin")).toHaveLength(8);
      expect(series.filter((row) => row.electionType === "sangiin")).toHaveLength(16);
      expect(series.filter((row) => row.electionType === "regionalCouncil")).toHaveLength(8);
      const totalSeatsFor = (electionType: string) => series
        .filter((row) => row.electionType === electionType)
        .reduce((total, row) => total + row.totalSeats, 0);
      // Current Game jpSeats source maps: 466/512/465 Shugiin and 248/252
      // Sangiin seats by preset; institutionsFacts sets 2,679 regional seats.
      expect(totalSeatsFor("shugiin")).toBe(era === "1953" ? 466 : era === "1991" ? 512 : 465);
      expect(totalSeatsFor("sangiin")).toBe(era === "1991" ? 252 : 248);
      expect(totalSeatsFor("regionalCouncil")).toBe(2679);
      expect([1, 2].map((chamberClass) => series
        .filter((row) => row.electionType === "sangiin" && row.chamberClass === chamberClass)
        .reduce((total, row) => total + row.totalSeats, 0))).toEqual(era === "1991" ? [126, 126] : [125, 123]);
      expect(world.partyRegions["HOK:JP_LDP"] ?? world.partyRegions["HOK:JP_RYO"]).toBeDefined();
      if (era === "1953" || era === "1979") {
        expect(world.politicians.filter((politician) => politician.countryId === "JP")).toHaveLength(0);
        expect(world.legislatures.JP?.chambers.find((chamber) => chamber.key === "shugiin")?.composition).toMatchObject({ seatsByParty: {}, vacancies: era === "1953" ? 466 : 465 });
      }
      expect(() => createWorld({ seed: `jp-background-${era}`, playerName: "Tester", countryId: "JP", era })).toThrow(/not playable/);
    },
  );

  it("runs JP schedules through the ordinary turn phase while keeping character selection disabled", () => {
    const world = createWorld({ seed: "jp-background-ordinary-turn", playerName: "Tester", countryId: "US", era: "2019" });
    const report = advanceTurn(world);
    const jpElections = world.elections.filter((election) => election.countryId === "JP");

    expect(report.turn).toBe(world.meta.turn);
    expect(world.meta.turn).toBe(1);
    expect(jpElections.length).toBeGreaterThan(0);
    expect(jpElections.some((election) => election.electionType === "shugiin")).toBe(true);
    expect(jpElections.some((election) => election.electionType === "sangiin")).toBe(true);
    expect(jpElections.some((election) => election.electionType === "regionalCouncil")).toBe(true);
    expect(world.countries.JP?.playable).toBe(false);
  });
});
