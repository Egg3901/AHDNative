/**
 * Ceremonial imperial-role facts for character creation (#242).
 *
 * Ported from the public AHDGame reference:
 * - Titles: COUNTRY_CONFIGS `imperialTitles` (`src/lib/constants/countries.ts`).
 *   UK King/Queen/Monarch; JP Emperor/Empress/Emperor. ES/SE are
 *   `parliamentaryMonarchy` (hence imperial-eligible) but configure no titles,
 *   so the reference `getImperialTitle` returns null there; DE keeps
 *   Bundespräsident titles for downstream lookups but is no longer surfaced
 *   through imperial creation; US configures none.
 * - Starter corporation: `imperialCorporation` name/sector per country
 *   (UK "Royal Estate", JP "Chrysanthemum Properties", both real_estate) and
 *   `IMPERIAL_STARTING_CAPITAL` ($50,000,000) from
 *   `src/app/api/imperial-characters/route.ts`. The creation page previews
 *   exactly this: "A Real Estate corporation will be automatically created
 *   with $50,000,000 starting capital."
 *
 * World-free lookup so the creation screen can state the conditional before
 * the world exists. Null means the reference has no imperial configuration
 * for the country, and the screen must not claim a title or corporation.
 */

export type ImperialGender = "male" | "female" | "nonbinary";

export interface ImperialTitles {
  male: string;
  female: string;
  nonbinary: string;
}

export interface ImperialRole {
  titles: ImperialTitles;
  corporation: { name: string; sector: string };
}

/** Reference `IMPERIAL_STARTING_CAPITAL` (imperial-characters route). */
export const IMPERIAL_STARTING_CAPITAL = 50_000_000;

const IMPERIAL_ROLES: Readonly<Record<string, ImperialRole>> = {
  UK: {
    titles: { male: "King", female: "Queen", nonbinary: "Monarch" },
    corporation: { name: "Royal Estate", sector: "real_estate" },
  },
  JP: {
    titles: { male: "Emperor", female: "Empress", nonbinary: "Emperor" },
    corporation: { name: "Chrysanthemum Properties", sector: "real_estate" },
  },
};

/**
 * The full imperial configuration for a country, or null where the reference
 * configures none. Mirrors reference `getImperialConfig`.
 */
export function getImperialRole(countryId: string | null | undefined): ImperialRole | null {
  if (countryId == null) return null;
  return IMPERIAL_ROLES[countryId.toUpperCase()] ?? null;
}

/**
 * The gender-aware ceremonial title, or null where the reference configures
 * none. Mirrors reference `getImperialTitle`.
 */
export function getImperialTitle(
  countryId: string | null | undefined,
  gender: ImperialGender,
): string | null {
  return getImperialRole(countryId)?.titles[gender] ?? null;
}

/**
 * Profile destination for the imperial gate (#54).
 *
 * Mirrors the public AHDGame reference `src/app/profile/page.tsx`
 * `getCharacterData`: the ordinary profile stays the default, and the
 * imperial destination resolves only when the persisted marker
 * (`activeCharacterType === "imperial"` with an `activeImperialCharacterId`)
 * AND the imperial record resolve together. Anything absent or mismatched —
 * no marker, no record, or a marker pointing at a different record — routes
 * to the ordinary profile, never to a fabricated imperial surface.
 */
export type ProfileDestination = "profile" | "imperial";

export interface ProfileGateInput {
  activeCharacterType?: unknown;
  activeImperialCharacterId?: unknown;
  imperialCharacter?: unknown;
}

function normalizedId(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Candidate identity keys on a persisted imperial record. */
function recordIds(record: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const key of ["id", "sequentialId"]) {
    const normalized = normalizedId(record[key]);
    if (normalized !== null) ids.push(normalized);
  }
  return ids;
}

export function resolveProfileDestination(input: ProfileGateInput | null | undefined): ProfileDestination {
  if (input == null || typeof input !== "object") return "profile";
  if (input.activeCharacterType !== "imperial") return "profile";
  const marker = normalizedId(input.activeImperialCharacterId);
  if (marker === null) return "profile";
  const record = input.imperialCharacter;
  if (record == null || typeof record !== "object") return "profile";
  return recordIds(record as Record<string, unknown>).includes(marker) ? "imperial" : "profile";
}
