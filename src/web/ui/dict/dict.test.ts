import { xmlNodeToHtml } from "@/web/ui/dict/entry/xml_to_html.server";
import { renderEntryResult } from "@/web/ui/dict/entry/entry_view.server";
import { formatInflectionForm } from "@/web/ui/dict/entry/inflection_table.server";
import {
  resolveDictDisplayName,
  resolveDictAcronym,
  dictCardId,
  resolveDictLang,
} from "@/web/ui/dict/dict_attribution.server";
import {
  renderDictResultsHtml,
  renderDictPageHtml,
  parseDictScale,
  renderNoResultsHtml,
  renderNoEntriesHtml,
  renderJumpNavHtml,
  renderDictCardHtml,
} from "@/web/ui/dict/dict_page.server";
import { XmlNode } from "@/common/xml/xml_node";
import { EntryResult } from "@/common/dictionaries/dict_result";
import he from "he";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

describe("dict_ssr", () => {
  test("xmlNodeToHtml formats simple nodes with classes", () => {
    const node = new XmlNode("span", [["class", "lsOrth"]], ["Caesar"]);
    const html = xmlNodeToHtml(node);
    expect(html).toBe('<span class="lsOrth">Caesar</span>');
  });

  test("xmlNodeToHtml escapes html in content", () => {
    const node = new XmlNode("span", [], ["<script>alert(1)</script>"]);
    const html = xmlNodeToHtml(node);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("xmlNodeToHtml preserves non-ASCII UTF-8 characters without entity encoding", () => {
    const node = new XmlNode("span", [], ["ἵππος • hăbēna & nātūra"]);
    const html = xmlNodeToHtml(node);
    expect(html).toContain("&amp;");
    expect(html).toContain("ἵππος • hăbēna &amp; nātūra");
    expect(html).not.toMatch(/&#x[0-9A-Fa-f]+;/);
  });

  test("xmlNodeToHtml indents senses according to indentLevel", () => {
    const indentedNode = new XmlNode(
      "div",
      [["indentLevel", "2"]],
      ["Of personal subjects"]
    );
    const unindentedNode = new XmlNode(
      "div",
      [["indentLevel", "0"]],
      ["In general"]
    );

    expect(xmlNodeToHtml(indentedNode)).toContain('style="margin-left: 1em;"');
    expect(xmlNodeToHtml(unindentedNode)).not.toContain("style=");
  });

  test("xmlNodeToHtml preserves nested sense lists", () => {
    const node = new XmlNode(
      "ol",
      [],
      [
        new XmlNode(
          "li",
          [],
          [
            "Top-level sense",
            new XmlNode("ol", [], [new XmlNode("li", [], ["Nested sense"])]),
          ]
        ),
      ]
    );

    const html = xmlNodeToHtml(node);
    expect(html.match(/<ol>/g)).toHaveLength(2);
    expect(html.match(/<li>/g)).toHaveLength(2);
    expect(html).toContain("Nested");
    expect(html).toContain("</li></ol></li></ol>");
  });

  test("xmlNodeToHtml preserves inline formatting tags without wrapping in div", () => {
    const node = new XmlNode(
      "li",
      [["id", "sh1.0"]],
      [
        new XmlNode(
          "span",
          [
            ["class", "lsSenseBullet"],
            ["senseid", "sh1.0"],
          ],
          [" 1. "]
        ),
        "rēgia (",
        new XmlNode("i", [], ["sc."]),
        " domus): ",
        new XmlNode("i", [], ["the palace of the sun"]),
        ", r. solis, Ov. M. 2, 1: Cic.",
      ]
    );

    const html = xmlNodeToHtml(node);
    expect(html).not.toContain("<div>");
    expect(html).toContain("<i>sc.</i>");
    expect(html).toContain("<i>the palace of the sun</i>");
    expect(html).toContain("1. ");
  });

  test("xmlNodeToHtml transforms dLink cross references into links with text", () => {
    const node = new XmlNode(
      "span",
      [
        ["class", "dLink"],
        ["to", "regia"],
        ["text", "regia"],
      ],
      []
    );

    const html = xmlNodeToHtml(node);
    expect(html).toBe('<a class="dLink" href="/dicts?q=regia">regia</a>');
  });

  test("xmlNodeToHtml handles void tags like br", () => {
    const node = new XmlNode(
      "div",
      [],
      ["first line", new XmlNode("br"), "second line"]
    );
    const html = xmlNodeToHtml(node);
    expect(html).toBe("<div>first line<br>second line</div>");
  });

  test("xmlNodeToHtml preserves table elements for numerals", () => {
    const node = new XmlNode(
      "table",
      [["class", "numeralTable"]],
      [
        new XmlNode(
          "tr",
          [],
          [new XmlNode("td", [], ["Arabic"]), new XmlNode("td", [], ["57"])]
        ),
      ]
    );

    const html = xmlNodeToHtml(node);
    expect(html).toContain('<table class="numeralTable">');
    expect(html).toContain("<tr><td>Arabic</td><td>57</td></tr>");
  });

  test("xmlNodeToHtml preserves target, rel, and dir attributes", () => {
    const node = new XmlNode(
      "a",
      [
        ["href", "https://example.com"],
        ["target", "_blank"],
      ],
      ["External"]
    );
    const html = xmlNodeToHtml(node);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');

    const rtlNode = new XmlNode("span", [["dir", "rtl"]], ["עברית"]);
    expect(xmlNodeToHtml(rtlNode)).toContain('dir="rtl"');
  });

  test("formatInflectionForm decodes Morpheus diacritics into breves and macra", () => {
    expect(formatInflectionForm("i^ne_lucta_bi^libus")).toBe("ĭnēluctābĭlibus");
    expect(formatInflectionForm("a^ma_ve_re")).toBe("ămāvēre");
    expect(formatInflectionForm("poe+ta")).toBe("poëta");
  });

  test("renderEntryResult formats entry and inflections as always-visible grouped lines inside entry-header", () => {
    const entryResult: EntryResult = {
      entry: '<span class="lsOrth">amo</span>',
      outline: {
        mainKey: "amo",
        mainSection: { text: "amo", level: 0, ordinal: "", sectionId: "0" },
        senses: [],
      },
      inflections: [
        {
          form: "a^ma_ve_re",
          lemma: "amo",
          data: "3rd pl perf act ind",
          usageNote: "poetic",
        },
        {
          form: "a^ma_ve_re",
          lemma: "amo",
          data: "2nd sg fut perf pass ind",
        },
        {
          form: "a^ma_ve^ris",
          lemma: "amo",
          data: "2nd sg fut perf act ind",
        },
      ],
    };

    const rendered = renderEntryResult(entryResult);
    expect(rendered).toContain('<span class="lsOrth">amo</span>');
    expect(rendered).toContain('class="entry-inflections"');
    expect(rendered).not.toContain("<table");
    expect(rendered).not.toContain("Inflections");
    // Same-form analyses are grouped onto a single line separated by " · "
    expect(rendered).toContain(
      '<p class="inflection-line"><b>ămāvēre</b>: 3rd pl perf act ind <span class="usage-note">(poetic)</span> · 2nd sg fut perf pass ind</p>'
    );
    // Distinct macronized forms render on separate lines
    expect(rendered).toContain(
      '<p class="inflection-line"><b>ămāvĕris</b>: 2nd sg fut perf act ind</p>'
    );
    // Inflections render inside <header class="entry-header ..."> before </header>
    const headerEnd = rendered.indexOf("</header>");
    const inflectionsPos = rendered.indexOf('class="entry-inflections"');
    expect(inflectionsPos).toBeGreaterThan(0);
    expect(inflectionsPos).toBeLessThan(headerEnd);
  });

  test("renderDictResultsHtml handles empty query with landing view", () => {
    const html = renderDictResultsHtml("");
    expect(html).toContain("landing-container");
    expect(html).toContain("Understanding the Markup");
    expect(html).toContain("All Dictionaries");
    expect(html).toContain(
      "Entries highlight grammar, citations, and sections"
    );
    expect(html).toContain("Enable or disable dictionaries in the settings");
    expect(html).toContain(
      "You can change highlight intensity in the settings"
    );
    expect(html).toContain(
      "Welcome to the dictionary. You can search Latin headwords and inflected forms, and words in English and German."
    );
    // In default configuration, L&S is enabled and EGL (Pozo) is disabled
    expect(html).toContain('data-dict-key="L&S"');
    expect(html).toContain(
      'class="lexicon-badge dict-badge-la dict-enabled">L&S<'
    );
    expect(html).toContain(
      'class="lexicon-badge dict-badge-la dict-enabled">GAF<'
    );
    expect(html).toContain(
      'class="lexicon-badge dict-badge-la dict-enabled">GES<'
    );
    expect(html).toContain(
      'class="lexicon-badge dict-badge-la dict-enabled">FOR<'
    );
    expect(html).toContain(
      'class="lexicon-badge dict-badge-en dict-enabled">S&H<'
    );
    expect(html).toContain(
      'class="lexicon-badge dict-badge-en dict-enabled">R&A<'
    );
    expect(html).toContain(
      'class="lexicon-badge dict-badge-de dict-enabled">GRG<'
    );
    expect(html).toContain(
      'class="lexicon-badge dict-badge-es dict-disabled">EGL<'
    );

    // Custom dictionaries: Latin only
    const latinOnlyHtml = renderDictResultsHtml("", undefined, {
      queriedDicts: ["L&S", "GAF"],
    });
    expect(latinOnlyHtml).toContain(
      "Welcome to the dictionary. You can search Latin headwords and inflected forms."
    );
    expect(latinOnlyHtml).not.toContain("words in");

    // Custom dictionaries: English reverse only
    const englishOnlyHtml = renderDictResultsHtml("", undefined, {
      queriedDicts: ["S&H"],
    });
    expect(englishOnlyHtml).toContain(
      "Welcome to the dictionary. You can search words in English."
    );
    expect(englishOnlyHtml).not.toContain("Latin headwords");

    // Inflection disabled landing page: Latin headwords only without inflected forms
    const nonInflectedHtml = renderDictResultsHtml("", undefined, {
      isInflected: false,
    });
    expect(nonInflectedHtml).toContain(
      "Welcome to the dictionary. You can search Latin headwords, and words in English and German."
    );
    expect(nonInflectedHtml).not.toContain("inflected forms");
  });

  test("renderDictResultsHtml handles no results", () => {
    const html = renderDictResultsHtml("nonexistent", {});
    expect(html).toContain("No dictionary entries found for");
  });

  test("renderDictResultsHtml renders inflected search guidance preserving active dicts, embedded, and save", () => {
    const html = renderDictResultsHtml(
      "amavi",
      {},
      {
        queriedDicts: ["L&S", "GAF"],
        isInflected: false,
        canSaveInflection: true,
      }
    );
    expect(html).toContain("No dictionary entries found for");
    expect(html).toContain("Exact headword search is active.");
    expect(html).toContain("Enable inflected search");
    expect(html).toContain('/dicts?q=amavi&amp;d=3&amp;o=1&amp;save=1"');

    const embeddedHtml = renderDictResultsHtml(
      "amavi",
      {},
      {
        queriedDicts: ["L&S"],
        isInflected: false,
        isEmbedded: true,
        canSaveInflection: false,
      }
    );
    expect(embeddedHtml).toContain(
      '/dicts?q=amavi&amp;d=1&amp;o=1&amp;embedded=1"'
    );
  });

  test("renderDictResultsHtml renders dictionary cards", () => {
    const results = {
      "L&S": [
        {
          entry: '<span class="lsOrth">Caesar</span>',
          outline: {
            mainKey: "Caesar",
            mainSection: {
              text: "Caesar",
              level: 0,
              ordinal: "",
              sectionId: "0",
            },
            senses: [],
          },
        },
      ],
    };
    const html = renderDictResultsHtml("caesar", results);
    expect(html).toContain("Lewis");
    expect(html).toContain("Short");
    expect(html).toContain('<span class="lsOrth">Caesar</span>');
    expect(html).toContain("<details");
  });

  test("renderDictPageHtml outputs complete HTML document", () => {
    const pageHtml = renderDictPageHtml({ query: "caesar" });
    expect(pageHtml).toContain("<!DOCTYPE html>");
    expect(pageHtml).toContain(
      "<style>body{background-color:var(--bg)}</style>"
    );
    expect(pageHtml).toContain(
      '<link rel="stylesheet" href="/assets/app.css">'
    );
    expect(pageHtml).toContain(
      `<script type="module" src="/assets/common.js" onerror="document.documentElement.setAttribute('data-js-failed','')"></script>`
    );
    expect(pageHtml).toContain(
      `<script type="module" src="/assets/dict.js" onerror="document.documentElement.setAttribute('data-js-failed','')"></script>`
    );
    // The form publishes the resolved state for the client to adopt: defaults here.
    expect(pageHtml).toContain(
      '<form class="search-form" role="search" action="/dicts" method="GET" data-d="an" data-o="1">'
    );
    expect(pageHtml).toContain("<morcus-dict-search>");
    expect(pageHtml).toContain("<morcus-dict-settings>");
    expect(pageHtml).toContain('<div id="top"></div>');
    expect(pageHtml).toContain('class="back-to-top"');
    expect(pageHtml).toContain('href="#top"');
  });

  test("xmlNodeToHtml renders text without word links in default No-JS/SSR mode", () => {
    const node = new XmlNode(
      "span",
      [["class", "lsQuote"]],
      ["Gallia est omnis"]
    );
    const html = xmlNodeToHtml(node);
    expect(html).not.toContain('href="/dicts?q=Gallia"');
    expect(html).not.toContain('class="lat-word"');
    expect(html).toContain("Gallia est omnis");
  });

  test("xmlNodeToHtml transforms sense bullet with senseid into an anchor link", () => {
    const node = new XmlNode(
      "span",
      [
        ["class", "lsSenseBullet"],
        ["senseid", "n20077.1"],
      ],
      [" • "]
    );
    const html = xmlNodeToHtml(node);
    expect(html).toContain("<a");
    expect(html).toContain('href="#n20077.1"');
    expect(html).toContain('class="lsSenseBullet section-anchor"');
    expect(html).toContain('title="Copy link to this section"');
    expect(html).toContain("•");
    expect(html).toContain("</a>");
  });

  test("xmlNodeToHtml gives a sense bullet its own id when nothing else claims it", () => {
    const node = new XmlNode(
      "span",
      [
        ["class", "lsSenseBullet"],
        ["senseid", "ra_dog.1"],
      ],
      [" • "]
    );
    const html = xmlNodeToHtml(node, { existingIds: new Set() });
    // Riddle & Arnold sense bullets have no enclosing element with id="ra_dog.1",
    // so the bullet anchor itself must carry the id for href="#ra_dog.1" to resolve.
    expect(html).toContain('id="ra_dog.1"');
    expect(html).toContain('href="#ra_dog.1"');
  });

  test("xmlNodeToHtml does not duplicate an id an ancestor already carries", () => {
    const node = new XmlNode(
      "li",
      [["id", "n20077.1"]],
      [
        new XmlNode(
          "span",
          [
            ["class", "lsSenseBullet"],
            ["senseid", "n20077.1"],
          ],
          [" • "]
        ),
      ]
    );
    const html = xmlNodeToHtml(node, { existingIds: new Set(["n20077.1"]) });
    expect((html.match(/id="n20077\.1"/g) || []).length).toBe(1);
  });

  test("renderEntryResult includes entry outline when senses exist", () => {
    const entryResult: EntryResult = {
      entry: '<span class="lsOrth">habeo</span>',
      outline: {
        mainKey: "habeo",
        mainSection: {
          text: "habeo",
          level: 0,
          ordinal: "",
          sectionId: "n20077",
        },
        senses: [
          {
            text: "In general",
            level: 1,
            ordinal: "I.",
            sectionId: "n20077.1",
          },
          {
            text: "Of personal subjects",
            level: 2,
            ordinal: "A.",
            sectionId: "n20077.2",
          },
        ],
      },
    };

    const rendered = renderEntryResult(entryResult);
    expect(rendered).toContain('class="entry-tools"');
    expect(rendered).toContain("Outline");
    expect(rendered).toContain('href="#n20077.1"');
    expect(rendered).toContain("I.");
    expect(rendered).toContain("In general");
    // Level 1 sense has no extra margin-left indent
    expect(rendered).toContain(
      '<li><a href="#n20077.1" class="toc-link"><strong class="toc-ordinal">I.</strong> In general</a></li>'
    );
    // Level 2 sense has margin-left: 0.75rem
    expect(rendered).toContain('href="#n20077.2"');
    expect(rendered).toContain('style="margin-left: 0.75rem;"');
  });

  test("renderDictPageHtml handles isIdSearch", () => {
    const pageHtml = renderDictPageHtml({
      query: "n20077",
      isIdSearch: true,
    });
    expect(pageHtml).toContain("<title>ID n20077 - Morcus Dictionary</title>");
    // Search input should have empty value for ID search so user can type a fresh search
    expect(pageHtml).toContain('value=""');
  });

  test("renderDictPageHtml preserves macra and breves in title and search input", () => {
    const pageHtml = renderDictPageHtml({
      query: "hăbēna",
    });
    expect(pageHtml).toContain("<title>hăbēna - Morcus Dictionary</title>");
    expect(pageHtml).not.toContain("&#x103;");
    expect(pageHtml).not.toContain("&#x113;");
    expect(pageHtml).toContain('value="hăbēna"');
  });

  test("xmlNodeToHtml formats Gesner entries inline without unintended divs", () => {
    const gesnerEntry = new XmlNode(
      "div",
      [["id", "gesner_caballvs_0"]],
      [
        new XmlNode(
          "def",
          [],
          [
            new XmlNode("emph", [], ["CABALLVS"]),
            ", i. m. [",
            new XmlNode("foreign", [["lang", "GR"]], ["ἵππος ἐργάτης"]),
            "] ",
            new XmlNode("hi", [["rend", "italic"]], ["Equus,"]),
            " a cauando dictus, ",
            new XmlNode("hi", [["rend", "italic"]], ["si credimus"]),
            " Isidoro 12, 1 ",
            new XmlNode(
              "a",
              [
                [
                  "href",
                  "https://mateo.uni-mannheim.de/camenaref/gesner/gesner1/v1/jpg/s0665.html",
                ],
              ],
              ["[…]"]
            ),
          ]
        ),
      ]
    );

    const html = xmlNodeToHtml(gesnerEntry);

    // Emph becomes <b class="lsEmph"> and is not self-linkified
    expect(html).toContain('<b class="lsEmph">CABALLVS</b>');
    expect(html).not.toContain('href="/dicts?q=CABALLVS"');

    // Foreign with lang="GR" becomes <span lang="el"> and Greek text is preserved (decoded)
    expect(html).toContain('<span lang="el">');
    expect(html).toContain('<span lang="el">ἵππος ἐργάτης</span>');
    expect(he.decode(html)).toContain('<span lang="el">ἵππος ἐργάτης</span>');

    // Hi with rend="italic" becomes <i> without word links in default SSR
    expect(html).toContain("<i>Equus,</i>");
    expect(html).toContain("<i>si credimus</i>");

    // Latin words in regular text flow are clean text without word links
    expect(html).not.toContain('href="/dicts?q=cauando"');
    expect(html).toContain("a cauando dictus");

    // Verify no inner divs inside the <def> element (only the root div and def div exist)
    const divCount = (html.match(/<div\b/g) || []).length;
    expect(divCount).toBe(2);
  });

  test("xmlNodeToHtml handles TEI tags corr, unclear, gap, note, pb and cross-reference links", () => {
    const node = new XmlNode(
      "div",
      [],
      [
        new XmlNode("corr", [["sic", "sollennibuus"]], ["sollemnibus"]),
        " ",
        new XmlNode("unclear", [], ["ac...les"]),
        " ",
        new XmlNode("pb", [["n", "19"]], []),
        " ",
        new XmlNode(
          "ref",
          [],
          [new XmlNode("a", [["href", "baetylus"]], ["BAETYLVS"])]
        ),
      ]
    );

    const html = xmlNodeToHtml(node);

    // corr, unclear, pb, ref become <span> inline elements
    expect(html).toContain("<span>sollemnibus</span>");
    expect(html).toContain("<span>ac...les</span>");
    expect(html).toContain("<span></span>");
    expect(html).toContain('href="/dicts?q=baetylus"');
    expect(html).toContain("BAETYLVS</a>");

    // No inner divs inside root
    const divCount = (html.match(/<div\b/g) || []).length;
    expect(divCount).toBe(1);
  });

  test("renderDictResultsHtml renders quick-jump nav and entry headers for multiple entries", () => {
    const results = {
      "L&S": [
        {
          entry: '<span class="lsOrth">cum</span>',
          outline: {
            mainKey: "cum1",
            mainLabel: "1. cum",
            mainSection: {
              text: "cum",
              level: 0,
              ordinal: "",
              sectionId: "n1",
            },
            senses: [],
          },
        },
        {
          entry: '<span class="lsOrth">cum</span>',
          outline: {
            mainKey: "cum2",
            mainLabel: "2. cum",
            mainSection: {
              text: "cum",
              level: 0,
              ordinal: "",
              sectionId: "n2",
            },
            senses: [],
          },
        },
      ],
    };

    const html = renderDictResultsHtml("cum", results);

    // Quick jump bar integrated in header
    expect(html).toContain('class="dict-header dict-header-slim"');
    expect(html).toContain('class="dict-toggle" open');
    expect(html).toContain('class="entry-nav"');
    expect(html).toContain("Jump to");
    expect(html).toContain('href="#n1"');
    expect(html).toContain('href="#n2"');
    expect(html).toContain("cum");
    expect(html).toContain('class="dict-acronym">L&amp;S</span>');
    expect(html).toContain(
      'class="dict-name dict-title">Lewis &amp; Short</span>'
    );
    expect(html).toContain('class="dict-count">(2)</span>');

    // Ensure <summary> does not contain nested interactive elements (links or buttons)
    const summaryMatch = html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
    expect(summaryMatch).toBeTruthy();
    expect(summaryMatch![1]).not.toContain("<a");
    expect(summaryMatch![1]).not.toContain("<button");

    // Entry headers and anchors
    expect(html).toContain('id="n1"');
    expect(html).toContain('id="n2"');
    expect(html).toContain('class="entry-header has-tools"');
    expect(html).toContain('class="entry-headword"');
    expect(html).toContain('href="#n1"');
    expect(html).toContain('href="#n2"');
    // Each entry carries a shareable article permalink.
    expect(html).toContain('href="/dicts/id/n1"');
    expect(html).toContain('href="/dicts/id/n2"');
    expect(html).not.toContain("Entry 1 of 2");
  });

  test("renderDictResultsHtml omits quick-jump nav but still gives a lone tool-less entry a permalink header", () => {
    const results = {
      "L&S": [
        {
          entry: '<span class="lsOrth">habeo</span>',
          outline: {
            mainKey: "habeo",
            mainSection: {
              text: "habeo",
              level: 0,
              ordinal: "",
              sectionId: "n0",
            },
            senses: [],
          },
        },
      ],
    };

    const html = renderDictResultsHtml("habeo", results);

    expect(html).not.toContain('class="entry-nav"');
    expect(html).not.toContain("Entry 1 of 1");
    // Article still has anchor id from sectionId
    expect(html).toContain('id="n0"');
    // Entries with no outline and no inflections (Riddle & Arnold, Numerals)
    // still render an entry header with a permalink.
    expect(html).toContain('class="entry-header has-tools"');
    expect(html).toContain('href="/dicts/id/n0"');
    expect(html).not.toContain("Outline");
    expect(html).not.toContain('class="entry-inflections"');
  });

  test("renderEntryResult renders prominent headword heading and avoids duplicate root id", () => {
    const entryResult: EntryResult = {
      entry: xmlNodeToHtml(
        new XmlNode(
          "div",
          [["id", "n20077"]],
          [new XmlNode("span", [["class", "lsOrth"]], ["habeo"])]
        ),
        { omitRootId: true }
      ),
      outline: {
        mainKey: "habeo",
        mainSection: {
          text: "habeo",
          level: 0,
          ordinal: "",
          sectionId: "n20077",
        },
        senses: [
          { text: "Hold", level: 1, ordinal: "I.", sectionId: "n20077.1" },
        ],
      },
    };
    const rendered = renderEntryResult(entryResult);
    expect(rendered).toContain('class="entry-headword"');
    // The headword is inert text now; the permalink lives in the copy pill.
    expect(rendered).not.toContain('href="#n20077"');
    expect(rendered).toContain('href="/dicts/id/n20077"');
    expect(rendered).toContain('<article class="entry has-tools" id="n20077">');
    // Root id="n20077" is omitted from inner div to prevent duplicate IDs in DOM
    const idCount = (rendered.match(/id="n20077"/g) || []).length;
    expect(idCount).toBe(1);
    expect(rendered).toContain("habeo");
  });

  test("renderEntryResult defensively strips HTML tags from headword", () => {
    const entryResult: EntryResult = {
      entry: "<div>dog content</div>",
      outline: {
        mainKey: "dog",
        mainLabel: "dog (<i>subs.</i>)",
        mainSection: {
          text: " <b>dog</b> (<i>subs.</i>)",
          level: 0,
          ordinal: "0",
          sectionId: "sh7671",
        },
      },
    };
    const rendered = renderEntryResult(entryResult);
    expect(rendered).toContain(
      '<span class="entry-headword-text">dog (subs.)</span>'
    );
    expect(rendered).not.toContain("&lt;i&gt;");
    expect(rendered).not.toContain("&#x3C;i&#x3E;");
  });

  test("xmlNodeToHtml adds tabindex=0 and preserves title on expandable abbreviations", () => {
    const abbrNode = new XmlNode(
      "span",
      [
        ["class", "lsHover lsAuthor"],
        ["title", "M. Tullius Cicero, orator and philosopher, obiit B.C. 43"],
      ],
      ["Cic."]
    );
    const html = xmlNodeToHtml(abbrNode);
    expect(html).toContain('class="lsHover lsAuthor"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain(
      'title="M. Tullius Cicero, orator and philosopher, obiit B.C. 43"'
    );
    expect(html).toContain("Cic.");
  });

  test("renderDictPageHtml includes the single global #abbr-popover element", () => {
    const pageHtml = renderDictPageHtml({ query: "habeo" });
    // "manual": abbr_popover.client.ts owns dismissal (see page_shell.server.ts).
    expect(pageHtml).toContain(
      '<div id="abbr-popover" popover="manual" class="abbr-popover"></div>'
    );
  });

  test("renderDictResultsHtml renders zero-hit pill when dictionary in queriedDicts has no results", () => {
    const results = {
      "L&S": [
        {
          entry: '<span class="lsOrth">habeo</span>',
          outline: {
            mainKey: "habeo",
            mainSection: {
              text: "habeo",
              level: 0,
              ordinal: "",
              sectionId: "n0",
            },
            senses: [],
          },
        },
      ],
      GRG: [
        {
          entry: '<span class="grgOrth">habeo</span>',
          outline: {
            mainKey: "habeo",
            mainSection: {
              text: "habeo",
              level: 0,
              ordinal: "",
              sectionId: "g0",
            },
            senses: [],
          },
        },
      ],
    };

    // Pass queriedDicts with GAF (0 hits) before L&S (1 hit) and GRG (1 hit)
    const html = renderDictResultsHtml("habeo", results, {
      queriedDicts: ["GAF", "GRG", "L&S"],
    });
    // L&S and GRG have 1 hit -> prioritized before GAF
    const lAndSIndex = html.indexOf('href="#dict-L-S"');
    const gafIndex = html.indexOf("No entries found in Gaffiot");
    expect(lAndSIndex).toBeGreaterThan(-1);
    expect(gafIndex).toBeGreaterThan(-1);
    expect(lAndSIndex).toBeLessThan(gafIndex);

    expect(html).toContain('<span class="jump-pill-count">1</span>');
    expect(html).toContain('class="jump-pill jump-pill-zero"');
    expect(html).toContain('<span class="jump-pill-count">0</span>');
  });

  test("renderDictResultsHtml omits jump bar when hitKeys <= 1", () => {
    const results = {
      "L&S": [
        {
          entry: '<span class="lsOrth">habeo</span>',
          outline: {
            mainKey: "habeo",
            mainSection: {
              text: "habeo",
              level: 0,
              ordinal: "",
              sectionId: "n0",
            },
            senses: [],
          },
        },
      ],
    };
    const html = renderDictResultsHtml("habeo", results, {
      queriedDicts: ["GAF", "L&S"],
    });
    expect(html).not.toContain('class="results-nav"');
  });

  test("xmlNodeToHtml renders forcNewTab as an action button with external icon", () => {
    const node = new XmlNode(
      "a",
      [
        ["class", "forcNewTab"],
        ["href", "http://lexica.linguax.com/forc2.php?searchedLG=habeo"],
        ["target", "_blank"],
      ],
      ["habeo"]
    );

    const html = xmlNodeToHtml(node);
    expect(html).toContain('class="forcNewTab action-btn forc-action-btn"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('role="button"');
    expect(html).toContain(
      'title="Open full entry on lexica.linguax.com in new tab"'
    );
    expect(html).toContain(
      '<span class="action-btn-icon" aria-hidden="true">&#x2197;</span>'
    );
    expect(html).toContain(
      '<span class="action-btn-text">Open in new tab (habeo)</span>'
    );
  });

  test("xmlNodeToHtml renders Mateo page scan link with toggleable inline iframe embed", () => {
    const node = new XmlNode(
      "a",
      [
        [
          "href",
          "https://mateo.uni-mannheim.de/camenaref/gesner/gesner1/v1/jpg/s0665.html",
        ],
      ],
      ["[…]"]
    );

    const html = xmlNodeToHtml(node);
    expect(html).toContain('class="mateo-wrapper"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(
      'title="View scanned page on mateo.uni-mannheim.de"'
    );
    expect(html).toContain('class="mateo-embed-pane" data-js-only');
    expect(html).toContain('class="action-btn mateo-toggle-btn"');
    expect(html).toContain('title="Toggle embedded page scan"');
    expect(html).toContain("Page Scan");
    expect(html).toContain(
      'data-deferred-src="https://mateo.uni-mannheim.de/camenaref/gesner/gesner1/v1/jpg/s0665.html"'
    );
    expect(html).toContain('class="mateo-frame"');
    expect(html).toContain('title="Scanned page from mateo.uni-mannheim.de"');
    expect(html).toContain('referrerpolicy="no-referrer"');
  });

  test("xmlNodeToHtml does not give the Mateo iframe an eager src", () => {
    // The point of the whole data-deferred-src dance: no third-party request may be
    // issued for a plate the reader has not asked to see. An iframe with a
    // real `src` is fetched during parse regardless of the <details> state.
    const node = new XmlNode(
      "a",
      [
        [
          "href",
          "https://mateo.uni-mannheim.de/camenaref/gesner/gesner1/v1/jpg/s0665.html",
        ],
      ],
      ["[…]"]
    );

    const html = xmlNodeToHtml(node);
    expect(html).not.toMatch(/<iframe[^>]*\ssrc=/);
  });

  test("renderDictResultsHtml wraps results in results-layout with TOC when senses exceed threshold", () => {
    const results = {
      "L&S": [
        {
          entry: "<div>habeo</div>",
          outline: {
            mainKey: "habeo",
            mainSection: {
              text: "habeo",
              level: 0,
              ordinal: "",
              sectionId: "n100",
            },
            senses: [
              {
                level: 1,
                ordinal: "I.",
                text: "To have, hold",
                sectionId: "n100.1",
              },
              {
                level: 1,
                ordinal: "II.",
                text: "In partic.",
                sectionId: "n100.2",
              },
              {
                level: 2,
                ordinal: "A.",
                text: "With physical object",
                sectionId: "n100.3",
              },
            ],
          },
        },
      ],
    };

    const html = renderDictResultsHtml("habeo", results);
    expect(html).toContain('class="results-layout has-toc"');
    expect(html).toContain("<morcus-dict-toc");
    expect(html).toContain('class="results-main"');
  });

  test("renderDictResultsHtml wraps results in results-layout without has-toc when below threshold", () => {
    const results = {
      "L&S": [
        {
          entry: "<div>abbas</div>",
          outline: {
            mainKey: "abbas",
            mainSection: {
              text: "abbas",
              level: 0,
              ordinal: "",
              sectionId: "n200",
            },
            senses: [
              { level: 1, ordinal: "I.", text: "Abbot", sectionId: "n200.1" },
            ],
          },
        },
      ],
    };

    const html = renderDictResultsHtml("abbas", results);
    expect(html).toContain('class="results-layout"');
    expect(html).not.toContain("has-toc");
    expect(html).not.toContain("<morcus-dict-toc");
    expect(html).toContain('class="results-main"');
  });

  test("renderDictResultsHtml enables TOC with entries summary when multiple entries exist across lexica", () => {
    const results = {
      "L&S": [
        {
          entry: "<div>canis</div>",
          outline: {
            mainKey: "canis",
            mainSection: {
              text: "canis",
              level: 0,
              ordinal: "",
              sectionId: "n200",
            },
            senses: [
              { level: 1, ordinal: "I.", text: "Dog", sectionId: "n200.1" },
            ],
          },
        },
      ],
      GAF: [
        {
          entry: "<div>canis</div>",
          outline: {
            mainKey: "canis",
            mainSection: {
              text: "canis",
              level: 0,
              ordinal: "",
              sectionId: "g300",
            },
            senses: [
              { level: 1, ordinal: "1.", text: "Chien", sectionId: "g300.1" },
            ],
          },
        },
      ],
    };

    const html = renderDictResultsHtml("canis", results);
    expect(html).toContain('class="results-layout has-toc"');
    expect(html).toContain("<morcus-dict-toc");
    expect(html).toContain("toc-entries-summary");
    expect(html).toContain('href="#n200" class="toc-entry-chip"');
    expect(html).toContain('href="#g300" class="toc-entry-chip"');
  });

  test("renderDictResultsHtml suppresses TOC when isEmbedded is true", () => {
    const results = {
      "L&S": [
        {
          entry: "<div>canis</div>",
          outline: {
            mainKey: "canis",
            mainSection: {
              text: "canis",
              level: 0,
              ordinal: "",
              sectionId: "n200",
            },
            senses: [
              { level: 1, ordinal: "I.", text: "Dog", sectionId: "n200.1" },
            ],
          },
        },
      ],
      GAF: [
        {
          entry: "<div>canis</div>",
          outline: {
            mainKey: "canis",
            mainSection: {
              text: "canis",
              level: 0,
              ordinal: "",
              sectionId: "g300",
            },
            senses: [
              { level: 1, ordinal: "1.", text: "Chien", sectionId: "g300.1" },
            ],
          },
        },
      ],
    };

    // When isEmbedded is true, TOC must be completely suppressed (fixes drawer-in-a-drawer collision)
    const html = renderDictResultsHtml("canis", results, {
      isEmbedded: true,
    });
    expect(html).not.toContain("has-toc");
    expect(html).not.toContain("<morcus-dict-toc");
    expect(html).not.toContain("drawer-toc");
    expect(html).toContain('class="results-layout"');
    expect(html).toContain('class="results-main"');

    // In embedded mode, entries should carry inline lexicon badges
    expect(html).toContain('class="dict-badge dict-badge-la"');
    expect(html).toContain('title="Lewis &amp; Short">L&amp;S</span>');
    expect(html).toContain('title="Gaffiot">GAF</span>');
  });

  test("renderEntryResult emits tool-outline class on outline details element", () => {
    const entryResult = {
      entry: '<span class="lsOrth">habeo</span>',
      outline: {
        mainKey: "habeo",
        mainSection: {
          text: "habeo",
          level: 0,
          ordinal: "",
          sectionId: "n0",
        },
        senses: [
          { level: 1, ordinal: "I.", text: "To have, hold", sectionId: "n0.1" },
        ],
      },
    };

    const standaloneHtml = renderEntryResult(entryResult);
    expect(standaloneHtml).toContain('class="tool-pane tool-outline"');
    expect(standaloneHtml).not.toContain("dict-badge");

    const embeddedHtml = renderEntryResult(entryResult, 0, 1, 1, {
      dictKey: "L&S",
      dictName: "Lewis & Short",
      dictAcronym: "L&S",
      dictLang: "la",
      isEmbedded: true,
    });
    expect(embeddedHtml).toContain(
      '<span class="dict-badge dict-badge-la" title="Lewis &amp; Short">L&amp;S</span>'
    );
    expect(embeddedHtml).toContain('class="tool-pane tool-outline"');
  });

  test("renderDictPageHtml injects clamped --dict-scale style tag when scale is provided", () => {
    const unscaledHtml = renderDictPageHtml({
      query: "test",
    });
    expect(unscaledHtml).not.toContain("--dict-scale");

    const scaledHtml = renderDictPageHtml({
      query: "test",
      scale: 120,
    });
    expect(scaledHtml).toContain(
      "<style>:root { --dict-scale: 1.20; }</style>"
    );

    // Clamping: max 150
    const maxClamped = renderDictPageHtml({
      query: "test",
      scale: 200,
    });
    expect(maxClamped).toContain(
      "<style>:root { --dict-scale: 1.50; }</style>"
    );

    // Clamping: min 50
    const minClamped = renderDictPageHtml({
      query: "test",
      scale: 40,
    });
    expect(minClamped).toContain(
      "<style>:root { --dict-scale: 0.50; }</style>"
    );
  });

  describe("parseDictScale", () => {
    test("returns parsed number clamped between 50 and 150", () => {
      expect(parseDictScale(100)).toBe(100);
      expect(parseDictScale(93)).toBe(93);
      expect(parseDictScale("130")).toBe(130);
      expect(parseDictScale(40)).toBe(50);
      expect(parseDictScale(200)).toBe(150);
      expect(parseDictScale("45")).toBe(50);
      expect(parseDictScale("160")).toBe(150);
    });

    test("returns undefined for invalid, empty, or undefined input", () => {
      expect(parseDictScale(undefined)).toBeUndefined();
      expect(parseDictScale(null)).toBeUndefined();
      expect(parseDictScale("")).toBeUndefined();
      expect(parseDictScale("abc")).toBeUndefined();
      expect(parseDictScale(NaN)).toBeUndefined();
    });
  });

  describe("resolveDictDisplayName", () => {
    test("resolves canonical keys with proper ampersands and naming", () => {
      expect(resolveDictDisplayName("L&S")).toBe("Lewis & Short");
      expect(resolveDictDisplayName("S&H")).toBe("Smith & Hall");
      expect(resolveDictDisplayName("GAF")).toBe("Gaffiot");
      expect(resolveDictDisplayName("GRG")).toBe("Georges");
      expect(resolveDictDisplayName("EGL")).toBe("Pozo");
      expect(resolveDictDisplayName("GES")).toBe("Gesner");
      expect(resolveDictDisplayName("FOR")).toBe("Forcellini");
      expect(resolveDictDisplayName("R&A")).toBe("Riddle & Arnold");
      expect(resolveDictDisplayName("NUM")).toBe("Latin Numerals");
    });

    test("resolves V1 URL aliases and case-variant keys via findDictInfo", () => {
      expect(resolveDictDisplayName("LnS")).toBe("Lewis & Short");
      expect(resolveDictDisplayName("lns")).toBe("Lewis & Short");
      expect(resolveDictDisplayName("SnH")).toBe("Smith & Hall");
      expect(resolveDictDisplayName("RnA")).toBe("Riddle & Arnold");
      expect(resolveDictDisplayName("gaf")).toBe("Gaffiot");
      expect(resolveDictDisplayName("grg")).toBe("Georges");
      expect(resolveDictDisplayName("num")).toBe("Latin Numerals");
    });

    test("falls back to uppercased key when key is unrecognized", () => {
      expect(resolveDictDisplayName("custom_lexicon")).toBe("CUSTOM_LEXICON");
      expect(resolveDictDisplayName("unknown")).toBe("UNKNOWN");
    });

    test("returns empty string when key is empty", () => {
      expect(resolveDictDisplayName("")).toBe("");
    });
  });

  describe("resolveDictAcronym", () => {
    test("resolves canonical keys", () => {
      expect(resolveDictAcronym("L&S")).toBe("L&S");
      expect(resolveDictAcronym("S&H")).toBe("S&H");
      expect(resolveDictAcronym("GAF")).toBe("GAF");
      expect(resolveDictAcronym("GRG")).toBe("GRG");
      expect(resolveDictAcronym("EGL")).toBe("EGL");
      expect(resolveDictAcronym("GES")).toBe("GES");
      expect(resolveDictAcronym("FOR")).toBe("FOR");
      expect(resolveDictAcronym("R&A")).toBe("R&A");
      expect(resolveDictAcronym("NUM")).toBe("NUM");
    });

    test("resolves V1 URL aliases and case-variant keys to canonical acronyms", () => {
      expect(resolveDictAcronym("LnS")).toBe("L&S");
      expect(resolveDictAcronym("lns")).toBe("L&S");
      expect(resolveDictAcronym("SnH")).toBe("S&H");
      expect(resolveDictAcronym("RnA")).toBe("R&A");
      expect(resolveDictAcronym("gaf")).toBe("GAF");
      expect(resolveDictAcronym("grg")).toBe("GRG");
    });

    test("falls back to uppercased key for unknown keys", () => {
      expect(resolveDictAcronym("my_dict")).toBe("MY_DICT");
      expect(resolveDictAcronym("")).toBe("");
    });
  });

  describe("dictCardId", () => {
    test("computes sanitized card IDs matching anchor links", () => {
      expect(dictCardId("L&S")).toBe("dict-L-S");
      expect(dictCardId("S&H")).toBe("dict-S-H");
      expect(dictCardId("GAF")).toBe("dict-GAF");
      expect(dictCardId("R&A")).toBe("dict-R-A");
      expect(dictCardId("custom/lexicon:1")).toBe("dict-custom-lexicon-1");
    });
  });

  describe("resolveDictLang", () => {
    test("resolves Latin and English dictionaries to their source language", () => {
      expect(resolveDictLang("L&S")).toBe("la");
      expect(resolveDictLang("GAF")).toBe("la");
      expect(resolveDictLang("S&H")).toBe("en");
      expect(resolveDictLang("GRG")).toBe("de");
    });

    test("resolves unrecognized dictionaries to default la", () => {
      expect(resolveDictLang("unknown_dict")).toBe("la");
    });
  });

  describe("decomposed dict results renderers", () => {
    describe("renderNoResultsHtml", () => {
      test("renders generic no results container and escapes query", () => {
        const html = renderNoResultsHtml('<script>alert("xss")</script>');
        expect(html).toContain('class="no-results"');
        expect(html).toContain("No results found for");
        expect(html).not.toContain("<script>");
        expect(html).toContain(
          "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
        );
      });
    });

    describe("renderNoEntriesHtml", () => {
      test("renders zero-hit notice with searched lexica names", () => {
        const html = renderNoEntriesHtml({
          query: "ignotus",
          queriedDicts: ["L&S", "GAF"],
          isInflected: true,
        });
        expect(html).toContain("No dictionary entries found for");
        expect(html).toContain("ignotus");
        expect(html).toContain("Searched: Lewis &amp; Short, Gaffiot");
        expect(html).not.toContain("Exact headword search is active.");
      });

      test("renders inflected search guidance when isInflected is false", () => {
        const html = renderNoEntriesHtml({
          query: "amavi",
          queriedDicts: ["L&S"],
          isInflected: false,
        });
        expect(html).toContain("Exact headword search is active.");
        expect(html).toContain("Enable inflected search");
        expect(html).toContain('/dicts?q=amavi&amp;d=1&amp;o=1"');
      });

      test("handles empty queriedDicts gracefully", () => {
        const html = renderNoEntriesHtml({
          query: "test",
          queriedDicts: [],
        });
        expect(html).toContain("No dictionary entries found for");
        expect(html).not.toContain("Searched:");
      });
    });

    describe("renderJumpNavHtml", () => {
      test("returns empty string when 1 or fewer dictionaries have hits", () => {
        const results = {
          "L&S": [
            {
              entry: "<span>amo</span>",
              outline: {
                mainKey: "amo",
                mainSection: {
                  text: "amo",
                  level: 0,
                  ordinal: "",
                  sectionId: "n1",
                },
              },
            },
          ],
        };
        expect(
          renderJumpNavHtml({
            results,
            hitKeys: ["L&S"],
            allQueriedKeys: ["L&S", "GAF"],
          })
        ).toBe("");
      });

      test("renders jump pills and sorts hit lexica before zero-hit lexica", () => {
        const results = {
          "L&S": [
            {
              entry: "<span>habeo</span>",
              outline: {
                mainKey: "habeo",
                mainSection: {
                  text: "habeo",
                  level: 0,
                  ordinal: "",
                  sectionId: "n1",
                },
              },
            },
          ],
          GRG: [
            {
              entry: "<span>habeo</span>",
              outline: {
                mainKey: "habeo",
                mainSection: {
                  text: "habeo",
                  level: 0,
                  ordinal: "",
                  sectionId: "g1",
                },
              },
            },
          ],
        };

        const html = renderJumpNavHtml({
          results,
          hitKeys: ["L&S", "GRG"],
          allQueriedKeys: ["GAF", "GRG", "L&S"],
        });

        expect(html).toContain('class="results-nav"');
        expect(html).toContain('aria-label="Jump to dictionary"');
        expect(html).toContain("2 results");

        const lAndSIndex = html.indexOf('href="#dict-L-S"');
        const grgIndex = html.indexOf('href="#dict-GRG"');
        const gafIndex = html.indexOf("No entries found in Gaffiot");

        expect(lAndSIndex).toBeGreaterThan(-1);
        expect(grgIndex).toBeGreaterThan(-1);
        expect(gafIndex).toBeGreaterThan(-1);
        expect(grgIndex).toBeLessThan(gafIndex);
        expect(lAndSIndex).toBeLessThan(gafIndex);
        expect(html).toContain('class="jump-pill jump-pill-zero"');
      });

      test("formats total results counter correctly", () => {
        const results = {
          "L&S": [
            {
              entry: "<span>amo</span>",
              outline: {
                mainKey: "amo",
                mainSection: {
                  text: "amo",
                  level: 0,
                  ordinal: "",
                  sectionId: "n1",
                },
              },
            },
          ],
          GRG: [
            {
              entry: "<span>amo2</span>",
              outline: {
                mainKey: "amo2",
                mainSection: {
                  text: "amo2",
                  level: 0,
                  ordinal: "",
                  sectionId: "g1",
                },
              },
            },
          ],
        };
        const html = renderJumpNavHtml({
          results,
          hitKeys: ["L&S", "GRG"],
          allQueriedKeys: ["L&S", "GRG"],
        });
        expect(html).toContain("2 results");
      });
    });

    describe("renderDictCardHtml", () => {
      test("renders single entry card without quick-jump nav", () => {
        const entries: EntryResult[] = [
          {
            entry: "<span>habeo</span>",
            outline: {
              mainKey: "habeo",
              mainSection: {
                text: "habeo",
                level: 0,
                ordinal: "",
                sectionId: "n100",
              },
              senses: [],
            },
          },
        ];

        const html = renderDictCardHtml({
          dictKey: "L&S",
          entries,
        });

        expect(html).toContain('<section class="dict-card" id="dict-L-S">');
        expect(html).toContain('class="dict-acronym">L&amp;S</span>');
        expect(html).toContain(
          'class="dict-name dict-title">Lewis &amp; Short</span>'
        );
        expect(html).toContain('class="dict-count">(1)</span>');
        expect(html).not.toContain('class="entry-nav"');
        expect(html).toContain('id="n100"');
        expect(html).toContain('class="dict-source-pane"');
        expect(html).toContain("Perseus Digital Library");
      });

      test("renders multi-entry card with quick-jump nav links", () => {
        const entries: EntryResult[] = [
          {
            entry: "<span>cum 1</span>",
            outline: {
              mainKey: "cum1",
              mainLabel: "1. cum",
              mainSection: {
                text: "cum",
                level: 0,
                ordinal: "",
                sectionId: "n1",
              },
              senses: [],
            },
          },
          {
            entry: "<span>cum 2</span>",
            outline: {
              mainKey: "cum2",
              mainLabel: "2. cum",
              mainSection: {
                text: "cum",
                level: 0,
                ordinal: "",
                sectionId: "n2",
              },
              senses: [],
            },
          },
        ];

        const html = renderDictCardHtml({
          dictKey: "L&S",
          entries,
        });

        expect(html).toContain('class="entry-nav"');
        expect(html).toContain("Jump to");
        expect(html).toContain('href="#n1"');
        expect(html).toContain('href="#n2"');
        expect(html).toContain('class="dict-count">(2)</span>');
      });

      test("omits source attribution when key lacks attribution info", () => {
        const entries: EntryResult[] = [
          {
            entry: "<span>custom</span>",
            outline: {
              mainKey: "custom",
              mainSection: {
                text: "custom",
                level: 0,
                ordinal: "",
                sectionId: "c1",
              },
              senses: [],
            },
          },
        ];

        const html = renderDictCardHtml({
          dictKey: "UNKNOWN_KEY",
          entries,
        });

        expect(html).not.toContain('class="dict-source-pane"');
      });
    });
  });
});

describe("focus= (picked suggestion's language)", () => {
  function entry(word: string, sectionId: string): EntryResult {
    return {
      entry: `<span class="lsOrth">${word}</span>`,
      outline: {
        mainKey: word,
        mainSection: { text: word, level: 0, ordinal: "", sectionId },
        senses: [],
      },
    };
  }

  // Latin -> English first in the response, as the fused lookup returns them.
  const results = {
    "L&S": [entry("ago", "n1")],
    GAF: [entry("ago", "g1")],
    "S&H": [entry("ago", "s1")],
  };
  const queriedDicts = ["L&S", "GAF", "S&H"];

  function cardOpenAttr(html: string, dictKey: string): boolean {
    const card = html.indexOf(`id="${dictCardId(dictKey)}"`);
    expect(card).toBeGreaterThan(-1);
    const toggle = html
      .slice(card)
      .match(/<details class="dict-toggle"( open)?>/);
    expect(toggle).not.toBeNull();
    return toggle![1] !== undefined;
  }

  test("lists the focused language's dictionaries first and collapses the rest", () => {
    const html = renderDictResultsHtml("ago", results, {
      queriedDicts,
      focusLang: "En",
    });

    const sh = html.indexOf(
      `<section class="dict-card" id="${dictCardId("S&H")}"`
    );
    const ls = html.indexOf(
      `<section class="dict-card" id="${dictCardId("L&S")}"`
    );
    const gaf = html.indexOf(
      `<section class="dict-card" id="${dictCardId("GAF")}"`
    );
    expect(sh).toBeGreaterThan(-1);
    expect(sh).toBeLessThan(ls);
    // Everything else keeps its relative order.
    expect(ls).toBeLessThan(gaf);

    expect(cardOpenAttr(html, "S&H")).toBe(true);
    expect(cardOpenAttr(html, "L&S")).toBe(false);
    expect(cardOpenAttr(html, "GAF")).toBe(false);
  });

  test("orders the jump pills the same way", () => {
    const html = renderDictResultsHtml("ago", results, {
      queriedDicts,
      focusLang: "En",
    });
    const shPill = html.indexOf(
      `href="#${dictCardId("S&H")}" class="jump-pill"`
    );
    const lsPill = html.indexOf(
      `href="#${dictCardId("L&S")}" class="jump-pill"`
    );
    expect(shPill).toBeGreaterThan(-1);
    expect(shPill).toBeLessThan(lsPill);
  });

  test("without focus, nothing is reordered or collapsed", () => {
    const html = renderDictResultsHtml("ago", results, { queriedDicts });
    expect(html.indexOf(`id="${dictCardId("L&S")}"`)).toBeLessThan(
      html.indexOf(`id="${dictCardId("S&H")}"`)
    );
    for (const key of queriedDicts) {
      expect(cardOpenAttr(html, key)).toBe(true);
    }
  });

  test("is ignored when no dictionary in the focused language has results", () => {
    const html = renderDictResultsHtml("ago", results, {
      queriedDicts,
      focusLang: "De",
    });
    expect(html.indexOf(`id="${dictCardId("L&S")}"`)).toBeLessThan(
      html.indexOf(`id="${dictCardId("S&H")}"`)
    );
    for (const key of queriedDicts) {
      expect(cardOpenAttr(html, key)).toBe(true);
    }
  });

  test("the full page passes focus through to the results", () => {
    const html = renderDictPageHtml({
      query: "ago",
      results,
      queriedDicts,
      focusLang: "En",
    });
    expect(cardOpenAttr(html, "S&H")).toBe(true);
    expect(cardOpenAttr(html, "L&S")).toBe(false);
  });
});
