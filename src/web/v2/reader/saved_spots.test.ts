/**
 * @jest-environment jsdom
 */
import {
  SAVED_SPOTS_KEY,
  parseSavedSpots,
  savedSpotsStore,
} from "@/web/v2/reader/saved_spots.client";

describe("saved_spots.client", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("parseSavedSpots", () => {
    it("returns empty object for null or empty string", () => {
      expect(parseSavedSpots(null)).toEqual({});
      expect(parseSavedSpots("")).toEqual({});
    });

    it("returns empty object for non-object JSON", () => {
      expect(parseSavedSpots("123")).toEqual({});
      expect(parseSavedSpots('"hello"')).toEqual({});
      expect(parseSavedSpots("[1, 2, 3]")).toEqual({});
      expect(parseSavedSpots("null")).toEqual({});
    });

    it("returns empty object for malformed JSON without throwing", () => {
      expect(parseSavedSpots("not-valid-json{")).toEqual({});
    });

    it("parses valid V1 spots correctly", () => {
      const v1Json = JSON.stringify({
        "phi0448.phi001.perseus-lat2": { sectionId: "1.4" },
        "phi0472.phi001.perseus-lat2": { sectionId: "5" },
      });
      expect(parseSavedSpots(v1Json)).toEqual({
        "phi0448.phi001.perseus-lat2": { sectionId: "1.4" },
        "phi0472.phi001.perseus-lat2": { sectionId: "5" },
      });
    });

    it("trims whitespace from sectionId", () => {
      const raw = JSON.stringify({
        workA: { sectionId: "  2.1  " },
      });
      expect(parseSavedSpots(raw)).toEqual({
        workA: { sectionId: "2.1" },
      });
    });

    it("drops entries with missing or invalid sectionId", () => {
      const raw = JSON.stringify({
        validWork: { sectionId: "1.1" },
        missingSec: {},
        numericSec: { sectionId: 123 },
        emptySec: { sectionId: "   " },
        nullEntry: null,
        strEntry: "1.2",
      });
      expect(parseSavedSpots(raw)).toEqual({
        validWork: { sectionId: "1.1" },
      });
    });
  });

  describe("savedSpotsStore", () => {
    it("returns undefined when no spot is saved", () => {
      expect(savedSpotsStore.get("caesar")).toBeUndefined();
      expect(savedSpotsStore.getAll()).toEqual({});
    });

    it("saves and retrieves a reading spot", () => {
      savedSpotsStore.set("caesar", "1.4");
      expect(savedSpotsStore.get("caesar")).toBe("1.4");
      expect(savedSpotsStore.getAll()).toEqual({
        caesar: { sectionId: "1.4" },
      });

      // Verify raw localStorage matches V1 schema
      const stored = localStorage.getItem(SAVED_SPOTS_KEY);
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toEqual({
        caesar: { sectionId: "1.4" },
      });
    });

    it("updates existing spot without clobbering other works", () => {
      savedSpotsStore.set("caesar", "1.1");
      savedSpotsStore.set("catullus", "5");
      savedSpotsStore.set("caesar", "1.8");

      expect(savedSpotsStore.get("caesar")).toBe("1.8");
      expect(savedSpotsStore.get("catullus")).toBe("5");
      expect(savedSpotsStore.getAll()).toEqual({
        caesar: { sectionId: "1.8" },
        catullus: { sectionId: "5" },
      });
    });

    it("ignores empty workId or sectionId", () => {
      savedSpotsStore.set("", "1.4");
      savedSpotsStore.set("caesar", "");
      expect(savedSpotsStore.getAll()).toEqual({});
    });

    it("removes a single work's saved spot", () => {
      savedSpotsStore.set("caesar", "1.4");
      savedSpotsStore.set("catullus", "5");

      savedSpotsStore.remove("caesar");
      expect(savedSpotsStore.get("caesar")).toBeUndefined();
      expect(savedSpotsStore.get("catullus")).toBe("5");
    });

    it("clears all saved spots", () => {
      savedSpotsStore.set("caesar", "1.4");
      savedSpotsStore.set("catullus", "5");

      savedSpotsStore.clear();
      expect(savedSpotsStore.getAll()).toEqual({});
      expect(localStorage.getItem(SAVED_SPOTS_KEY)).toBeNull();
    });

    it("handles localStorage read/write failure gracefully", () => {
      const spy = jest
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("QuotaExceeded");
        });
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      expect(() => savedSpotsStore.set("caesar", "1.4")).not.toThrow();

      spy.mockRestore();
      warnSpy.mockRestore();
    });
  });
});
