import {
  renderReaderContentHtml,
  renderReaderPageHtml,
} from "@/web/v2/server/reader_ssr";
import { XmlNode } from "@/common/xml/xml_node";

jest.mock("@/web/v2/server/asset_manifest", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--v2-bg)}",
}));

describe("reader_ssr", () => {
  test("renderReaderContentHtml without query displays empty state and linkified Latin text", () => {
    const html = renderReaderContentHtml();

    // Contains custom element container
    expect(html).toContain("<morcus-reader-view");
    expect(html).toContain("v2-reader-view");

    // Author and Work headers
    expect(html).toContain("C. Iulius Caesar");
    expect(html).toContain("De Bello Gallico");

    // Empty state instructions in dictionary panel
    expect(html).toContain("v2-reader-empty-state");
    expect(html).toContain("Select a word to view definitions");

    // Contains sample Latin words as clickable hyperlinks
    expect(html).toContain('href="/v2/reader?q=Gallia#v2-reader-dict"');
    expect(html).toContain('class="v2-lat-word"');
    expect(html).toContain("Gallia");
    expect(html).toContain("Belgae");
    expect(html).not.toContain("v2-word-active");
  });

  test("renderReaderContentHtml with query highlights active word and renders dictionary cards", () => {
    const mockResults = {
      ls: [
        {
          entry: new XmlNode("span", [["class", "lsOrth"]], ["divisa"]),
          outline: {
            mainKey: "divisa",
            mainSection: {
              text: "divisa",
              level: 0,
              ordinal: "",
              sectionId: "0",
            },
            senses: [],
          },
        },
      ],
    };

    const html = renderReaderContentHtml({
      query: "divisa",
      results: mockResults as any,
    });

    // Active word highlighted
    expect(html).toContain('class="v2-lat-word v2-word-active"');
    expect(html).not.toContain("Embedded Dictionary");
    expect(html).toContain('value="divisa"');
    expect(html).toContain("<morcus-dict-settings>");

    // Dictionary results rendered in output container
    expect(html).toContain("v2-dict-card");
    expect(html).toContain("Lewis &#x26; Short");

    // Close button present in mobile sheet handle bar
    expect(html).toContain("v2-reader-sheet-close");
    expect(html).not.toContain("Full dictionary &nearr;");
  });

  test("renderReaderPageHtml produces valid full HTML page with active Reader nav item", () => {
    const pageHtml = renderReaderPageHtml({ query: "Gallia" });

    expect(pageHtml).toContain("<!DOCTYPE html>");
    expect(pageHtml).toContain(
      "<title>Gallia - Latin Reader - Morcus Latin Tools</title>"
    );
    expect(pageHtml).toContain('<header class="v2-app-bar">');
    expect(pageHtml).toContain('href="/v2/reader"');
    expect(pageHtml).toContain('class="v2-nav-link active"');
    expect(pageHtml).toContain('aria-current="page"');
    expect(pageHtml).toContain("morcus-reader-view");
  });
});
