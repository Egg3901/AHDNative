/**
 * Character-creation country conditionals.
 *
 * Ported from AHDGame at e364c04954ed628beef73a993a8e9e156650a31e:
 * - One-party states: the reference tests
 *   `selectedCountry?.governmentType === "onePartyState"`
 *   (`src/app/create-character/page.tsx`), where governmentType comes from
 *   COUNTRY_CONFIGS (`src/lib/constants/countries.ts`).
 * - Imperial-eligible countries: `src/lib/imperial.ts`
 *   getImperialEligibleCountries returns every country with
 *   `isImperialCountry(config) && !config.imperialSharedWith`. `isImperialCountry`
 *   defaults true for `parliamentaryMonarchy` and otherwise follows an explicit
 *   `hasImperialRole` override.
 *
 * Native carries the same COUNTRY_CONFIGS governmentType map in the election
 * layer (electionEngine/countryElectionConstants.ts), so these are derived from
 * that data rather than a hand-maintained list. That is why ES/SE are
 * imperial-eligible (parliamentary monarchies) even though Native does not play
 * them yet.
 *
 * These are static, world-free lookups so the creation screen can state the
 * conditional before the world exists, matching the reference.
 */

import { COUNTRY_CONFIGS } from "./electionEngine/countryElectionConstants.js";

/**
 * Explicit `hasImperialRole` overrides from the reference COUNTRY_CONFIGS.
 * None are set today (DE's role is inherited false from parliamentaryRepublic,
 * IE's is unset), so the governmentType default is the whole of the rule. The
 * map is kept explicit so a future override lands here, not in a second list.
 */
const HAS_IMPERIAL_ROLE_OVERRIDE: Readonly<Record<string, boolean>> = {};

/** True for `onePartyState` governmentType, the reference's creation gate. */
export function isOnePartyCountry(countryId: string | null | undefined): boolean {
  if (countryId == null) return false;
  return COUNTRY_CONFIGS[countryId.toUpperCase()]?.governmentType === "onePartyState";
}

/**
 * True when the country has a ceremonial imperial head of state. Mirrors
 * `isImperialCountry`: an explicit override wins, otherwise the
 * `parliamentaryMonarchy` default.
 */
function hasImperialRole(countryId: string): boolean {
  const override = HAS_IMPERIAL_ROLE_OVERRIDE[countryId];
  if (typeof override === "boolean") return override;
  return COUNTRY_CONFIGS[countryId]?.governmentType === "parliamentaryMonarchy";
}

/**
 * True when the country is eligible for imperial character creation: it has an
 * imperial role and does not share another country's. Native seeds no
 * `imperialSharedWith`, so this is `hasImperialRole` today.
 */
export function isImperialEligibleCountry(countryId: string | null | undefined): boolean {
  if (countryId == null) return false;
  const id = countryId.toUpperCase();
  return hasImperialRole(id) && id in COUNTRY_CONFIGS;
}

/** Every derived one-party country, sorted. */
export function onePartyCountries(): string[] {
  return Object.keys(COUNTRY_CONFIGS)
    .filter((id) => COUNTRY_CONFIGS[id]?.governmentType === "onePartyState")
    .sort();
}

/**
 * Every derived imperial-eligible country, sorted. The reference returns this
 * same set from getImperialEligibleCountries. Exported so the UI and any
 * documentation read one grounded source instead of a copied list.
 */
export function imperialEligibleCountries(): string[] {
  return Object.keys(COUNTRY_CONFIGS)
    .filter((id) => hasImperialRole(id))
    .sort();
}
