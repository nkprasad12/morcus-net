import {
  xmlNodeToHtml,
  renderEntryResult,
  renderDictResultsHtml,
  renderDictPageHtml,
  formatInflectionForm,
} from "@/web/v2/dict/dict.server";
import { XmlNode } from "@/common/xml/xml_node";
import { EntryResult } from "@/common/dictionaries/dict_result";
import he from "he";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--v2-bg)}",
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

    const html = xmlNodeToHtml(node, { allowLinkify: false });
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
    expect(html).toBe('<a class="dLink" href="/v2/dicts?q=regia">regia</a>');
  });

  test("xmlNodeToHtml handles void tags like br", () => {
    const node = new XmlNode(
      "div",
      [],
      ["first line", new XmlNode("br"), "second line"]
    );
    const html = xmlNodeToHtml(node, { allowLinkify: false });
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

    const html = xmlNodeToHtml(node, { allowLinkify: false });
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

  test("renderEntryResult formats entry and inflections without Lemma/Notes columns and without bold Form", () => {
    const entryResult: EntryResult = {
      entry: new XmlNode("span", [["class", "lsOrth"]], ["amo"]),
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
      ],
    };

    const rendered = renderEntryResult(entryResult);
    expect(rendered).toContain('<span class="lsOrth">amo</span>');
    expect(rendered).toContain("Inflections");
    expect(rendered).toContain("<th>Form</th><th>Analysis</th>");
    expect(rendered).not.toContain("<th>Lemma</th>");
    expect(rendered).not.toContain("<th>Notes</th>");
    // Form is not wrapped in <strong>
    expect(rendered).toContain("<td>ămāvēre</td>");
    expect(rendered).not.toContain("<strong>ămāvēre</strong>");
    // Usage note is displayed inline in analysis
    expect(rendered).toContain(
      '<td>3rd pl perf act ind <span class="v2-usage-note">(poetic)</span></td>'
    );
  });

  test("renderDictResultsHtml handles empty query", () => {
    const html = renderDictResultsHtml("");
    expect(html).toContain("Type a word");
  });

  test("renderDictResultsHtml handles no results", () => {
    const html = renderDictResultsHtml("nonexistent", {});
    expect(html).toContain("No dictionary entries found for");
  });

  test("renderDictResultsHtml renders dictionary cards", () => {
    const results = {
      ls: [
        {
          entry: new XmlNode("span", [["class", "lsOrth"]], ["Caesar"]),
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
      "<style>body{background-color:var(--v2-bg)}</style>"
    );
    expect(pageHtml).toContain(
      '<link rel="stylesheet" href="/v2/assets/v2.css">'
    );
    expect(pageHtml).toContain(
      '<script type="module" src="/v2/assets/v2.js"></script>'
    );
    expect(pageHtml).toContain(
      '<form class="v2-search-form" action="/v2/dicts" method="GET">'
    );
    expect(pageHtml).toContain("<morcus-dict-search>");
    expect(pageHtml).toContain("<morcus-dict-settings>");
    expect(pageHtml).toContain('<div id="top"></div>');
    expect(pageHtml).toContain('class="v2-back-to-top"');
    expect(pageHtml).toContain('href="#top"');
  });

  test("xmlNodeToHtml renders text without word links in default No-JS/SSR mode", () => {
    const node = new XmlNode(
      "span",
      [["class", "lsQuote"]],
      ["Gallia est omnis"]
    );
    const html = xmlNodeToHtml(node);
    expect(html).not.toContain('href="/v2/dicts?q=Gallia"');
    expect(html).not.toContain('class="v2-lat-word"');
    expect(html).toContain("Gallia est omnis");
  });

  test("xmlNodeToHtml supports explicit allowLinkify option", () => {
    const node = new XmlNode(
      "span",
      [["class", "lsQuote"]],
      ["Gallia est omnis"]
    );
    const html = xmlNodeToHtml(node, { allowLinkify: true });
    expect(html).toContain('href="/v2/dicts?q=Gallia"');
    expect(html).toContain('href="/v2/dicts?q=est"');
    expect(html).toContain('href="/v2/dicts?q=omnis"');
    expect(html).toContain('class="v2-lat-word"');
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
    expect(html).toContain('class="lsSenseBullet v2-section-anchor"');
    expect(html).toContain('title="Direct link to this section"');
    expect(html).toContain("&#x2022;");
    expect(html).toContain("</a>");
  });

  test("renderEntryResult includes entry outline when senses exist", () => {
    const entryResult: EntryResult = {
      entry: new XmlNode("span", [["class", "lsOrth"]], ["habeo"]),
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
    expect(rendered).toContain('class="v2-entry-tools"');
    expect(rendered).toContain("Outline");
    expect(rendered).toContain('href="#n20077.1"');
    expect(rendered).toContain("I.");
    expect(rendered).toContain("In general");
    // Level 1 sense has no extra margin-left indent
    expect(rendered).toContain(
      '<li><a href="#n20077.1" class="v2-toc-link"><strong class="v2-toc-ordinal">I.</strong> In general</a></li>'
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
    expect(html).not.toContain('href="/v2/dicts?q=CABALLVS"');

    // Foreign with lang="GR" becomes <span lang="el"> and Greek text is preserved (decoded)
    expect(html).toContain('<span lang="el">');
    expect(he.decode(html)).toContain('<span lang="el">ἵππος ἐργάτης</span>');

    // Hi with rend="italic" becomes <i> without word links in default SSR
    expect(html).toContain("<i>Equus,</i>");
    expect(html).toContain("<i>si credimus</i>");

    // Latin words in regular text flow are clean text without word links
    expect(html).not.toContain('href="/v2/dicts?q=cauando"');
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

    const html = xmlNodeToHtml(node, { allowLinkify: false });

    // corr, unclear, pb, ref become <span> inline elements
    expect(html).toContain("<span>sollemnibus</span>");
    expect(html).toContain("<span>ac...les</span>");
    expect(html).toContain("<span></span>");
    expect(html).toContain('href="/v2/dicts?q=baetylus"');
    expect(html).toContain("BAETYLVS</a>");

    // No inner divs inside root
    const divCount = (html.match(/<div\b/g) || []).length;
    expect(divCount).toBe(1);
  });

  test("renderDictResultsHtml renders quick-jump nav and entry headers for multiple entries", () => {
    const results = {
      "L&S": [
        {
          entry: new XmlNode("span", [["class", "lsOrth"]], ["cum"]),
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
          entry: new XmlNode("span", [["class", "lsOrth"]], ["cum"]),
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
    expect(html).toContain('class="v2-dict-header"');
    expect(html).toContain('class="v2-dict-toggle" open');
    expect(html).toContain('class="v2-entry-nav"');
    expect(html).toContain("Jump to");
    expect(html).toContain('href="#n1"');
    expect(html).toContain('href="#n2"');
    expect(html).toContain("cum");

    // Ensure <summary> does not contain nested interactive elements (links or buttons)
    const summaryMatch = html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);
    expect(summaryMatch).toBeTruthy();
    expect(summaryMatch![1]).not.toContain("<a");
    expect(summaryMatch![1]).not.toContain("<button");

    // Entry headers and anchors
    expect(html).toContain('id="n1"');
    expect(html).toContain('id="n2"');
    expect(html).toContain('class="v2-entry-header"');
    expect(html).toContain('class="v2-entry-headword"');
    expect(html).toContain('href="#n1"');
    expect(html).toContain('href="#n2"');
    expect(html).not.toContain("Entry 1 of 2");
  });

  test("renderDictResultsHtml omits quick-jump nav and entry headers when only 1 entry exists without tools", () => {
    const results = {
      "L&S": [
        {
          entry: new XmlNode("span", [["class", "lsOrth"]], ["habeo"]),
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

    expect(html).not.toContain('class="v2-entry-nav"');
    expect(html).not.toContain('class="v2-entry-header"');
    expect(html).not.toContain("Entry 1 of 1");
    // Article still has anchor id from sectionId
    expect(html).toContain('id="n0"');
  });

  test("renderEntryResult renders prominent headword heading and avoids duplicate root id", () => {
    const entryResult: EntryResult = {
      entry: new XmlNode(
        "div",
        [["id", "n20077"]],
        [new XmlNode("span", [["class", "lsOrth"]], ["habeo"])]
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
    expect(rendered).toContain('class="v2-entry-headword"');
    expect(rendered).toContain('href="#n20077"');
    expect(rendered).toContain(
      '<article class="v2-entry has-tools" id="n20077">'
    );
    // Root id="n20077" is omitted from inner div to prevent duplicate IDs in DOM
    const idCount = (rendered.match(/id="n20077"/g) || []).length;
    expect(idCount).toBe(1);
    expect(rendered).toContain("habeo");
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

  test("renderDictPageHtml includes the single global #v2-abbr-popover element", () => {
    const pageHtml = renderDictPageHtml({ query: "habeo" });
    expect(pageHtml).toContain(
      '<div id="v2-abbr-popover" popover="auto" class="v2-abbr-popover"></div>'
    );
  });
});
