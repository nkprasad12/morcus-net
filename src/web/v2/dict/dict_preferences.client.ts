import { hasCookie } from "@/web/v2/core/cookies.common";
import { settingsStore } from "@/web/v2/core/settings.client";
import { storage } from "@/web/v2/core/storage.client";
import {
  DICT_COOKIE_NAME,
  INFLECTED_COOKIE_NAME,
  formatDictsCookie,
  formatInflectedCookie,
} from "@/web/v2/dict/dict_selection.common";

/**
 * Key used in localStorage to store active dictionary keys (compatible with V1).
 */
export const SEARCH_SETTINGS_KEY = "SEARCH_SETTINGS_KEY";

export const dictSettingsStore = {
  get(): string[] | null {
    const stored = storage.get(SEARCH_SETTINGS_KEY);
    if (!stored) return null;
    const keys = stored
      .split(";")
      .map((k) => k.trim())
      .filter(Boolean);
    return keys.length > 0 ? keys : null;
  },

  set(dictKeys: string[]): void {
    storage.set(SEARCH_SETTINGS_KEY, dictKeys.join(";"));
    // Also update the functional UI cookie so future SSR calls reflect this choice
    document.cookie = formatDictsCookie(dictKeys);
  },

  /**
   * Synchronizes localStorage and cookie: if cookie is absent but localStorage exists,
   * writes cookie so subsequent SSR navigations remain in sync.
   */
  syncWithCookie(): void {
    try {
      const stored = dictSettingsStore.get();
      if (!stored || stored.length === 0) return;

      if (!hasCookie(document.cookie, DICT_COOKIE_NAME)) {
        dictSettingsStore.set(stored);
      }
    } catch {}
  },
};

export const inflectedSettingsStore = {
  get(): boolean | null {
    const settings = settingsStore.get();
    if (typeof settings.inflectedSearch === "boolean") {
      return settings.inflectedSearch;
    }
    return null;
  },

  set(isInflected: boolean): void {
    settingsStore.update({ inflectedSearch: isInflected });
    try {
      document.cookie = formatInflectedCookie(isInflected);
    } catch {}
  },

  syncWithCookie(): void {
    try {
      const stored = inflectedSettingsStore.get();
      if (stored === null) return;

      if (!hasCookie(document.cookie, INFLECTED_COOKIE_NAME)) {
        inflectedSettingsStore.set(stored);
      }
    } catch {}
  },
};
