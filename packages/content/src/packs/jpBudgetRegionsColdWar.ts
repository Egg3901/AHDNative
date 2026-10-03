import type { EconomyRegionSeed } from "../types.js";

/**
 * Source budget geography only. Rows are the exact AHDGame source
 * `jpRegions1953.ts` / `jpRegions1979.ts` observations; political registration,
 * seats and elections are intentionally not inferred from these fiscal rows.
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
