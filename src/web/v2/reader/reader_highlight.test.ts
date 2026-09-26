import {
  getFirstHighlightSectionId,
  isWordIndexHighlighted,
  parseTextHighlights,
  textHighlightParams,
} from "@/web/v2/reader/reader_highlight.common";

describe("reader_highlight.common", () => {
  describe("parseTextHighlights", () => {
    it("returns undefined when matchText is undefined", () => {
      expect(parseTextHighlights(undefined)).toBeUndefined();
    });

    it("returns undefined when matchText is empty or whitespace", () => {
      expect(parseTextHighlights("")).toBeUndefined();
      expect(parseTextHighlights("   ")).toBeUndefined();
    });

    it("parses single highlight correctly", () => {
      expect(parseTextHighlights("section1~10~15")).toEqual(
        new Map([["section1", [{ start: 10, end: 15 }]]])
      );
    });

    it("parses multiple highlights with same ID", () => {
      expect(parseTextHighlights("section1~10~15__section1~20~23")).toEqual(
        new Map([
          [
            "section1",
            [
              { start: 10, end: 15 },
              { start: 20, end: 23 },
            ],
          ],
        ])
      );
    });

    it("parses multiple highlights with different IDs", () => {
      expect(parseTextHighlights("section1~10~15__section2~20~23")).toEqual(
        new Map([
          ["section1", [{ start: 10, end: 15 }]],
          ["section2", [{ start: 20, end: 23 }]],
        ])
      );
    });

    it("returns undefined for invalid format with wrong number of parts", () => {
      expect(parseTextHighlights("section1~10")).toBeUndefined();
      expect(parseTextHighlights("section1~10~15~20")).toBeUndefined();
    });

    it("returns undefined for empty section ID", () => {
      expect(parseTextHighlights("~10~15")).toBeUndefined();
      expect(parseTextHighlights("  ~10~15")).toBeUndefined();
    });

    it("returns undefined for invalid start position", () => {
      expect(parseTextHighlights("section1~abc~5")).toBeUndefined();
    });

    it("returns undefined for invalid end position", () => {
      expect(parseTextHighlights("section1~10~xyz")).toBeUndefined();
    });

    it("returns undefined when one of multiple highlights is invalid", () => {
      expect(
        parseTextHighlights("section1~10~15__section2~invalid~3")
      ).toBeUndefined();
    });
  });

  describe("getFirstHighlightSectionId", () => {
    it("returns the first section ID for valid matchText", () => {
      expect(getFirstHighlightSectionId("1.2.3~0~4__1.2.4~0~2")).toBe("1.2.3");
    });

    it("returns undefined for invalid or empty matchText", () => {
      expect(getFirstHighlightSectionId(undefined)).toBeUndefined();
      expect(getFirstHighlightSectionId("")).toBeUndefined();
      expect(getFirstHighlightSectionId("1.2.3~bad~4")).toBeUndefined();
    });
  });

  describe("textHighlightParams", () => {
    it("round-trips highlight tuples through parseTextHighlights", () => {
      const params = textHighlightParams([
        { id: "1.1.1", start: 0, end: 3 },
        { id: "1.1.2", start: 4, end: 7 },
      ]);
      expect(params).toEqual({ matchText: "1.1.1~0~3__1.1.2~4~7" });
      expect(parseTextHighlights(params.matchText)).toEqual(
        new Map([
          ["1.1.1", [{ start: 0, end: 3 }]],
          ["1.1.2", [{ start: 4, end: 7 }]],
        ])
      );
    });
  });

  describe("isWordIndexHighlighted", () => {
    it("checks half-open [start, end) range boundaries", () => {
      const ranges = [
        { start: 2, end: 5 },
        { start: 8, end: 9 },
      ];
      expect(isWordIndexHighlighted(1, ranges)).toBe(false);
      expect(isWordIndexHighlighted(2, ranges)).toBe(true);
      expect(isWordIndexHighlighted(4, ranges)).toBe(true);
      expect(isWordIndexHighlighted(5, ranges)).toBe(false);
      expect(isWordIndexHighlighted(8, ranges)).toBe(true);
      expect(isWordIndexHighlighted(9, ranges)).toBe(false);
      expect(isWordIndexHighlighted(0, undefined)).toBe(false);
    });
  });
});
