import { isRecord } from "@/web/v2/core/settings.client";
import { storage } from "@/web/v2/core/storage.client";

/**
 * Typed LocalStorage saved spots store for UI V2 Library and Reader.
 * Fully compatible with V1 "LIBRARY_SPOTS" schema: Record<workId, { sectionId: string }>.
 */

export const SAVED_SPOTS_KEY = "LIBRARY_SPOTS";

export interface SavedSpotEntry {
  sectionId: string;
}

export type SavedSpotsData = Record<string, SavedSpotEntry>;

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
    return parseSavedSpots(storage.get(SAVED_SPOTS_KEY));
  },

  get(workId: string): string | undefined {
    if (!workId) return undefined;
    return this.getAll()[workId]?.sectionId;
  },

  set(workId: string, sectionId: string): void {
    if (!workId || !sectionId) return;
    const current = this.getAll();
    current[workId] = { sectionId: sectionId.trim() };
    storage.setJson(SAVED_SPOTS_KEY, current);
  },

  remove(workId: string): void {
    if (!workId) return;
    const current = this.getAll();
    if (delete current[workId]) {
      storage.setJson(SAVED_SPOTS_KEY, current);
    }
  },

  clear(): void {
    storage.remove(SAVED_SPOTS_KEY);
  },
};
