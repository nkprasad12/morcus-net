import { safeParseInt } from "@/common/misc_utils";

const SAVED_SPOTS_KEY_PREFIX = "LIBRARY_SPOT_";

const getKey = (id: string, v: string) => SAVED_SPOTS_KEY_PREFIX + v + id;

export namespace LibrarySavedSpot {
  export function get(id: string): number | string | undefined {
    const stored = localStorage.getItem(getKey(id, "V2"));
    if (stored !== null) {
      return JSON.parse(stored);
    }
    const v1 = localStorage.getItem(getKey(id, "V1"));
    if (v1 === null) {
      return undefined;
    }
    return safeParseInt(JSON.parse(v1));
  }

  export function set(id: string, sectionId: string): void {
    localStorage.setItem(getKey(id, "V2"), JSON.stringify(sectionId));
  }
}
