import {
  TOC_MIN_MULTI_ENTRIES,
  TOC_MIN_SINGLE_ENTRY_SENSES,
  TOC_MIN_TOTAL_SENSES,
  DictTocTree,
  buildTocTree,
  countTotalSenses,
  extractHeadword,
  formatTeaserCount,
  hasDictToc,
  meetsTocThreshold,
  renderDictTocHtml,
  renderTocEntriesSummaryHtml,
  renderTocSenseListHtml,
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
      expect(html).toContain("toc-entries-summary");
      expect(html).toContain(
        'Contents <span class="toc-count">(2 entries · 2 senses)</span>'
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
      expect(html).toContain('<morcus-dict-toc class="drawer drawer-toc">');
      expect(html).toContain('<details class="toc-details" open>');
      expect(html).toContain('<summary class="drawer-bar toc-bar"');
      expect(html).toContain(
        '<div class="drawer-handle" aria-hidden="true"></div>'
      );
      expect(html).toContain(
        'Contents <span class="toc-count">(2 entries · 4 senses)</span>'
      );

      // Global multi-lexicon entries summary (streamlined without redundant section titles)
      expect(html).toContain('class="toc-section toc-entries-summary"');
      expect(html).not.toContain('class="toc-section-title"');
      expect(html).toContain('class="toc-entries-group"');
      expect(html).toContain(
        '<span class="toc-entries-divider" aria-hidden="true">|</span>'
      );
      expect(html).toContain('href="#n27000" class="toc-entry-chip"');
      expect(html).toContain('href="#g3000" class="toc-entry-chip"');

      // Dictionary groups have clean full names without redundant badges in header
      expect(html).toContain('href="#dict-ls" class="toc-dict-link"');
      expect(html).toContain(
        '<span class="toc-dict-name">Lewis &amp; Short</span>'
      );
      expect(html).toContain('href="#dict-gaffiot" class="toc-dict-link"');
      expect(html).toContain('<span class="toc-dict-name">Gaffiot</span>');

      // Entry article headers in outline carry the dictionary badge
      expect(html).toContain(
        '<span class="toc-badge toc-badge-la">L&amp;S</span>'
      );
      expect(html).toContain('<span class="toc-entry-word">lex</span>');
      expect(html).toContain('<span class="toc-badge toc-badge-la">GAF</span>');

      // TOC links
      expect(html).toContain('href="#ls1" class="toc-link"');
      expect(html).toContain('href="#gaf1" class="toc-link"');
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

      expect(html).toContain('<div class="toc-entry">');
      expect(html).toContain('href="#n12001" class="toc-link toc-entry-link"');
      expect(html).toContain("cum (1)");
      expect(html).toContain('href="#n12002" class="toc-link toc-entry-link"');
      expect(html).toContain("cum (2)");
    });
  });

  describe("characterization snapshot pinning", () => {
    test("matches snapshot for all primary structural shapes", () => {
      // 1. single dict, 1 entry, 5 senses at levels 1–5 (depth capping, no entry header)
      const fixtureSingleDictDepthCapping: DictsFusedResponse = {
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

      // 2. single dict, 2 entries (entries.length > 1 header path)
      const fixtureSingleDictMultiEntry: DictsFusedResponse = {
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

      // 3. 2 dicts, 1 entry each (totalEntries > 1 header path + chip summary)
      const fixtureMultiLexicon: DictsFusedResponse = {
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

      // 4. multi dict where one has lone entry with 0 senses
      const fixtureLoneEntry: DictsFusedResponse = {
        ls: [
          makeMockEntry("facio", "n17800", [
            { level: 1, ordinal: "I.", text: "Sense 1", sectionId: "s1" },
            { level: 1, ordinal: "II.", text: "Sense 2", sectionId: "s2" },
            { level: 1, ordinal: "III.", text: "Sense 3", sectionId: "s3" },
          ]),
        ],
        gaffiot: [makeMockEntry("facio_lone", "g5000", [])],
      };

      // 5. escaping: entry with & and < in headword and ordinal
      const fixtureEscaping: DictsFusedResponse = {
        ls: [
          makeMockEntry("pars & <sectio>", "n999", [
            {
              level: 1,
              ordinal: "I & <A>",
              text: "Part & parcel <first>",
              sectionId: "p1",
            },
            { level: 1, ordinal: "II.", text: "Division", sectionId: "p2" },
            { level: 1, ordinal: "III.", text: "Share", sectionId: "p3" },
          ]),
        ],
      };

      const normalize = (html: string) => html.replace(/\s+/g, " ").trim();

      expect(
        normalize(renderDictTocHtml({ results: fixtureSingleDictDepthCapping }))
      ).toMatchSnapshot();
      expect(
        normalize(renderDictTocHtml({ results: fixtureSingleDictMultiEntry }))
      ).toMatchSnapshot();
      expect(
        normalize(renderDictTocHtml({ results: fixtureMultiLexicon }))
      ).toMatchSnapshot();
      expect(
        normalize(renderDictTocHtml({ results: fixtureLoneEntry }))
      ).toMatchSnapshot();
      expect(
        normalize(renderDictTocHtml({ results: fixtureEscaping }))
      ).toMatchSnapshot();
    });
  });

  describe("meetsTocThreshold and threshold constants", () => {
    test("exports named threshold constants", () => {
      expect(TOC_MIN_TOTAL_SENSES).toBe(4);
      expect(TOC_MIN_SINGLE_ENTRY_SENSES).toBe(3);
      expect(TOC_MIN_MULTI_ENTRIES).toBe(2);
    });

    test("evaluates sense and entry thresholds consistently", () => {
      expect(
        meetsTocThreshold({
          totalSenses: 0,
          maxSingleEntrySenses: 0,
          totalEntries: 0,
        })
      ).toBe(false);
      expect(
        meetsTocThreshold({
          totalSenses: 3,
          maxSingleEntrySenses: 2,
          totalEntries: 1,
        })
      ).toBe(false);
      expect(
        meetsTocThreshold({
          totalSenses: 4,
          maxSingleEntrySenses: 2,
          totalEntries: 1,
        })
      ).toBe(true);
      expect(
        meetsTocThreshold({
          totalSenses: 3,
          maxSingleEntrySenses: 3,
          totalEntries: 1,
        })
      ).toBe(true);
      expect(
        meetsTocThreshold({
          totalSenses: 1,
          maxSingleEntrySenses: 1,
          totalEntries: 2,
        })
      ).toBe(true);
    });
  });

  describe("extractHeadword and formatTeaserCount helpers", () => {
    test("extractHeadword strips XML tags and falls back properly", () => {
      const entryWithTags = makeMockEntry('<hi rend="b">facio</hi>', "n1", []);
      expect(extractHeadword(entryWithTags, 0)).toBe("facio");

      const entryWithoutLabels = {
        entry: new XmlNode("entry", [], []),
        outline: undefined,
      };
      expect(extractHeadword(entryWithoutLabels, 2)).toBe("Entry 3");
    });

    test("formatTeaserCount produces properly pluralized strings", () => {
      expect(formatTeaserCount(1, 1)).toBe("(1 sense)");
      expect(formatTeaserCount(1, 4)).toBe("(4 senses)");
      expect(formatTeaserCount(2, 1)).toBe("(2 entries · 1 sense)");
      expect(formatTeaserCount(3, 8)).toBe("(3 entries · 8 senses)");
      expect(formatTeaserCount(2, 0)).toBe("(2 entries)");
    });
  });

  describe("buildTocTree model extraction", () => {
    test("returns null when gating conditions are not met", () => {
      expect(buildTocTree({ results: {} })).toBeNull();
      const resultsBelowThreshold: DictsFusedResponse = {
        ls: [
          makeMockEntry("abbas", "n100", [
            { level: 1, ordinal: "I.", text: "An abbot", sectionId: "n100.1" },
            { level: 1, ordinal: "II.", text: "A father", sectionId: "n100.2" },
          ]),
        ],
      };
      expect(buildTocTree({ results: resultsBelowThreshold })).toBeNull();
    });

    test("extracts normalized tree with depth capping at level 3", () => {
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

      const tree = buildTocTree({ results, maxLevel: 3 });
      expect(tree).not.toBeNull();
      expect(tree!.totalEntries).toBe(1);
      expect(tree!.totalSenses).toBe(5);
      expect(tree!.teaserCount).toBe("(5 senses)");
      expect(tree!.chipGroups).toHaveLength(0); // single entry, no chips summary

      expect(tree!.groups).toHaveLength(1);
      const group = tree!.groups[0];
      expect(group.dictKey).toBe("ls");
      expect(group.dictName).toBe("Lewis & Short");
      expect(group.dictAcronym).toBe("L&S");
      expect(group.cardId).toBe("dict-ls");

      expect(group.entries).toHaveLength(1);
      const entry = group.entries[0];
      expect(entry.headword).toBe("facio");
      expect(entry.entryAnchorId).toBe("n17800");
      expect(entry.showHeader).toBe(false); // single entry in single dict
      expect(entry.isLoneEntry).toBe(false);

      // Depth capping: levels 1-3 included, 4 and 5 excluded
      expect(entry.senses).toHaveLength(3);
      expect(entry.senses.map((s) => s.sectionId)).toEqual(["s1", "s2", "s3"]);
      expect(entry.senses.map((s) => s.level)).toEqual([1, 2, 3]);
      expect(entry.senses.map((s) => s.indentLevel)).toEqual([0, 1, 2]);
      expect(entry.senses[0].text).toBe("Physical making");
    });

    test("extracts multi-lexicon structure and chips summary", () => {
      const results: DictsFusedResponse = {
        ls: [
          makeMockEntry('<hi rend="b">lex</hi>', "n27000", [
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

      const tree = buildTocTree({ results });
      expect(tree).not.toBeNull();
      expect(tree!.totalEntries).toBe(2);
      expect(tree!.totalSenses).toBe(4);
      expect(tree!.teaserCount).toBe("(2 entries · 4 senses)");

      // Multi-lexicon chips
      expect(tree!.chipGroups).toHaveLength(2);
      expect(tree!.chipGroups[0]).toEqual({
        dictKey: "ls",
        dictAcronym: "L&S",
        dictLang: "la",
        chips: [
          {
            headword: "lex",
            anchor: "#n27000",
            title: "Jump to lex (L&S)",
          },
        ],
      });
      expect(tree!.chipGroups[1]).toEqual({
        dictKey: "gaffiot",
        dictAcronym: "GAF",
        dictLang: "la",
        chips: [
          {
            headword: "lex",
            anchor: "#g3000",
            title: "Jump to lex (GAF)",
          },
        ],
      });

      // Outline groups show header when totalEntries > 1
      expect(tree!.groups).toHaveLength(2);
      expect(tree!.groups[0].entries[0].showHeader).toBe(true);
      expect(tree!.groups[1].entries[0].showHeader).toBe(true);
      // Stripped tag in outline headword too
      expect(tree!.groups[0].entries[0].headword).toBe("lex");
    });

    test("flags isLoneEntry when single entry has no outlined senses", () => {
      const results: DictsFusedResponse = {
        ls: [
          makeMockEntry("facio", "n17800", [
            { level: 1, ordinal: "I.", text: "Sense 1", sectionId: "s1" },
            { level: 1, ordinal: "II.", text: "Sense 2", sectionId: "s2" },
            { level: 1, ordinal: "III.", text: "Sense 3", sectionId: "s3" },
          ]),
        ],
        gaffiot: [makeMockEntry("solus", "g100", [])],
      };

      const tree = buildTocTree({ results });
      expect(tree).not.toBeNull();
      const gaffiotGroup = tree!.groups.find((g) => g.dictKey === "gaffiot")!;
      expect(gaffiotGroup.entries[0].isLoneEntry).toBe(true);
      expect(gaffiotGroup.entries[0].senses).toHaveLength(0);
    });
  });

  describe("isolated view renderers", () => {
    test("renderTocEntriesSummaryHtml renders chips and separators", () => {
      const chipGroups = [
        {
          dictKey: "ls",
          dictAcronym: "L&S",
          dictLang: "la",
          chips: [
            { headword: "lex", anchor: "#n1", title: "Jump to lex (L&S)" },
          ],
        },
        {
          dictKey: "gaffiot",
          dictAcronym: "GAF",
          dictLang: "la",
          chips: [
            { headword: "lex", anchor: "#g1", title: "Jump to lex (GAF)" },
          ],
        },
      ];

      const html = renderTocEntriesSummaryHtml(chipGroups);
      expect(html).toContain('class="toc-section toc-entries-summary"');
      expect(html).toContain('href="#n1" class="toc-entry-chip"');
      expect(html).toContain('title="Jump to lex (L&amp;S)"');
      expect(html).toContain('class="toc-entries-divider"');
    });

    test("renderTocSenseListHtml renders outline groups and preserves inline space after ordinal", () => {
      const fixtureTree: DictTocTree = {
        totalEntries: 1,
        totalSenses: 2,
        teaserCount: "(2 senses)",
        chipGroups: [],
        groups: [
          {
            dictKey: "ls",
            dictName: "Lewis & Short",
            dictAcronym: "L&S",
            cardId: "dict-ls",
            entries: [
              {
                headword: "facio",
                entryAnchorId: "n17800",
                dictAcronym: "L&S",
                dictLang: "la",
                showHeader: false,
                isLoneEntry: false,
                senses: [
                  {
                    sectionId: "s1",
                    level: 1,
                    indentLevel: 0,
                    ordinal: "I.",
                    text: "Physical making",
                  },
                  {
                    sectionId: "s2",
                    level: 2,
                    indentLevel: 1,
                    ordinal: "A.",
                    text: "Constructing",
                  },
                ],
              },
            ],
          },
        ],
      };

      const html = renderTocSenseListHtml(fixtureTree);
      expect(html).toContain('class="toc-section toc-outline"');
      expect(html).toContain('href="#dict-ls" class="toc-dict-link"');
      expect(html).toContain('href="#s1" class="toc-link"');
      // Verify load-bearing trailing space in ordinal tag
      expect(html).toContain(
        '<strong class="toc-ordinal">I.</strong> <span class="toc-text">Physical making</span>'
      );
      // Verify indentation style on level 2
      expect(html).toContain('style="margin-left: 0.75rem;"');
    });
  });
});
