import {
  countTotalSenses,
  hasDictToc,
  renderDictTocHtml,
  truncateSenseText,
} from "@/web/v2/dict/dict_toc.server";
import { DictsFusedResponse } from "@/common/dictionaries/dictionaries";
import { XmlNode } from "@/common/xml/xml_node";
import { EntryResult } from "@/common/dictionaries/dict_result";

function makeMockEntry(
  headword: string,
  sectionId: string,
  senses: { level: number; ordinal: string; text: string; sectionId: string }[]
): EntryResult {
  return {
    entry: new XmlNode("entry", [["id", sectionId]], [headword]),
    outline: {
      mainKey: headword,
      mainSection: {
        text: headword,
        level: 0,
        ordinal: "",
        sectionId,
      },
      senses,
    },
  };
}

describe("dict_toc.server", () => {
  describe("truncateSenseText", () => {
    test("returns short strings unchanged", () => {
      expect(truncateSenseText("Literal meaning")).toBe("Literal meaning");
    });

    test("truncates long strings at word boundaries with an ellipsis", () => {
      const longText =
        "To come near, approach, draw near to; of persons or things, with dat., in or ad with acc., or absol.";
      const truncated = truncateSenseText(longText, 45);
      expect(truncated.endsWith("…")).toBe(true);
      expect(truncated.length).toBeLessThanOrEqual(46);
      expect(truncated).toBe("To come near, approach, draw near to; of…");
    });

    test("collapses multiple consecutive whitespace characters", () => {
      expect(truncateSenseText("  First    sense   text  ")).toBe(
        "First sense text"
      );
    });
  });

  describe("countTotalSenses and hasDictToc gating threshold", () => {
    test("returns 0 and false for empty search results", () => {
      const results: DictsFusedResponse = {};
      expect(countTotalSenses(results)).toEqual({
        totalSenses: 0,
        maxSingleEntrySenses: 0,
        totalEntries: 0,
      });
      expect(hasDictToc(results)).toBe(false);
      expect(renderDictTocHtml({ results })).toBe("");
    });

    test("returns false for short entries below gating threshold (single entry with 1 or 2 senses total)", () => {
      const results: DictsFusedResponse = {
        ls: [
          makeMockEntry("abbas", "n100", [
            { level: 1, ordinal: "I.", text: "An abbot", sectionId: "n100.1" },
            { level: 1, ordinal: "II.", text: "A father", sectionId: "n100.2" },
          ]),
        ],
      };
      expect(countTotalSenses(results)).toEqual({
        totalSenses: 2,
        maxSingleEntrySenses: 2,
        totalEntries: 1,
      });
      expect(hasDictToc(results)).toBe(false);
      expect(renderDictTocHtml({ results })).toBe("");
    });

    test("returns true for single entry with >= 3 senses", () => {
      const results: DictsFusedResponse = {
        ls: [
          makeMockEntry("proximus", "n38913", [
            {
              level: 1,
              ordinal: "I.",
              text: "Nearest, next",
              sectionId: "n38913.1",
            },
            {
              level: 2,
              ordinal: "A.",
              text: "In place",
              sectionId: "n38913.2",
            },
            { level: 2, ordinal: "B.", text: "In time", sectionId: "n38913.3" },
          ]),
        ],
      };
      expect(countTotalSenses(results)).toEqual({
        totalSenses: 3,
        maxSingleEntrySenses: 3,
        totalEntries: 1,
      });
      expect(hasDictToc(results)).toBe(true);
      expect(renderDictTocHtml({ results })).not.toBe("");
    });

    test("returns true for multiple entries totaling >= 4 senses across dictionaries", () => {
      const results: DictsFusedResponse = {
        ls: [
          makeMockEntry("facio", "n17800", [
            { level: 1, ordinal: "I.", text: "Sense 1", sectionId: "n17800.1" },
            {
              level: 1,
              ordinal: "II.",
              text: "Sense 2",
              sectionId: "n17800.2",
            },
          ]),
        ],
        gaffiot: [
          makeMockEntry("facio", "g5400", [
            {
              level: 1,
              ordinal: "1.",
              text: "Gaffiot 1",
              sectionId: "g5400.1",
            },
            {
              level: 1,
              ordinal: "2.",
              text: "Gaffiot 2",
              sectionId: "g5400.2",
            },
          ]),
        ],
      };
      expect(countTotalSenses(results)).toEqual({
        totalSenses: 4,
        maxSingleEntrySenses: 2,
        totalEntries: 2,
      });
      expect(hasDictToc(results)).toBe(true);
      expect(renderDictTocHtml({ results })).not.toBe("");
    });

    test("returns true for multiple entries even with < 4 senses total", () => {
      const results: DictsFusedResponse = {
        ls: [
          makeMockEntry("canis", "n1", [
            { level: 1, ordinal: "I.", text: "A dog", sectionId: "n1.1" },
          ]),
        ],
        gaffiot: [
          makeMockEntry("canis", "n2", [
            { level: 1, ordinal: "1.", text: "Chien", sectionId: "n2.1" },
          ]),
        ],
      };
      expect(countTotalSenses(results)).toEqual({
        totalSenses: 2,
        maxSingleEntrySenses: 1,
        totalEntries: 2,
      });
      expect(hasDictToc(results)).toBe(true);
      const html = renderDictTocHtml({ results });
      expect(html).toContain("v2-toc-entries-summary");
      expect(html).toContain(
        'Contents <span class="v2-toc-count">(2 entries · 2 senses)</span>'
      );
    });
  });

  describe("renderDictTocHtml structure and depth capping", () => {
    test("caps depth at Level 3 and excludes Level 4+", () => {
      const results: DictsFusedResponse = {
        ls: [
          makeMockEntry("facio", "n17800", [
            {
              level: 1,
              ordinal: "I.",
              text: "Physical making",
              sectionId: "s1",
            },
            { level: 2, ordinal: "A.", text: "Constructing", sectionId: "s2" },
            { level: 3, ordinal: "1.", text: "Buildings", sectionId: "s3" },
            { level: 4, ordinal: "a.", text: "Houses", sectionId: "s4" },
            { level: 5, ordinal: "α.", text: "Villas", sectionId: "s5" },
          ]),
        ],
      };

      const html = renderDictTocHtml({ results, maxLevel: 3 });

      // Levels 1-3 included
      expect(html).toContain('href="#s1"');
      expect(html).toContain("Physical making");
      expect(html).toContain('href="#s2"');
      expect(html).toContain("Constructing");
      expect(html).toContain('href="#s3"');
      expect(html).toContain("Buildings");

      // Levels 4 and 5 excluded
      expect(html).not.toContain('href="#s4"');
      expect(html).not.toContain("Houses");
      expect(html).not.toContain('href="#s5"');
      expect(html).not.toContain("Villas");
    });

    test("renders semantic No-JS drawer tags and multi-lexicon grouping", () => {
      const results: DictsFusedResponse = {
        ls: [
          makeMockEntry("lex", "n27000", [
            { level: 1, ordinal: "I.", text: "Proposition", sectionId: "ls1" },
            {
              level: 1,
              ordinal: "II.",
              text: "Enacted bill",
              sectionId: "ls2",
            },
          ]),
        ],
        gaffiot: [
          makeMockEntry("lex", "g3000", [
            { level: 1, ordinal: "1.", text: "Loi", sectionId: "gaf1" },
            {
              level: 1,
              ordinal: "2.",
              text: "Projet de loi",
              sectionId: "gaf2",
            },
          ]),
        ],
      };

      const html = renderDictTocHtml({ results });

      // Outer custom element and disclosure
      expect(html).toContain(
        '<morcus-dict-toc class="v2-drawer v2-drawer-toc">'
      );
      expect(html).toContain('<details class="v2-toc-details" open>');
      expect(html).toContain('<summary class="v2-drawer-bar v2-toc-bar"');
      expect(html).toContain(
        '<div class="v2-drawer-handle" aria-hidden="true"></div>'
      );
      expect(html).toContain(
        'Contents <span class="v2-toc-count">(2 entries · 4 senses)</span>'
      );

      // Global multi-lexicon entries summary (streamlined without redundant section titles)
      expect(html).toContain('class="v2-toc-section v2-toc-entries-summary"');
      expect(html).not.toContain('class="v2-toc-section-title"');
      expect(html).toContain('class="v2-toc-entries-group"');
      expect(html).toContain(
        '<span class="v2-toc-entries-divider" aria-hidden="true">|</span>'
      );
      expect(html).toContain('href="#n27000" class="v2-toc-entry-chip"');
      expect(html).toContain('href="#g3000" class="v2-toc-entry-chip"');

      // Dictionary groups have clean full names without redundant badges in header
      expect(html).toContain('href="#dict-ls" class="v2-toc-dict-link"');
      expect(html).toContain(
        '<span class="v2-toc-dict-name">Lewis &#x26; Short</span>'
      );
      expect(html).toContain('href="#dict-gaffiot" class="v2-toc-dict-link"');
      expect(html).toContain('<span class="v2-toc-dict-name">Gaffiot</span>');

      // Entry article headers in outline carry the dictionary badge
      expect(html).toContain(
        '<span class="v2-toc-badge v2-toc-badge-la">L&#x26;S</span>'
      );
      expect(html).toContain('<span class="v2-toc-entry-word">lex</span>');
      expect(html).toContain(
        '<span class="v2-toc-badge v2-toc-badge-la">GAF</span>'
      );

      // TOC links
      expect(html).toContain('href="#ls1" class="v2-toc-link"');
      expect(html).toContain('href="#gaf1" class="v2-toc-link"');
    });

    test("distinguishes multiple entries within a single dictionary", () => {
      const results: DictsFusedResponse = {
        ls: [
          makeMockEntry("cum (1)", "n12001", [
            {
              level: 1,
              ordinal: "I.",
              text: "Preposition with ablative",
              sectionId: "c1.1",
            },
            {
              level: 1,
              ordinal: "II.",
              text: "In compounds",
              sectionId: "c1.2",
            },
          ]),
          makeMockEntry("cum (2)", "n12002", [
            {
              level: 1,
              ordinal: "I.",
              text: "Conjunction temporal",
              sectionId: "c2.1",
            },
            {
              level: 1,
              ordinal: "II.",
              text: "Conjunction causal",
              sectionId: "c2.2",
            },
          ]),
        ],
      };

      const html = renderDictTocHtml({ results });

      expect(html).toContain('<div class="v2-toc-entry">');
      expect(html).toContain(
        'href="#n12001" class="v2-toc-link v2-toc-entry-link"'
      );
      expect(html).toContain("cum (1)");
      expect(html).toContain(
        'href="#n12002" class="v2-toc-link v2-toc-entry-link"'
      );
      expect(html).toContain("cum (2)");
    });
  });
});
