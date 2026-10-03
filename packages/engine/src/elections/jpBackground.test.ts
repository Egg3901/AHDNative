import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { electionSeriesForWorld } from "./orchestration.js";

describe("source JP background election producer", () => {
  it.each(["1953", "1979", "1991", "1999", "2007", "2019", "2023"] as const)(
    "seeds source eight-region JP political systems for %s with its source player tier",
    (era) => {
      const world = createWorld({ seed: `jp-background-${era}`, playerName: "Tester", countryId: "US", era });
      const regions = Object.values(world.regions).filter((region) => region.countryId === "JP");
      expect(world.countries.JP?.playable).toBe(era !== "1953" && era !== "1979");
      expect(regions.map((region) => region.id).sort()).toEqual(["CGK", "CHU", "HOK", "KAN", "KNS", "KYU", "SHI", "TOH"]);
      expect(Object.keys(world.stateDemographics).filter((regionId) => world.stateDemographics[regionId]?.countryId === "JP")).toHaveLength(8);
      const series = electionSeriesForWorld(world).filter((row) => row.countryId === "JP");
      expect(series.filter((row) => row.electionType === "shugiin")).toHaveLength(8);
      expect(series.filter((row) => row.electionType === "sangiin")).toHaveLength(16);
      expect(series.filter((row) => row.electionType === "regionalCouncil")).toHaveLength(8);
      const totalSeatsFor = (electionType: string) => series
        .filter((row) => row.electionType === electionType)
        .reduce((total, row) => total + row.totalSeats, 0);
      // Current Game `getJpShugiinSeats`: historical 1953/1991 maps, modern
      // fallback for other presets; geographic StateSeed counts are separate.
      const expectedShugiinSeats = era === "1953"
        ? { HOK: 21, TOH: 66, KAN: 109, CHU: 78, KNS: 84, CGK: 31, SHI: 18, KYU: 59 }
        : era === "1991"
          ? { HOK: 23, TOH: 50, KAN: 145, CHU: 86, KNS: 92, CGK: 34, SHI: 20, KYU: 62 }
          : { HOK: 12, TOH: 37, KAN: 150, CHU: 81, KNS: 82, CGK: 28, SHI: 14, KYU: 61 };
      expect(Object.fromEntries(series
        .filter((row) => row.electionType === "shugiin")
        .map((row) => [row.state ?? "", row.totalSeats]))).toEqual(expectedShugiinSeats);
      expect(totalSeatsFor("shugiin")).toBe(era === "1953" ? 466 : era === "1991" ? 512 : 465);
      expect(totalSeatsFor("sangiin")).toBe(era === "1991" ? 252 : 248);
      expect(totalSeatsFor("regionalCouncil")).toBe(2679);
      if (era === "1991") {
        expect(regions.find((region) => region.id === "KAN")?.houseSeats).toBe(144);
        expect(series.find((row) => row.electionType === "shugiin" && row.state === "KAN")?.totalSeats).toBe(145);
        const chamber = world.legislatures.JP?.chambers.find((row) => row.key === "shugiin");
        expect(chamber?.seats).toBe(512);
        expect(chamber?.composition).toMatchObject({ seatsByParty: { JP_IND: 26 }, vacancies: 0 });
      }
      expect([1, 2].map((chamberClass) => series
        .filter((row) => row.electionType === "sangiin" && row.chamberClass === chamberClass)
        .reduce((total, row) => total + row.totalSeats, 0))).toEqual(era === "1991" ? [126, 126] : [125, 123]);
      expect(world.partyRegions["HOK:JP_LDP"] ?? world.partyRegions["HOK:JP_RYO"]).toBeDefined();
      if (era === "1953" || era === "1979") {
        expect(world.politicians.filter((politician) => politician.countryId === "JP")).toHaveLength(0);
        expect(world.legislatures.JP?.chambers.find((chamber) => chamber.key === "shugiin")?.composition).toMatchObject({ seatsByParty: {}, vacancies: era === "1953" ? 466 : 465 });
      }
      if (era === "1953" || era === "1979") {
        expect(() => createWorld({ seed: `jp-background-${era}`, playerName: "Tester", countryId: "JP", era })).toThrow(/not playable/);
      } else {
        expect(createWorld({ seed: `jp-public-${era}`, playerName: "Tester", countryId: "JP", era }).player.countryId).toBe("JP");
      }
    },
  );

  it("runs JP schedules through the ordinary turn phase while retaining its source player tier", () => {
    const world = createWorld({ seed: "jp-background-ordinary-turn", playerName: "Tester", countryId: "US", era: "2019" });
    const report = advanceTurn(world);
    const jpElections = world.elections.filter((election) => election.countryId === "JP");

    expect(report.turn).toBe(world.meta.turn);
    expect(world.meta.turn).toBe(1);
    expect(jpElections.length).toBeGreaterThan(0);
    expect(jpElections.some((election) => election.electionType === "shugiin")).toBe(true);
    expect(jpElections.some((election) => election.electionType === "sangiin")).toBe(true);
    expect(jpElections.some((election) => election.electionType === "regionalCouncil")).toBe(true);
    expect(world.countries.JP?.playable).toBe(true);
  });
});
