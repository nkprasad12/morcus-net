/**
 * Typed LocalStorage settings store for UI V2.
 */

export interface GlobalSettings {
  darkMode?: boolean;
  highlightStrength?: number;
}

export const GLOBAL_SETTINGS_KEY = "GlobalSettings";

export function parseSettings(raw: string | null): GlobalSettings {
  if (!raw) return {};
  try {
    const val = JSON.parse(raw);
    if (val && typeof val === "object") {
      const settings: GlobalSettings = {};
      if (typeof val.darkMode === "boolean") {
        settings.darkMode = val.darkMode;
      }
      if (typeof val.highlightStrength === "number") {
        settings.highlightStrength = val.highlightStrength;
      }
      return settings;
    }
  } catch {}
  return {};
}

export const settingsStore = {
  get(): GlobalSettings {
    try {
      return parseSettings(localStorage.getItem(GLOBAL_SETTINGS_KEY));
    } catch {
      return {};
    }
  },

  update(patch: Partial<GlobalSettings>): GlobalSettings {
    try {
      const current = settingsStore.get();
      const next = { ...current, ...patch };
      localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(next));
      return next;
    } catch (e) {
      console.warn("Could not persist settings to localStorage", e);
      return patch;
    }
  },
};
