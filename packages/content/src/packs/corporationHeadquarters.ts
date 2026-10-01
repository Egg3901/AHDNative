import type { CorporationHeadquartersRegionSeed } from "../types.js";

/**
 * Federal District used as the source NPP corporation HQ (Game
 * `src/lib/countries/us/geographyFacts.ts:US_NPP_CAPITAL_STATE`). It is kept
 * separate from voter/state seeds: Game's 1953 registration contract excludes
 * DC from political pools, while its authored 1953 region record still gives
 * it 802,178 residents and 0 House/upper-state seats. CEO residency needs the
 * region identity, not a fabricated electoral state.
 */
export const US_CORPORATION_HEADQUARTERS_REGIONS: readonly CorporationHeadquartersRegionSeed[] = [
  { id: "DC", countryId: "US", name: "District of Columbia" },
];
