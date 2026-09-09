import {
  renderReaderContentHtml,
  renderReaderPageHtml,
} from "@/web/v2/reader/reader.server";
import {
  citationToString,
  parseCitationString,
  citationToSemanticLabel,
  getSectionLocalId,
  getSectionPrefix,
  resolveCitationJump,
} from "@/web/v2/reader/reader_types";
import { getReaderWork, getAllReaderWorks } from "@/web/v2/reader/reader_data";
import { XmlNode } from "@/common/xml/xml_node";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--v2-bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

describe("reader_ssr", () => {
  test("renderReaderContentHtml without query displays empty state, breadcrumbs, and linkified Latin text", () => {
    const html = renderReaderContentHtml();

    // Custom element container
    expect(html).toContain("<morcus-reader-view");
    expect(html).toContain("v2-reader-view");

    // Author and Work headers
    expect(html).toContain("C. Iulius Caesar");
    expect(html).toContain("Commentarii de Bello Gallico");
    expect(html).toContain("Liber I, Caput I");

    // Empty state instructions in dictionary panel
    expect(html).toContain("v2-reader-empty-state");
    expect(html).toContain("Select a word to view definitions");

    // Contains Latin words as clickable hyperlinks
    expect(html).toContain("Gallia");
    expect(html).toContain("Belgae");
    expect(html).toContain('class="v2-lat-word"');
    expect(html).not.toContain("v2-word-active");

    // Desktop splitter & mobile sheet handle
    expect(html).toContain('class="v2-reader-splitter"');
    expect(html).toContain('class="v2-reader-sheet-bar"');
  });

  test("renderReaderContentHtml renders gutter markers with separate prefix and local spans for responsive short numbering", () => {
    const html = renderReaderContentHtml({ workId: "dbg", pageId: "1.1" });

    // Section 1.1.1
    expect(html).toContain('id="sec-1.1.1"');
    expect(html).toContain('class="v2-reader-gutter"');
    expect(html).toContain('class="v2-cite-prefix">1.1.</span>');
    expect(html).toContain('class="v2-cite-local">1</span>');
    expect(html).toContain('aria-label="Section 1.1.1"');

    // Section 1.1.2
    expect(html).toContain('id="sec-1.1.2"');
    expect(html).toContain('class="v2-cite-prefix">1.1.</span>');
    expect(html).toContain('class="v2-cite-local">2</span>');

    // Section 1.1.3
    expect(html).toContain('id="sec-1.1.3"');
    expect(html).toContain('class="v2-cite-local">3</span>');
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
    expect(html).toContain('value="divisa"');
    expect(html).toContain("<morcus-dict-settings>");

    // Dictionary results rendered in output container
    expect(html).toContain("v2-dict-card");
    expect(html).toContain("Lewis &#x26; Short");

    // Close button present in mobile sheet handle bar
    expect(html).toContain("v2-reader-sheet-close");
  });

  test("renderReaderContentHtml supports parallel translation view mode", () => {
    const singleHtml = renderReaderContentHtml({ view: "single" });
    expect(singleHtml).not.toContain("v2-section-parallel");
    expect(singleHtml).not.toContain("v2-passage-english");

    const parallelHtml = renderReaderContentHtml({ view: "parallel" });
    expect(parallelHtml).toContain("v2-reader-view-parallel");
    expect(parallelHtml).toContain("v2-section-parallel");
    expect(parallelHtml).toContain("v2-passage-english");
    expect(parallelHtml).toContain("All Gaul is divided into three parts");
  });

  test("renderReaderContentHtml renders Table of Contents drawer and Bibliographical modal", () => {
    const html = renderReaderContentHtml();

    // Table of Contents drawer
    expect(html).toContain('id="v2-reader-toc-drawer"');
    expect(html).toContain('class="v2-reader-toc-drawer"');
    expect(html).toContain('id="v2-reader-toc-filter"');
    expect(html).toContain('class="v2-reader-toc-item active"');
    expect(html).toContain("Liber I, Caput II");

    // Bibliographical Dialog
    expect(html).toContain('id="v2-reader-biblio-dialog"');
    expect(html).toContain("urn:cts:latinLit:phi0448.phi001.perseus-lat2");
    expect(html).toContain("T. Rice Holmes");
    expect(html).toContain("W. A. McDevitte");
  });

  test("renderReaderContentHtml renders sticky navigation bar with essentials and expandable tools", () => {
    const html = renderReaderContentHtml();

    // Primary row: essentials only
    expect(html).toContain('class="v2-reader-sticky-bar"');
    expect(html).toContain('class="v2-sticky-primary-row"');
    expect(html).toContain('id="v2-pager-prev"');
    expect(html).toContain('id="v2-pager-next"');
    expect(html).toContain('class="v2-sticky-author">C. Iulius Caesar</span>');
    expect(html).toContain(
      'class="v2-sticky-work-title">Commentarii de Bello Gallico</span>'
    );
    expect(html).toContain(
      'class="v2-sticky-page-title">Liber I, Caput I</span>'
    );
    expect(html).toContain('class="v2-jump-glyph"');
    expect(html).toContain('value="1.1"');
    expect(html).toContain('id="v2-sticky-expand-btn"');
    expect(html).toContain('aria-expanded="false"');

    // Main text panel header: Author and Work Name, no Book Chapter Section scheme tag
    expect(html).toContain(
      'class="v2-reader-author-tag">C. Iulius Caesar</span>'
    );
    expect(html).toContain(
      'class="v2-reader-work-tag">Commentarii de Bello Gallico</span>'
    );
    expect(html).not.toContain("v2-reader-scheme-tag");

    // Secondary row: expanded tools (hidden by default)
    expect(html).toContain(
      'class="v2-sticky-expanded-row" id="v2-sticky-expanded-row" hidden'
    );
    expect(html).toContain('id="v2-reader-toc-btn"');
    expect(html).toContain('id="v2-mode-single"');
    expect(html).toContain('id="v2-mode-parallel"');
    expect(html).toContain('id="v2-reader-settings-btn"');
    expect(html).toContain('id="v2-reader-info-btn"');

    // Settings dialog
    expect(html).toContain('id="v2-reader-settings-dialog"');
    expect(html).toContain('id="v2-reader-size-dec"');
    expect(html).toContain('id="v2-reader-size-inc"');
    expect(html).toContain('id="v2-toggle-macra"');
    expect(html).toContain('id="v2-toggle-gutter"');
    expect(html).toContain('id="v2-font-select"');
  });

  test("renderReaderContentHtml renders multi-scheme works with arbitrary depth", () => {
    // Catullus: 2 levels (poem, line)
    const catullusHtml = renderReaderContentHtml({ workId: "catullus" });
    expect(catullusHtml).toContain("C. Valerius Catullus");
    expect(catullusHtml).toContain("Carmen V");
    expect(catullusHtml).toContain('id="sec-5.1"');
    expect(catullusHtml).toContain('class="v2-cite-prefix">5.</span>');
    expect(catullusHtml).toContain(">Vivamus</a>");
    expect(catullusHtml).toContain(">Lesbia</a>");

    // Virgil Aeneid: 2 levels (book, line)
    const aeneidHtml = renderReaderContentHtml({ workId: "aeneid" });
    expect(aeneidHtml).toContain("P. Vergilius Maro");
    expect(aeneidHtml).toContain("Aeneis");
    expect(aeneidHtml).toContain('id="sec-1.1"');
    expect(aeneidHtml).toContain(">Arma</a>");
    expect(aeneidHtml).toContain(">cano</a>");

    // Plautus Amphitruo: 3 levels (act, scene, line)
    const plautusHtml = renderReaderContentHtml({ workId: "amphitruo" });
    expect(plautusHtml).toContain("T. Maccius Plautus");
    expect(plautusHtml).toContain("Actus I, Scaena I");
    expect(plautusHtml).toContain('id="sec-1.1.1"');
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

describe("reader_citation_helpers", () => {
  test("citationToString and parseCitationString round-trip accurately", () => {
    expect(citationToString(["1", "2", "3"])).toBe("1.2.3");
    expect(parseCitationString("1.2.3")).toEqual(["1", "2", "3"]);
    expect(parseCitationString("  5.12  ")).toEqual(["5", "12"]);
  });

  test("citationToSemanticLabel formats labels according to textParts hierarchy", () => {
    const textParts = ["book", "chapter", "section"];
    expect(citationToSemanticLabel(["1", "2"], textParts)).toBe(
      "Book 1, Chapter 2"
    );
    expect(citationToSemanticLabel(["1", "2", "3"], textParts)).toBe(
      "Book 1, Chapter 2, Section 3"
    );

    const poemParts = ["poem", "line"];
    expect(citationToSemanticLabel(["5", "10"], poemParts)).toBe(
      "Poem 5, Line 10"
    );
  });

  test("getSectionLocalId and getSectionPrefix split citations relative to page", () => {
    const pageId = ["2", "1"];
    const secId = ["2", "1", "4"];

    expect(getSectionLocalId(secId, pageId)).toBe("4");
    expect(getSectionPrefix(secId, pageId)).toBe("2.1.");

    // Single level page (e.g. Catullus poem 5, line 10)
    expect(getSectionLocalId(["5", "10"], ["5"])).toBe("10");
    expect(getSectionPrefix(["5", "10"], ["5"])).toBe("5.");
  });

  test("resolveCitationJump handles both relative and absolute coordinates", () => {
    const work = getReaderWork("dbg");

    // Relative jump within active page 1.1: typing "2"
    const relJump = resolveCitationJump("2", work, 0);
    expect(relJump).not.toBeNull();
    expect(relJump?.pageIndex).toBe(0);
    expect(relJump?.targetSectionId).toBe("1.1.2");

    // Absolute jump to section in next chapter: "1.2.1"
    const absJump = resolveCitationJump("1.2.1", work, 0);
    expect(absJump).not.toBeNull();
    expect(absJump?.pageIndex).toBe(1);
    expect(absJump?.targetSectionId).toBe("1.2.1");

    // Chapter-only jump: "1.2"
    const chapJump = resolveCitationJump("1.2", work, 0);
    expect(chapJump).not.toBeNull();
    expect(chapJump?.pageIndex).toBe(1);
    expect(chapJump?.targetSectionId).toBeUndefined();

    // Invalid citation returns null
    expect(resolveCitationJump("99.99", work, 0)).toBeNull();
  });
});
