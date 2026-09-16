/**
 * Typed LocalStorage saved spots store for UI V2 Library and Reader.
 * Fully compatible with V1 "LIBRARY_SPOTS" schema: Record<workId, { sectionId: string }>.
 */

export const SAVED_SPOTS_KEY = "LIBRARY_SPOTS";

export interface SavedSpotEntry {
  sectionId: string;
}

export type SavedSpotsData = Record<string, SavedSpotEntry>;

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/**
 * Defensively parses and validates raw JSON from localStorage into SavedSpotsData.
 * Ignores malformed entries and invalid types without throwing.
 */
export function parseSavedSpots(raw: string | null): SavedSpotsData {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const result: SavedSpotsData = {};
    for (const key of Object.keys(parsed)) {
      const entry = parsed[key];
      if (
        isRecord(entry) &&
        typeof entry.sectionId === "string" &&
        entry.sectionId.trim().length > 0
      ) {
        result[key] = { sectionId: entry.sectionId.trim() };
      }
    }
    return result;
  } catch {
    return {};
  }
}

export const savedSpotsStore = {
  getAll(): SavedSpotsData {
    try {
      return parseSavedSpots(localStorage.getItem(SAVED_SPOTS_KEY));
    } catch {
      return {};
    }
  },

  get(workId: string): string | undefined {
    if (!workId) return undefined;
    return this.getAll()[workId]?.sectionId;
  },

  set(workId: string, sectionId: string): void {
    if (!workId || !sectionId) return;
    try {
      const current = this.getAll();
      current[workId] = { sectionId: sectionId.trim() };
      localStorage.setItem(SAVED_SPOTS_KEY, JSON.stringify(current));
    } catch (e) {
      console.warn("Could not persist saved spot to localStorage", e);
    }
  },

  remove(workId: string): void {
    if (!workId) return;
    try {
      const current = this.getAll();
      if (delete current[workId]) {
        localStorage.setItem(SAVED_SPOTS_KEY, JSON.stringify(current));
      }
    } catch (e) {
      console.warn("Could not remove saved spot from localStorage", e);
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(SAVED_SPOTS_KEY);
    } catch (e) {
      console.warn("Could not clear saved spots from localStorage", e);
    }
  },
};
