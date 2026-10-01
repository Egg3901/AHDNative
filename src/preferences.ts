export const PREFERENCES_STORAGE_KEY = "ahdnative-preferences-v1";

export type TextSize = "standard" | "large";
export type ReducedMotion = "system" | "on" | "off";
export type ReducedTransparency = "system" | "on" | "off";
/** World map/directory section shown first. Both sections are implemented. */
export type WorldMapSection = "nations" | "regions";
/** World map schematic context. Both contexts are implemented (#73). */
export type WorldMapView = "world" | "country";
/**
 * Hall of Fame leaderboard scope (#73, source names): every recorded life
 * or only the save's current era. The old "party" scope ranked NPC
 * politicians and was never a reference filter; saved "party" values fall
 * back to the source default.
 */
export type HallOfFameScope = "all" | "current";
/**
 * Hall of Fame ranking (#73, source names): the Legacy Score composite or
 * forex-normalized net worth. The old "standing"/"influence" values ranked
 * an invented composite and raw influence; both fall back to "legacy".
 */
export type HallOfFameRankBy = "legacy" | "netWorth";

export interface Preferences {
  textSize: TextSize;
  reducedMotion: ReducedMotion;
  reducedTransparency: ReducedTransparency;
  disableAutoplayOnOtherProfiles: boolean;
  worldMapSection: WorldMapSection;
  worldMapView: WorldMapView;
  hallOfFameScope: HallOfFameScope;
  hallOfFameRankBy: HallOfFameRankBy;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PreferenceResult {
  value: Preferences;
  error: string | null;
}

export interface PreferencesDocument {
  documentElement: {
    dataset: DOMStringMap;
  };
}

export const DEFAULT_PREFERENCES: Preferences = {
  textSize: "standard",
  reducedMotion: "system",
  reducedTransparency: "system",
  disableAutoplayOnOtherProfiles: false,
  worldMapSection: "nations",
  worldMapView: "world",
  hallOfFameScope: "all",
  hallOfFameRankBy: "legacy",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decode(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** Normalizes values from device storage so old or hand-edited data is safe. */
export function parsePreferences(value: unknown): Preferences {
  const parsed = decode(value);
  if (!isRecord(parsed)) return { ...DEFAULT_PREFERENCES };
  return {
    textSize: parsed.textSize === "large" || parsed.textSize === "standard"
      ? parsed.textSize
      : DEFAULT_PREFERENCES.textSize,
    reducedMotion: parsed.reducedMotion === "system" || parsed.reducedMotion === "on" || parsed.reducedMotion === "off"
      ? parsed.reducedMotion
      : DEFAULT_PREFERENCES.reducedMotion,
    reducedTransparency: parsed.reducedTransparency === "system" || parsed.reducedTransparency === "on" || parsed.reducedTransparency === "off"
      ? parsed.reducedTransparency
      : DEFAULT_PREFERENCES.reducedTransparency,
    disableAutoplayOnOtherProfiles: typeof parsed.disableAutoplayOnOtherProfiles === "boolean"
      ? parsed.disableAutoplayOnOtherProfiles
      : DEFAULT_PREFERENCES.disableAutoplayOnOtherProfiles,
    worldMapSection: parsed.worldMapSection === "nations" || parsed.worldMapSection === "regions"
      ? parsed.worldMapSection
      : DEFAULT_PREFERENCES.worldMapSection,
    worldMapView: parsed.worldMapView === "world" || parsed.worldMapView === "country"
      ? parsed.worldMapView
      : DEFAULT_PREFERENCES.worldMapView,
    // Old "party"/"standing"/"influence" values ranked the invented NPC
    // board; they migrate to the source defaults. hallOfFameEra is dropped:
    // era filtering is the scope filter now, so a saved era value is ignored.
    hallOfFameScope: parsed.hallOfFameScope === "all" || parsed.hallOfFameScope === "current"
      ? parsed.hallOfFameScope
      : DEFAULT_PREFERENCES.hallOfFameScope,
    hallOfFameRankBy: parsed.hallOfFameRankBy === "legacy" || parsed.hallOfFameRankBy === "netWorth"
      ? parsed.hallOfFameRankBy
      : DEFAULT_PREFERENCES.hallOfFameRankBy,
  };
}

function browserStorage(): PreferenceStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadPreferences(storage?: PreferenceStorage | null): PreferenceResult {
  const source = storage === undefined ? browserStorage() : storage;
  if (!source) {
    return {
      value: { ...DEFAULT_PREFERENCES },
      error: "Device preferences are unavailable. Default settings are in use.",
    };
  }
  try {
    return { value: parsePreferences(source.getItem(PREFERENCES_STORAGE_KEY)), error: null };
  } catch {
    return {
      value: { ...DEFAULT_PREFERENCES },
      error: "Device preferences could not be loaded. Default settings are in use.",
    };
  }
}

export function savePreferences(value: Preferences, storage?: PreferenceStorage | null): PreferenceResult {
  const normalized = parsePreferences(value);
  const source = storage === undefined ? browserStorage() : storage;
  if (!source) {
    return {
      value: normalized,
      error: "Device preferences are unavailable. Your choice is active for this session.",
    };
  }
  try {
    source.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
    return { value: normalized, error: null };
  } catch {
    return {
      value: normalized,
      error: "Device preferences could not be saved. Your choice is active for this session.",
    };
  }
}

/** Applies the data attributes consumed by the app's presentation styles. */
export function applyPreferencesToDocument(preferences: Preferences, target?: PreferencesDocument): void {
  const destination = target ?? (typeof document === "undefined" ? null : document);
  if (!destination) return;
  destination.documentElement.dataset.textSize = preferences.textSize;
  destination.documentElement.dataset.reducedMotion = preferences.reducedMotion;
  destination.documentElement.dataset.reducedTransparency = preferences.reducedTransparency;
}
