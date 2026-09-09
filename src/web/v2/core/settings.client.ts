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

/**
 * Key used in localStorage to store active dictionary keys (compatible with V1).
 */
export const SEARCH_SETTINGS_KEY = "SEARCH_SETTINGS_KEY";
export const DICT_COOKIE_NAME = "morcus_dicts";

export const dictSettingsStore = {
  get(): string[] | null {
    try {
      const stored = localStorage.getItem(SEARCH_SETTINGS_KEY);
      if (!stored) return null;
      const keys = stored
        .split(";")
        .map((k) => k.trim())
        .filter(Boolean);
      return keys.length > 0 ? keys : null;
    } catch {
      return null;
    }
  },

  set(dictKeys: string[]): void {
    try {
      localStorage.setItem(SEARCH_SETTINGS_KEY, dictKeys.join(";"));
      // Also update the functional UI cookie so future SSR calls reflect this choice
      const cookieVal = encodeURIComponent(dictKeys.join(";"));
      document.cookie = `${DICT_COOKIE_NAME}=${cookieVal}; Path=/; Max-Age=31536000; SameSite=Lax`;
    } catch (e) {
      console.warn("Could not persist dict settings", e);
    }
  },

  /**
   * Synchronizes localStorage and cookie: if cookie is absent but localStorage exists,
   * writes cookie so subsequent SSR navigations remain in sync.
   */
  syncWithCookie(): void {
    try {
      const stored = dictSettingsStore.get();
      if (!stored || stored.length === 0) return;

      const hasCookie = document.cookie
        .split(";")
        .some((c) => c.trim().startsWith(`${DICT_COOKIE_NAME}=`));

      if (!hasCookie) {
        dictSettingsStore.set(stored);
      }
    } catch {}
  },
};

