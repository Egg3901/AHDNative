/**
 * Party logo identity (authored-URL carrier, no remote defaults).
 *
 * Reference: AHDGame `PoliticalParty.logoUrl`
 * (src/lib/db/types/party.ts — chair-uploaded custom URL, optional) plus the
 * `PARTY_LOGOS` default map (src/lib/constants.ts) keyed
 * `${country}:${abbreviation}` so defaults stay stable across reset presets
 * (sequentialId shifts when 2019-only or 1991-only seeds are filtered out).
 *
 * Native carries the authored-override half of that contract only:
 * `partyLogoKey` builds the preset-stable default-lookup key and
 * `resolvePartyLogoUrl` returns a party-authored URL when one exists.
 * Default logos are NOT resolved here: upstream keeps no checked-in static
 * party assets (public/ carries no party files), and the PARTY_LOGOS values
 * are remote URLs with mixed reuse rights — mostly Wikimedia Commons, but
 * UK:UUP, IE:WP and BR:PSB are English-Wikipedia fair-use files and UK:LAB
 * is a proprietary CDN jpg — so no complete supported-country set can be
 * bundled offline. Callers fall back to deterministic initials when this
 * returns null, and never fetch a remote default.
 */

export interface PartyLogoIdentity {
  countryId?: string | null;
  abbreviation?: string | null;
  logoUrl?: string | null;
}

/**
 * Preset-stable default-lookup key, mirroring the reference PARTY_LOGOS
 * keying (`US:DEM`). Abbreviation-keyed, never sequentialId-keyed: numeric
 * ids shift between presets (e.g. DE PDS vs Linke), while abbreviations are
 * preset-stable. Returns null when either half is missing.
 */
export function partyLogoKey(countryId?: string | null, abbreviation?: string | null): string | null {
  const country = (countryId ?? "").trim().toUpperCase();
  const abbr = (abbreviation ?? "").trim().toUpperCase();
  if (!country || !abbr) return null;
  return `${country}:${abbr}`;
}

/**
 * Authored logo URL for a party, or null. Only a caller-supplied authored
 * URL is honored (reference chair upload stored on PoliticalParty.logoUrl);
 * empty strings are treated as absent. Remote PARTY_LOGOS defaults are
 * deliberately never substituted: Native is offline-first and the upstream
 * defaults are not legally bundlable as a complete set.
 */
export function resolvePartyLogoUrl(party?: PartyLogoIdentity | null): string | null {
  const url = (party?.logoUrl ?? "").trim();
  return url ? url : null;
}
