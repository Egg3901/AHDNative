import type { EconomyRegionSeed } from "../types.js";
import { cnMetricPresets1953 } from "./cnMetricPresets1953.js";

/**
 * China 1953 economy-preview regions, ported from AHDGame
 * `src/lib/countries/cn/data/cnRegions1953.ts` at 24d8a1b.
 * Population, GDP, district totals, and regional seat estimates are authored
 * there for the first PRC census and First NPC. AHDGame keeps CN economy-only
 * in this era; these rows intentionally have no electoral registration.
 */
export const cnRegions1953: EconomyRegionSeed[] = [
  { id: "DB", name: "Dongbei (Northeast)", countryId: "CN", population: 42_000_000, gdp: 7_619, houseSeats: 88, senateSeats: 270, metrics: cnMetricPresets1953.DB! },
  { id: "HB", name: "Huabei (North China)", countryId: "CN", population: 61_000_000, gdp: 4_762, houseSeats: 129, senateSeats: 395, metrics: cnMetricPresets1953.HB! },
  { id: "HD", name: "Huadong (East China)", countryId: "CN", population: 180_000_000, gdp: 10_476, houseSeats: 379, senateSeats: 1_164, metrics: cnMetricPresets1953.HD! },
  { id: "HZ", name: "Huazhong (Central China)", countryId: "CN", population: 105_000_000, gdp: 3_333, houseSeats: 215, senateSeats: 678, metrics: cnMetricPresets1953.HZ! },
  { id: "HN", name: "Huanan (South China)", countryId: "CN", population: 56_000_000, gdp: 2_857, houseSeats: 118, senateSeats: 362, metrics: cnMetricPresets1953.HN! },
  { id: "XN", name: "Xinan (Southwest)", countryId: "CN", population: 104_000_000, gdp: 2_619, houseSeats: 219, senateSeats: 673, metrics: cnMetricPresets1953.XN! },
  { id: "XB", name: "Xibei (Northwest)", countryId: "CN", population: 37_000_000, gdp: 1_667, houseSeats: 78, senateSeats: 239, metrics: cnMetricPresets1953.XB! },
];
