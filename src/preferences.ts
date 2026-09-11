export const PREFERENCES_STORAGE_KEY = "ahdnative-preferences-v1";

export type TextSize = "standard" | "large";
export type ReducedMotion = "system" | "on" | "off";

export interface Preferences {
  textSize: TextSize;
  reducedMotion: ReducedMotion;
  disableAutoplayOnOtherProfiles: boolean;
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
  disableAutoplayOnOtherProfiles: false,
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
    disableAutoplayOnOtherProfiles: typeof parsed.disableAutoplayOnOtherProfiles === "boolean"
      ? parsed.disableAutoplayOnOtherProfiles
      : DEFAULT_PREFERENCES.disableAutoplayOnOtherProfiles,
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
}
