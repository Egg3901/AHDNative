import { getPackByEra, PACKS } from "./packs/index.js";

/**
 * Explicit supported-world matrix for issue #118.
 *
 * Ground truth is the shipped pack table (PACKS); this module publishes the
 * reviewable statement of raw engine-pack content, new-character eligibility,
 * and deliberately unavailable eras. The raw factory keeps authored rows for
 * internal fixtures; the GameSession boundary uses the narrower player set.
 *
 * Pinned authority: Egg3901/AHDGame@fff42a48a7dd7fd50cbe01124c8164cf9b7f6cb8
 * (`src/lib/world/eraRoster.ts#tierFor` and
 * `src/lib/admin/seed/seedCountryGameStates.ts#seedCountryGameStates`):
 * - US/UK/RU/DD are player tier for 1953/1979.
 * - US/UK/JP are player tier for 1991/1999/2007/2019/2023.
 * - No "1960" preset exists in that authority.
 */

export interface EraCoverageRow {
  /** Pack era id, e.g. "1953". */
  era: string;
  label: string;
  startDate: string;
  packVersion: number;
  /** Sorted engine-playable country ids actually shipped in the pack. */
  playableCountries: string[];
  /** Countries allowed to start a new character under current source rules and Native readiness. */
  newCharacterCountries: string[];
  /** Authority preset id this pack was ported from. */
  authorityPreset: string;
  /** Current source's preset player roster. */
  authorityPlayer: readonly string[];
  /**
   * Native engine-playable ids absent from the source player roster. These
   * remain available to internal fixtures and playerless worldsim; the
   * GameSession new-character boundary applies newCharacterCountries.
   */
  playableDelta: string[];
  /** Source player ids that Native withholds while their full systems are unready. */
  authorityPlayerUnavailableInNative: string[];
}

/**
 * The four supported eras. playableCountries mirrors the shipped packs;
 * assertSupportedMatrixMatchesPacks() fails closed on any drift.
 */
export const SUPPORTED_MATRIX: EraCoverageRow[] = [
  {
    era: "1953",
    label: "1953: Cold War Dawn",
    startDate: "1953-01-06",
    packVersion: 1,
    playableCountries: ["DD", "RU", "UK", "US"],
    newCharacterCountries: ["DD", "RU", "UK", "US"],
    authorityPreset: "1953-default",
    authorityPlayer: ["US", "UK", "RU", "DD"],
    playableDelta: [],
    authorityPlayerUnavailableInNative: [],
  },
  {
    era: "1979",
    label: "1979 Start Date - Cold War",
    startDate: "1979-01-01",
    packVersion: 1,
    playableCountries: ["DD", "RU", "UK", "US"],
    newCharacterCountries: ["DD", "RU", "UK", "US"],
    authorityPreset: "1979-default",
    authorityPlayer: ["US", "UK", "RU", "DD"],
    playableDelta: [],
    authorityPlayerUnavailableInNative: [],
  },
  {
    era: "1991",
    label: "1991 Start Date - Default Parties",
    startDate: "1991-01-01",
    packVersion: 1,
    playableCountries: ["BR", "CN", "IE", "UK", "US"],
    newCharacterCountries: ["UK", "US"],
    authorityPreset: "1991-default",
    authorityPlayer: ["US", "UK", "JP"],
    playableDelta: ["BR", "CN", "IE"],
    authorityPlayerUnavailableInNative: ["JP"],
  },
  {
    era: "2019",
    label: "2019 Start Date - Default Parties",
    startDate: "2019-01-01",
    packVersion: 1,
    playableCountries: ["CN", "DE", "IE", "UK", "US"],
    newCharacterCountries: ["UK", "US"],
    authorityPreset: "2019-default",
    authorityPlayer: ["US", "UK", "JP"],
    playableDelta: ["CN", "DE", "IE"],
    authorityPlayerUnavailableInNative: ["JP"],
  },
];

export interface UnavailableEra {
  era: string;
  status: "no-pack" | "migration-only";
  /** Authority preset id, or null when the authority names no such preset. */
  authorityPreset: string | null;
  reason: string;
}

/**
 * Eras that must stay unavailable until authorized content exists.
 * 1999/2007/2023 have authority presets but no ported Native pack;
 * 1960 has neither an authority preset nor a pack — only a calendar
 * anchor (engine calendar.ts) plus the v40 legacyEra save backfill so
 * pre-removal saves migrate instead of crashing.
 */
export const UNAVAILABLE_ERAS: UnavailableEra[] = [
  {
    era: "1960",
    status: "migration-only",
    authorityPreset: null,
    reason:
      "No authority preset and no pack: fabricated era removed. " +
      "Legacy saves with meta.era 1960 migrate via the calendar anchor " +
      "and the v40 legacyEra backfill; no new world may be created.",
  },
  {
    era: "1999",
    status: "no-pack",
    authorityPreset: "1999-default",
    reason:
      "Authority player is US/UK but no Native content has been ported; " +
      "no historical data may be invented to fill the gap.",
  },
  {
    era: "2007",
    status: "no-pack",
    authorityPreset: "2007-default",
    reason:
      "Authority player is US/UK but no Native content has been ported; " +
      "no historical data may be invented to fill the gap.",
  },
  {
    era: "2023",
    status: "no-pack",
    authorityPreset: "2023-default",
    reason:
      "Authority player is US/UK but no Native content has been ported; " +
      "no historical data may be invented to fill the gap.",
  },
];

/** Required engine/content systems every playable country must carry. */
export const REQUIRED_SYSTEMS = ["parties", "legislature", "regions", "budget"] as const;
export type RequiredSystem = (typeof REQUIRED_SYSTEMS)[number];

/**
 * Fail closed when the published matrix drifts from the shipped packs:
 * era set, labels, dates, packVersions, and playable sets must match
 * exactly, and every playable country must carry parties, a legislature,
 * regions, and a budget. Throws on the first mismatch.
 */
export function assertSupportedMatrixMatchesPacks(): void {
  const packEras = new Set(PACKS.map((p) => p.era.id));
  if (packEras.size !== SUPPORTED_MATRIX.length) {
    throw new Error(
      `Supported matrix covers ${SUPPORTED_MATRIX.length} eras but packs ship ${packEras.size}`,
    );
  }
  for (const row of SUPPORTED_MATRIX) {
    const pack = PACKS.find((p) => p.era.id === row.era);
    if (!pack) throw new Error(`Supported matrix era "${row.era}" has no shipped pack`);
    if (pack.era.label !== row.label) {
      throw new Error(`Matrix label drift for era "${row.era}": pack has "${pack.era.label}"`);
    }
    if (pack.era.startDate !== row.startDate) {
      throw new Error(`Matrix startDate drift for era "${row.era}": pack has "${pack.era.startDate}"`);
    }
    if (pack.packVersion !== row.packVersion) {
      throw new Error(`Matrix packVersion drift for era "${row.era}": pack has ${pack.packVersion}`);
    }
    const playable = pack.countries.filter((c) => c.playable).map((c) => c.id).sort();
    if (JSON.stringify(playable) !== JSON.stringify([...row.playableCountries].sort())) {
      throw new Error(
        `Matrix playable drift for era "${row.era}": pack has [${playable.join(",")}]`,
      );
    }
    const classifiedSourcePlayers = [
      ...row.newCharacterCountries,
      ...row.authorityPlayerUnavailableInNative,
    ].sort();
    if (JSON.stringify(classifiedSourcePlayers) !== JSON.stringify([...row.authorityPlayer].sort())) {
      throw new Error(`Source player availability is not fully classified for era "${row.era}"`);
    }
    for (const id of row.newCharacterCountries) {
      if (!row.authorityPlayer.includes(id)) {
        throw new Error(`New-character country ${id} is not source-authorized in era "${row.era}"`);
      }
      const missing: RequiredSystem[] = [];
      if (!(pack.parties ?? []).some((p) => p.countryId === id)) missing.push("parties");
      if (!(pack.legislatures ?? []).some((l) => l.countryId === id)) missing.push("legislature");
      if (!(pack.states ?? []).some((s) => s.countryId === id)) missing.push("regions");
      if (!(pack.budgets ?? []).some((b) => b.countryId === id)) missing.push("budget");
      if (missing.length > 0) {
        throw new Error(
          `Era "${row.era}" playable ${id} lacks required systems: ${missing.join(",")}`,
        );
      }
    }
  }
  for (const u of UNAVAILABLE_ERAS) {
    if (packEras.has(u.era)) {
      throw new Error(`Unavailable era "${u.era}" has a shipped pack; matrix is stale`);
    }
  }
}

/** Whether an era/country pair may create a new character in Native. */
export function isNewCharacterSelection(era: string, countryId: string): boolean {
  return SUPPORTED_MATRIX.find((row) => row.era === era)?.newCharacterCountries.includes(countryId) ?? false;
}

/** True for the four eras with shipped packs. */
export function isSupportedEra(era: string): boolean {
  return getPackByEra(era) !== undefined;
}

/** True when the country is playable in the era's shipped pack. */
export function isPlayableCountry(era: string, countryId: string): boolean {
  return getPackByEra(era)?.countries.some((c) => c.id === countryId && c.playable) ?? false;
}

/**
 * Validate a pack selection. Mirrors the engine createWorld contract
 * (world.ts): unknown era, unknown country, and non-playable country
 * all throw instead of falling back to another era's content.
 */
export function assertSupportedSelection(era: string, countryId: string): void {
  const pack = getPackByEra(era);
  if (!pack) throw new Error(`Unknown era: ${era}`);
  const country = pack.countries.find((c) => c.id === countryId);
  if (!country) throw new Error(`Unknown country: ${countryId} for era ${era}`);
  if (!country.playable) throw new Error(`Country ${countryId} is not playable in era ${era}`);
}
