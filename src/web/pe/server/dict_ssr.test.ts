import {
  xmlNodeToHtml,
  renderEntryResult,
  renderDictResultsHtml,
  renderDictPageHtml,
} from "@/web/pe/server/dict_ssr";
import { XmlNode } from "@/common/xml/xml_node";
import { EntryResult } from "@/common/dictionaries/dict_result";

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
    expect(rendered).toContain("Morphological Inflections (1)");
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
      '<link rel="stylesheet" href="/pe/assets/pe.css">'
    );
    expect(pageHtml).toContain(
      '<script type="module" src="/pe/assets/pe.js"></script>'
    );
    expect(pageHtml).toContain(
      '<form class="pe-search-form" action="/pe/dicts" method="GET">'
    );
    expect(pageHtml).toContain("<morcus-dict-search>");
  });
});
