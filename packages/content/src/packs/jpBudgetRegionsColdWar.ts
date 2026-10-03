import type { EconomyRegionSeed, LegislatureSeed, PartySeed, StateSeed } from "../types.js";

/**
 * Source budget geography only. Rows are the exact AHDGame source
 * `jpRegions1953.ts` / `jpRegions1979.ts` observations. The political rows
 * below use those same source-authored geography and seat counts. The vote-share
 * input is the source JP state-party-org producer's 1953 table, or its explicit
 * 2021 fallback for 1979. Native maps those organization estimates into its
 * registration lanes because AHDGame has no separate registration field.
 * 1979 source GDP is JPY millions and is converted using the source 219 JPY/USD
 * 1979 initial rate to the EconomyRegionSeed USD-million unit.
 */
export const JP_BUDGET_REGIONS_1953: EconomyRegionSeed[] = [
  { id: "HOK", countryId: "JP", name: "Hokkaido", population: 4_773_000, gdp: 1_321, houseSeats: 21, senateSeats: 100, metrics: {} },
  { id: "TOH", countryId: "JP", name: "Tohoku", population: 12_984_000, gdp: 2_017, houseSeats: 66, senateSeats: 299, metrics: {} },
  { id: "KAN", countryId: "JP", name: "Kanto", population: 19_607_000, gdp: 8_343, houseSeats: 109, senateSeats: 581, metrics: {} },
  { id: "CHU", countryId: "JP", name: "Chubu", population: 15_833_000, gdp: 3_337, houseSeats: 78, senateSeats: 483, metrics: {} },
  { id: "KNS", countryId: "JP", name: "Kansai", population: 16_742_000, gdp: 5_841, houseSeats: 84, senateSeats: 414, metrics: {} },
  { id: "CGK", countryId: "JP", name: "Chugoku", population: 5_758_000, gdp: 1_460, houseSeats: 31, senateSeats: 238, metrics: {} },
  { id: "SHI", countryId: "JP", name: "Shikoku", population: 3_323_000, gdp: 765, houseSeats: 18, senateSeats: 163, metrics: {} },
  { id: "KYU", countryId: "JP", name: "Kyushu & Okinawa", population: 14_234_000, gdp: 2_712, houseSeats: 59, senateSeats: 401, metrics: {} },
];

export const JP_BUDGET_REGIONS_1979: EconomyRegionSeed[] = [
  { id: "HOK", countryId: "JP", name: "Hokkaido", population: 5_580_000, gdp: 41_096, houseSeats: 23, senateSeats: 100, metrics: {} },
  { id: "TOH", countryId: "JP", name: "Tohoku", population: 9_570_000, gdp: 63_927, houseSeats: 50, senateSeats: 299, metrics: {} },
  { id: "KAN", countryId: "JP", name: "Kanto", population: 34_000_000, gdp: 388_128, houseSeats: 144, senateSeats: 581, metrics: {} },
  { id: "CHU", countryId: "JP", name: "Chubu", population: 19_800_000, gdp: 168_950, houseSeats: 86, senateSeats: 483, metrics: {} },
  { id: "KNS", countryId: "JP", name: "Kansai", population: 21_800_000, gdp: 178_082, houseSeats: 92, senateSeats: 414, metrics: {} },
  { id: "CGK", countryId: "JP", name: "Chugoku", population: 7_850_000, gdp: 54_795, houseSeats: 34, senateSeats: 238, metrics: {} },
  { id: "SHI", countryId: "JP", name: "Shikoku", population: 4_160_000, gdp: 25_571, houseSeats: 20, senateSeats: 163, metrics: {} },
  { id: "KYU", countryId: "JP", name: "Kyushu & Okinawa", population: 14_300_000, gdp: 105_023, houseSeats: 62, senateSeats: 401, metrics: {} },
];

const JP_REGIONS = ["HOK", "TOH", "KAN", "CHU", "KNS", "CGK", "SHI", "KYU"] as const;
const JP_1953_SHARES: Record<(typeof JP_REGIONS)[number], Record<string, number>> = {
  HOK: { RYO: 28, JDP: 15, JSP: 45, JCP: 3 },
  TOH: { RYO: 50, JDP: 20, JSP: 22, JCP: 1 },
  KAN: { RYO: 43, JDP: 17, JSP: 30, JCP: 3 },
  CHU: { RYO: 47, JDP: 19, JSP: 25, JCP: 2 },
  KNS: { RYO: 44, JDP: 16, JSP: 30, JCP: 3 },
  CGK: { RYO: 52, JDP: 18, JSP: 22, JCP: 1 },
  SHI: { RYO: 54, JDP: 17, JSP: 20, JCP: 1 },
  KYU: { RYO: 48, JDP: 19, JSP: 25, JCP: 2 },
};
// AHDGame jpStatePartyOrgCalculations selects the 2021 table for 1979-default
// (its documented fallback for all presets except 1953, 1991 and 2027).
const JP_2021_SHARES: Record<(typeof JP_REGIONS)[number], Record<string, number>> = {
  HOK: { LDP: 35, KMT: 10, JCP: 8 },
  TOH: { LDP: 42, KMT: 9, JCP: 6 },
  KAN: { LDP: 33, KMT: 10, JCP: 8 },
  CHU: { LDP: 38, KMT: 10, JCP: 6 },
  KNS: { LDP: 28, KMT: 10, JCP: 7 },
  CGK: { LDP: 40, KMT: 9, JCP: 7 },
  SHI: { LDP: 44, KMT: 10, JCP: 6 },
  KYU: { LDP: 40, KMT: 10, JCP: 7 },
};

const parties = (rows: Array<[string, string, string, number, number]>): PartySeed[] =>
  rows.map(([abbr, name, color, economicPosition, socialPosition]) => ({
    id: `JP_${abbr}`, name, countryId: "JP", abbreviation: abbr, color, economicPosition, socialPosition,
  }));

export const JP_PARTIES_1953 = parties([
  ["RYO", "Liberal Party", "#2BA547", 2, 2],
  ["JDP", "Japan Democratic Party", "#1B6B3A", 1, 2],
  ["JSP", "Japan Socialist Party", "#C8102E", -3, -2],
  ["JCP", "Japanese Communist Party", "#D71920", -4, -3],
]);
export const JP_PARTIES_1979 = parties([
  ["LDP", "Liberal Democratic Party", "#2BA547", 2, 2],
  ["KMT", "Komeito", "#F5A623", 0, 0],
  ["JCP", "Japanese Communist Party", "#D71920", -4, -3],
]);

function jpPoliticalRegions(sourceRows: EconomyRegionSeed[], shares: Record<string, Record<string, number>>): StateSeed[] {
  return sourceRows.map((row) => {
    const partyShares = shares[row.id] ?? {};
    const total = Object.values(partyShares).reduce((sum, share) => sum + share, 0);
    return {
      id: row.id,
      name: row.name,
      countryId: "JP",
      population: row.population,
      gdp: row.gdp,
      houseSeats: row.houseSeats,
      senateSeats: row.senateSeats,
      region: row.name,
      senateClasses: [1, 2],
      registration: {
        parties: Object.entries(partyShares).map(([abbr, reg]) => ({
          abbr,
          reg,
          org: Math.min(70, Math.max(5, Math.round(5 + (reg / 50) * 65))),
        })),
        independent: 0,
        unregistered: Math.max(0, 100 - total),
        unaffiliatedOrg: 0,
      },
    };
  });
}

export const JP_STATES_1953 = jpPoliticalRegions(JP_BUDGET_REGIONS_1953, JP_1953_SHARES);
export const JP_STATES_1979 = jpPoliticalRegions(JP_BUDGET_REGIONS_1979, JP_2021_SHARES);

const vacantChamber = (key: string, name: string, seats: number) => ({
  key, name, shortName: name, seats, elected: true,
  description: `Source preset has no historical JP ${name} seat roster; begins vacant.`,
  composition: { seatsByParty: {}, vacancies: seats },
});

export const JP_LEGISLATURES_COLD_WAR: LegislatureSeed[] = [
  {
    countryId: "JP", name: "Kokkai", bicameral: true,
    chambers: [
      vacantChamber("shugiin", "Shūgiin", 466),
      vacantChamber("sangiin", "Sangiin", 248),
      vacantChamber("regionalCouncil", "Regional Council", 2_679),
    ],
  },
  {
    countryId: "JP", name: "Kokkai", bicameral: true,
    chambers: [
      vacantChamber("shugiin", "Shūgiin", 465),
      vacantChamber("sangiin", "Sangiin", 248),
      vacantChamber("regionalCouncil", "Regional Council", 2_679),
    ],
  },
];
