const SAVED_SPOTS_KEY = "LIBRARY_SPOTS";

interface SavedSpotEntry {
  sectionId: string;
}

interface SavedSpotData {
  [workId: string]: SavedSpotEntry;
}

export namespace LibrarySavedSpot {
  export function getAll(): SavedSpotData {
    const stored = localStorage.getItem(SAVED_SPOTS_KEY);
    if (stored !== null) {
      return JSON.parse(stored);
    }
    return {};
  }

  export function get(workId: string): string | undefined {
    return getAll()[workId]?.sectionId;
  }

  export function set(workId: string, sectionId: string): void {
    const spots = getAll();
    spots[workId] = { sectionId };
    localStorage.setItem(SAVED_SPOTS_KEY, JSON.stringify(spots));
  }
}
