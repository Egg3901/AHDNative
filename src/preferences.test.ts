import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  applyPreferencesToDocument,
  loadPreferences,
  parsePreferences,
  savePreferences,
  type PreferenceStorage,
} from "./preferences";

class MemoryStorage implements PreferenceStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("preferences", () => {
  it("falls back to standard presentation for missing or invalid values", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("{bad json")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences({ textSize: "huge", reducedMotion: "sometimes" })).toEqual(DEFAULT_PREFERENCES);
  });

  it("loads and saves a normalized device preference record", () => {
    const storage = new MemoryStorage();
    expect(loadPreferences(storage)).toEqual({ value: DEFAULT_PREFERENCES, error: null });

    const saved = savePreferences({ textSize: "large", reducedMotion: "on" }, storage);
    expect(saved).toEqual({ value: { textSize: "large", reducedMotion: "on" }, error: null });
    expect(storage.getItem(PREFERENCES_STORAGE_KEY)).toBe(JSON.stringify(saved.value));
    expect(loadPreferences(storage)).toEqual(saved);
  });

  it("returns defaults and a readable error when device storage fails", () => {
    const broken: PreferenceStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(loadPreferences(broken)).toEqual({
      value: DEFAULT_PREFERENCES,
      error: "Device preferences could not be loaded. Default settings are in use.",
    });
    expect(savePreferences({ textSize: "large", reducedMotion: "off" }, broken)).toEqual({
      value: { textSize: "large", reducedMotion: "off" },
      error: "Device preferences could not be saved. Your choice is active for this session.",
    });
    expect(loadPreferences(null)).toEqual({
      value: DEFAULT_PREFERENCES,
      error: "Device preferences are unavailable. Default settings are in use.",
    });
  });

  it("applies presentation attributes without requiring storage", () => {
    const target = { documentElement: { dataset: {} as DOMStringMap } };
    applyPreferencesToDocument({ textSize: "large", reducedMotion: "system" }, target);
    expect(target.documentElement.dataset.textSize).toBe("large");
    expect(target.documentElement.dataset.reducedMotion).toBe("system");
  });
});
