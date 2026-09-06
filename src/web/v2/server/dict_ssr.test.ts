import {
  xmlNodeToHtml,
  renderEntryResult,
  renderDictResultsHtml,
  renderDictPageHtml,
} from "@/web/v2/server/dict_ssr";
import { XmlNode } from "@/common/xml/xml_node";
import { EntryResult } from "@/common/dictionaries/dict_result";

jest.mock("@/web/v2/server/asset_manifest", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--v2-bg)}",
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

  test("renderEntryResult formats entry and inflections", () => {
    const entryResult: EntryResult = {
      entry: new XmlNode("span", [["class", "lsOrth"]], ["amo"]),
      outline: {
        mainKey: "amo",
        mainSection: { text: "amo", level: 0, ordinal: "", sectionId: "0" },
        senses: [],
      },
      inflections: [
        {
          form: "amo",
          lemma: "amo",
          data: "1st sg pres act ind",
        },
      ],
    };

    const rendered = renderEntryResult(entryResult);
    expect(rendered).toContain('<span class="lsOrth">amo</span>');
    expect(rendered).toContain("Inflections");
    expect(rendered).toContain("<td>amo</td>");
    expect(rendered).toContain("<td>1st sg pres act ind</td>");
  });

  test("renderDictResultsHtml handles empty query", () => {
    const html = renderDictResultsHtml("");
    expect(html).toContain("Type a Latin word");
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
    expect(html).toContain("1 entry");
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
  });

  test("xmlNodeToHtml linkifies Latin words in regular content", () => {
    const node = new XmlNode(
      "span",
      [["class", "lsQuote"]],
      ["Gallia est omnis"]
    );
    const html = xmlNodeToHtml(node);
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
    expect(rendered).toContain('href="#n20077.2"');
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
});
