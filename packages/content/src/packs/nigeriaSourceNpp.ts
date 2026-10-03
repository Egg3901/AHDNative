import type { SourceNppBackgroundSeed } from "../types.js";

/**
 * Source: AHDGame ad04918e602aae1b5151b0b78c3e9fc4615e187a,
 * countries/ng/data/ngRegions{1953,1979,1991,1999,2007,2023}.ts,
 * ngRegions.ts, ngParties.ts; admin/seed/seedNG.ts and npp/seedHistorical.ts.
 * The 1979/1999/2007/2023 governor roster deliberately follows seedNG's
 * 2019 fallback. 1999/2007 party rosters follow the nearest-earlier 1991
 * fallback; 2023 follows the 2019 fallback. Missing governor party names
 * resolve to the source `independent` affiliation.
 */

const PARTY_ROWS = {
  APC: { id: "NG_APC", name: "All Progressives Congress", color: "#1B4F8C", economicPosition: 2, socialPosition: 3 },
  PDP: { id: "NG_PDP", name: "Peoples Democratic Party", color: "#0A7A35", economicPosition: 0, socialPosition: -1 },
  LP: { id: "NG_LP", name: "Labour Party", color: "#E8A014", economicPosition: -3, socialPosition: -2 },
  NNPP: { id: "NG_NNPP", name: "New Nigeria Peoples Party", color: "#8B0000", economicPosition: -1, socialPosition: -1 },
  APGA: { id: "NG_APGA", name: "All Progressives Grand Alliance", color: "#7B3F99", economicPosition: 1, socialPosition: 1 },
  SDP: { id: "NG_SDP", name: "Social Democratic Party", color: "#D4A017", economicPosition: -1, socialPosition: -1 },
  NRC: { id: "NG_NRC", name: "National Republican Convention", color: "#2E8B57", economicPosition: 2, socialPosition: 2 },
  NCNC: { id: "NG_NCNC", name: "National Council of Nigeria and the Cameroons", color: "#006B3F", economicPosition: -1, socialPosition: -1 },
  AG: { id: "NG_AG", name: "Action Group", color: "#E85D04", economicPosition: 1, socialPosition: 0 },
  NPC: { id: "NG_NPC", name: "Northern People's Congress", color: "#1B4F3C", economicPosition: 1, socialPosition: 3 },
  NPN: { id: "NG_NPN", name: "National Party of Nigeria", color: "#1B4F3C", economicPosition: 1, socialPosition: 1 },
  UPN: { id: "NG_UPN", name: "Unity Party of Nigeria", color: "#E85D04", economicPosition: -1, socialPosition: -1 },
  NPP: { id: "NG_NPP", name: "Nigerian Peoples Party", color: "#006B3F", economicPosition: -1, socialPosition: -1 },
  GNPP: { id: "NG_GNPP", name: "Great Nigeria Peoples Party", color: "#8B0000", economicPosition: 1, socialPosition: 2 },
  PRP: { id: "NG_PRP", name: "Peoples Redemption Party", color: "#C62828", economicPosition: -3, socialPosition: -2 },
} as const;

type PartyCode = keyof typeof PARTY_ROWS;
type Zone = "NORTH_WEST" | "NORTH_EAST" | "NORTH_CENTRAL" | "SOUTH_WEST" | "SOUTH_SOUTH" | "SOUTH_EAST";

const REGIONS: Readonly<Record<string, ReadonlyArray<{ id: Zone; name: string; population: number; gdp: number; gdpCurrencyCode: string }>>> = {
  "1953": [
    { id: "NORTH_WEST", name: "North West", population: 7_500_000, gdp: 979, gdpCurrencyCode: "USD" },
    { id: "NORTH_EAST", name: "North East", population: 3_500_000, gdp: 381, gdpCurrencyCode: "USD" },
    { id: "NORTH_CENTRAL", name: "North Central", population: 5_800_000, gdp: 571, gdpCurrencyCode: "USD" },
    { id: "SOUTH_WEST", name: "South West", population: 6_100_000, gdp: 734, gdpCurrencyCode: "USD" },
    { id: "SOUTH_SOUTH", name: "South South", population: 2_300_000, gdp: 245, gdpCurrencyCode: "USD" },
    { id: "SOUTH_EAST", name: "South East", population: 4_900_000, gdp: 490, gdpCurrencyCode: "USD" },
  ],
  "1979": [
    { id: "NORTH_WEST", name: "North-West", population: 18_500_000, gdp: 24_000_000, gdpCurrencyCode: "NGN" },
    { id: "NORTH_EAST", name: "North-East", population: 9_500_000, gdp: 15_000_000, gdpCurrencyCode: "NGN" },
    { id: "NORTH_CENTRAL", name: "North-Central", population: 10_000_000, gdp: 19_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_WEST", name: "South-West", population: 14_000_000, gdp: 40_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_SOUTH", name: "South-South", population: 10_500_000, gdp: 34_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_EAST", name: "South-East", population: 8_500_000, gdp: 18_000_000, gdpCurrencyCode: "NGN" },
  ],
  "1991": [
    { id: "NORTH_WEST", name: "North-West", population: 22_913_412, gdp: 35_000_000, gdpCurrencyCode: "NGN" },
    { id: "NORTH_EAST", name: "North-East", population: 11_900_913, gdp: 22_000_000, gdpCurrencyCode: "NGN" },
    { id: "NORTH_CENTRAL", name: "North-Central", population: 12_554_912, gdp: 28_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_WEST", name: "South-West", population: 17_455_043, gdp: 72_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_SOUTH", name: "South-South", population: 13_392_943, gdp: 58_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_EAST", name: "South-East", population: 10_774_977, gdp: 26_000_000, gdpCurrencyCode: "NGN" },
  ],
  "1999": [
    { id: "NORTH_WEST", name: "North-West", population: 30_500_000, gdp: 60_000_000, gdpCurrencyCode: "NGN" },
    { id: "NORTH_EAST", name: "North-East", population: 15_800_000, gdp: 38_000_000, gdpCurrencyCode: "NGN" },
    { id: "NORTH_CENTRAL", name: "North-Central", population: 16_700_000, gdp: 49_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_WEST", name: "South-West", population: 23_200_000, gdp: 100_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_SOUTH", name: "South-South", population: 17_800_000, gdp: 87_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_EAST", name: "South-East", population: 14_500_000, gdp: 46_000_000, gdpCurrencyCode: "NGN" },
  ],
  "2007": [
    { id: "NORTH_WEST", name: "North-West", population: 37_500_000, gdp: 86_000_000, gdpCurrencyCode: "NGN" },
    { id: "NORTH_EAST", name: "North-East", population: 19_500_000, gdp: 54_000_000, gdpCurrencyCode: "NGN" },
    { id: "NORTH_CENTRAL", name: "North-Central", population: 20_500_000, gdp: 70_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_WEST", name: "South-West", population: 28_500_000, gdp: 140_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_SOUTH", name: "South-South", population: 21_500_000, gdp: 124_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_EAST", name: "South-East", population: 17_500_000, gdp: 66_000_000, gdpCurrencyCode: "NGN" },
  ],
  "2019": [
    { id: "NORTH_WEST", name: "North-West", population: 49_800_000, gdp: 111_680_000, gdpCurrencyCode: "NGN" },
    { id: "NORTH_EAST", name: "North-East", population: 26_300_000, gdp: 69_800_000, gdpCurrencyCode: "NGN" },
    { id: "NORTH_CENTRAL", name: "North-Central", population: 28_100_000, gdp: 90_740_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_WEST", name: "South-West", population: 37_900_000, gdp: 181_400_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_SOUTH", name: "South-South", population: 25_700_000, gdp: 160_540_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_EAST", name: "South-East", population: 22_400_000, gdp: 83_760_000, gdpCurrencyCode: "NGN" },
  ],
  "2023": [
    { id: "NORTH_WEST", name: "North-West", population: 58_500_000, gdp: 131_000_000, gdpCurrencyCode: "NGN" },
    { id: "NORTH_EAST", name: "North-East", population: 31_000_000, gdp: 82_000_000, gdpCurrencyCode: "NGN" },
    { id: "NORTH_CENTRAL", name: "North-Central", population: 33_000_000, gdp: 107_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_WEST", name: "South-West", population: 44_500_000, gdp: 213_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_SOUTH", name: "South-South", population: 30_000_000, gdp: 188_000_000, gdpCurrencyCode: "NGN" },
    { id: "SOUTH_EAST", name: "South-East", population: 26_000_000, gdp: 99_000_000, gdpCurrencyCode: "NGN" },
  ],
};

const PARTY_ROSTERS: Readonly<Record<string, readonly PartyCode[]>> = {
  "1953": ["NCNC", "AG", "NPC"],
  "1979": ["NPN", "UPN", "NPP", "GNPP", "PRP"],
  "1991": ["SDP", "NRC"],
  "1999": ["SDP", "NRC"],
  "2007": ["SDP", "NRC"],
  "2019": ["APC", "PDP", "LP", "NNPP", "APGA"],
  "2023": ["APC", "PDP", "LP", "NNPP", "APGA"],
};

const GOVERNORS: Readonly<Record<string, readonly PartyCode[]>> = {
  "1953": ["NPC", "NPC", "NPC", "AG", "NCNC", "NCNC"],
  "1991": ["NRC", "NRC", "SDP", "SDP", "SDP", "NRC"],
  "2019": ["APC", "APC", "APC", "APC", "PDP", "APGA"],
};
const ZONES: readonly Zone[] = ["NORTH_WEST", "NORTH_EAST", "NORTH_CENTRAL", "SOUTH_WEST", "SOUTH_SOUTH", "SOUTH_EAST"];

const REGIONAL_GOVERNORS: Readonly<Record<string, readonly PartyCode[]>> = {
  "1953": GOVERNORS["1953"]!,
  "1991": GOVERNORS["1991"]!,
  "1979": GOVERNORS["2019"]!,
  "1999": GOVERNORS["2019"]!,
  "2007": GOVERNORS["2019"]!,
  "2019": GOVERNORS["2019"]!,
  "2023": GOVERNORS["2019"]!,
};

export function nigeriaSourceNppBackground(era: string): SourceNppBackgroundSeed {
  const regionRows = REGIONS[era];
  const partyRoster = PARTY_ROSTERS[era];
  const governorRoster = REGIONAL_GOVERNORS[era];
  if (!regionRows || !partyRoster || !governorRoster || governorRoster.length !== ZONES.length) {
    throw new Error(`Missing source Nigeria NPP seed rows for ${era}`);
  }
  const partyIds = new Set(partyRoster.map((code) => PARTY_ROWS[code].id));
  const parties = partyRoster.map((code, index) => {
    const party = PARTY_ROWS[code];
    return {
      ...party,
      countryId: "NG",
      abbreviation: code,
      sourceSequentialId: index + 1,
      treasury: 0,
    };
  });
  return {
    countryId: "NG",
    parties,
    regions: regionRows.map((region, index) => {
      const sourceGovernorParty = governorRoster[index]!;
      const requestedPartyId = PARTY_ROWS[sourceGovernorParty].id;
      return {
        ...region,
        governorPartyId: partyIds.has(requestedPartyId) ? requestedPartyId : "independent",
      };
    }),
  };
}
