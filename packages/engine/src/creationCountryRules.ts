/**
 * Character-creation country conditionals.
 *
 * Ported from AHDGame at e364c04954ed628beef73a993a8e9e156650a31e:
 * - One-party states: `src/lib/countryPolitics/overview.ts` ONE_PARTY_COUNTRIES
 *   (RU/DD/CN) — the creation screen shows the one-party briefing for these.
 * - Imperial-eligible countries: `src/lib/imperial.ts`
 *   getImperialEligibleCountries, which returns countries that are imperial and
 *   not shared through another country (UK and JP in the shipped content).
 *
 * These are static, world-free lookups so the creation screen can state the
 * conditional before the world exists, matching the reference.
 */

/** One-party regimes (governmentType "onePartyState" in reference constants). */
const ONE_PARTY_COUNTRIES: ReadonlySet<string> = new Set(["RU", "DD", "CN"]);

/**
 * Imperial-eligible countries. The reference derives this from COUNTRY_CONFIGS
 * (`isImperialCountry && !imperialSharedWith`); only UK and JP satisfy it in the
 * shipped content and their test pins exactly that set.
 */
export const IMPERIAL_ELIGIBLE_COUNTRIES: readonly string[] = ["UK", "JP"];

export function isOnePartyCountry(countryId: string | null | undefined): boolean {
  return countryId != null && ONE_PARTY_COUNTRIES.has(countryId.toUpperCase());
}

export function isImperialEligibleCountry(countryId: string | null | undefined): boolean {
  return countryId != null && IMPERIAL_ELIGIBLE_COUNTRIES.includes(countryId.toUpperCase());
}
