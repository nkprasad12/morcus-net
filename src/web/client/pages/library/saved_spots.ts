import { safeParseInt } from "@/common/misc_utils";

const SAVED_SPOTS_KEY_PREFIX = "LIBRARY_SPOT_V1";

const getKey = (id: string) => SAVED_SPOTS_KEY_PREFIX + id;

export namespace LibrarySavedSpot {
  export function get(id: string): number | undefined {
    const stored = localStorage.getItem(getKey(id));
    if (stored === null) {
      return undefined;
    }
    return safeParseInt(JSON.parse(stored));
  }

  export function set(id: string, page: number): void {
    localStorage.setItem(getKey(id), JSON.stringify(page));
  }
}
