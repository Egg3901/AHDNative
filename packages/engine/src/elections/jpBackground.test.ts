import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { electionSeriesForWorld } from "./orchestration.js";

describe("source JP background election producer", () => {
  it.each(["1953", "1979", "1991", "1999", "2007", "2019", "2023"] as const)(
    "seeds source eight-region JP political systems for %s without enabling JP character selection",
    (era) => {
      const world = createWorld({ seed: `jp-background-${era}`, playerName: "Tester", countryId: "US", era });
      const regions = Object.values(world.regions).filter((region) => region.countryId === "JP");
      expect(world.countries.JP?.playable).toBe(false);
      expect(regions.map((region) => region.id).sort()).toEqual(["CGK", "CHU", "HOK", "KAN", "KNS", "KYU", "SHI", "TOH"]);
      const series = electionSeriesForWorld(world).filter((row) => row.countryId === "JP");
      expect(series.filter((row) => row.electionType === "shugiin")).toHaveLength(8);
      expect(series.filter((row) => row.electionType === "sangiin")).toHaveLength(16);
      expect(series.filter((row) => row.electionType === "regionalCouncil")).toHaveLength(8);
      expect(world.partyRegions["HOK:JP_LDP"] ?? world.partyRegions["HOK:JP_RYO"]).toBeDefined();
      if (era === "1953" || era === "1979") {
        expect(world.politicians.filter((politician) => politician.countryId === "JP")).toHaveLength(0);
        expect(world.legislatures.JP?.chambers.find((chamber) => chamber.key === "shugiin")?.composition).toMatchObject({ seatsByParty: {}, vacancies: era === "1953" ? 466 : 465 });
      }
      expect(() => createWorld({ seed: `jp-background-${era}`, playerName: "Tester", countryId: "JP", era })).toThrow(/not playable/);
    },
  );
});
