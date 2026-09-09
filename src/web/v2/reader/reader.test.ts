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
import { getReaderWork } from "@/web/v2/reader/reader_data";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--v2-bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

describe("reader_ssr", () => {
  test("renderReaderContentHtml without query displays empty state, breadcrumbs, and clean Latin text", async () => {
    const html = await renderReaderContentHtml();

    // Custom element container
    expect(html).toContain("<morcus-reader-view");
    expect(html).toContain("v2-reader-view");

    // Author and Work headers
    expect(html).toContain("Caesar");
    expect(html).toContain("Gallico");
    expect(html).toContain("Caput I");

    // Dictionary iframe panel in No-JS view
    expect(html).toContain('id="v2-dict-frame"');
    expect(html).toContain('/v2/dicts?embedded=1');

    // Contains Latin words as clean semantic text
    expect(html).toContain("Gallia");
    expect(html).toContain("Belgae");

    // Desktop splitter & mobile sheet handle
    expect(html).toContain('class="v2-reader-splitter"');
    expect(html).toContain('class="v2-reader-sheet-bar"');
  });

  test("renderReaderContentHtml renders gutter markers with separate prefix and local spans for responsive short numbering", async () => {
    const html = await renderReaderContentHtml({ workId: "dbg", pageId: "1.1" });

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

  test("renderReaderContentHtml with query points dictionary iframe to embedded query", async () => {
    const html = await renderReaderContentHtml({
      query: "divisa",
    });

    // Dictionary iframe points to embedded query
    expect(html).toContain('id="v2-dict-frame"');
    expect(html).toContain('/v2/dicts?q=divisa&amp;embedded=1');

    // Close button present in mobile sheet handle bar
    expect(html).toContain("v2-reader-sheet-close");
  });

  test("renderReaderContentHtml supports parallel translation view mode", async () => {
    const singleHtml = await renderReaderContentHtml({ workId: "sallust/catalina1", pageId: "1", view: "single" });
    expect(singleHtml).not.toContain("v2-section-parallel");
    expect(singleHtml).not.toContain("v2-passage-english");

    const parallelHtml = await renderReaderContentHtml({ workId: "sallust/catalina1", pageId: "1", view: "parallel" });
    expect(parallelHtml).toContain("v2-reader-view-parallel");
    expect(parallelHtml).toContain("v2-section-parallel");
    expect(parallelHtml).toContain("v2-passage-english");
    expect(parallelHtml).toContain("John Selby Watson");
  });

  test("renderReaderContentHtml renders Table of Contents drawer and Bibliographical modal", async () => {
    const html = await renderReaderContentHtml({ workId: "dbg" });

    // Table of Contents drawer
    expect(html).toContain('id="v2-reader-toc-drawer"');
    expect(html).toContain('class="v2-reader-toc-drawer"');
    expect(html).toContain('id="v2-reader-toc-filter"');
    expect(html).toContain('class="v2-reader-toc-item active"');

    // Bibliographical Dialog
    expect(html).toContain('id="v2-reader-biblio-dialog"');
    expect(html).toContain("Holmes");
  });

  test("renderReaderContentHtml renders sticky navigation bar with essentials and expandable tools", async () => {
    const html = await renderReaderContentHtml({ workId: "dbg" });

    // Primary row: essentials only
    expect(html).toContain('class="v2-reader-sticky-bar"');
    expect(html).toContain('class="v2-sticky-primary-row"');
    expect(html).toContain('id="v2-pager-prev"');
    expect(html).toContain('id="v2-pager-next"');
    expect(html).toContain('class="v2-sticky-author"');
    expect(html).toContain('class="v2-sticky-work-title"');
    expect(html).toContain('class="v2-sticky-page-title"');
    expect(html).toContain('class="v2-jump-glyph"');
    expect(html).toContain('id="v2-sticky-expand-btn"');
    expect(html).toContain('aria-expanded="false"');

    // Main text panel header: Author and Work Name
    expect(html).toContain('class="v2-reader-author-tag"');
    expect(html).toContain('class="v2-reader-work-tag"');

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

  test("renderReaderContentHtml renders multi-scheme works with arbitrary depth", async () => {
    // Catullus: 2 levels (poem, line)
    const catullusHtml = await renderReaderContentHtml({
      workId: "catullus",
      pageId: "5",
    });
    expect(catullusHtml).toContain("Catullus");
    expect(catullusHtml).toContain("Carmen V");
    expect(catullusHtml).toContain('id="sec-5.1"');
    expect(catullusHtml).toContain('class="v2-cite-prefix">5.</span>');
    expect(catullusHtml).toContain("Vivamus");
    expect(catullusHtml).toContain("Lesbia");

    // Virgil Aeneid: 2 levels (book, line)
    const aeneidHtml = await renderReaderContentHtml({ workId: "aeneid" });
    expect(aeneidHtml).toContain("Vergil");
    expect(aeneidHtml).toContain("Aeneid");
    expect(aeneidHtml).toContain('id="sec-1.1"');
    expect(aeneidHtml).toContain("Arma");
    expect(aeneidHtml).toContain("cano");

    // Caesar De Bello Gallico: 3 levels (book, chapter, section)
    const caesarHtml = await renderReaderContentHtml({
      workId: "caesar/de_bello_gallico",
      pageId: "1.1",
    });
    expect(caesarHtml).toContain("Caesar");
    expect(caesarHtml).toContain('id="sec-1.1.1"');
  });

  test("renderReaderPageHtml produces valid full HTML page with active Library nav item", async () => {
    const pageHtml = await renderReaderPageHtml({ query: "Gallia" });

    expect(pageHtml).toContain("<!DOCTYPE html>");
    expect(pageHtml).toContain(
      "<title>Gallia - Latin Reader - Morcus Latin Tools</title>"
    );
    expect(pageHtml).toContain('<header class="v2-app-bar">');
    expect(pageHtml).toContain('href="/v2/library"');
    expect(pageHtml).toContain('class="v2-nav-link active"');
    expect(pageHtml).toContain('aria-current="page"');
    expect(pageHtml).toContain("v2-body-reader");
    expect(pageHtml).toContain("morcus-reader-view");
  });
});

describe("reader_citation_helpers", () => {
  test("citationToString and parseCitationString round-trip accurately", () => {
    expect(citationToString(["1", "1", "1"])).toBe("1.1.1");
    expect(citationToString(["5", "20"])).toBe("5.20");
    expect(citationToString(["proem"])).toBe("proem");

    expect(parseCitationString("1.1.1")).toEqual(["1", "1", "1"]);
    expect(parseCitationString("5.20")).toEqual(["5", "20"]);
    expect(parseCitationString("proem")).toEqual(["proem"]);
  });

  test("citationToSemanticLabel formats labels according to textParts hierarchy", () => {
    const scheme3 = ["book", "chapter", "section"];
    expect(citationToSemanticLabel(["1", "2", "3"], scheme3)).toBe(
      "Book 1, Chapter 2, Section 3"
    );

    const scheme2 = ["poem", "line"];
    expect(citationToSemanticLabel(["5", "10"], scheme2)).toBe(
      "Poem 5, Line 10"
    );

    const scheme1 = ["line"];
    expect(citationToSemanticLabel(["42"], scheme1)).toBe("Line 42");
  });

  test("getSectionLocalId and getSectionPrefix split citations relative to page", () => {
    const pageId = ["1", "1"];

    // Same page section
    const sec1 = ["1", "1", "1"];
    expect(getSectionLocalId(sec1, pageId)).toBe("1");
    expect(getSectionPrefix(sec1, pageId)).toBe("1.1.");

    const sec2 = ["1", "1", "2"];
    expect(getSectionLocalId(sec2, pageId)).toBe("2");
    expect(getSectionPrefix(sec2, pageId)).toBe("1.1.");

    // Section from different chapter fallback
    const secDiff = ["1", "2", "1"];
    expect(getSectionLocalId(secDiff, pageId)).toBe("1.2.1");
    expect(getSectionPrefix(secDiff, pageId)).toBe("");
  });

  test("resolveCitationJump handles both relative and absolute coordinates", () => {
    const work = getReaderWork("dbg");

    // Relative offset within current chapter (e.g. typing "2" while on 1.1)
    const relJump = resolveCitationJump("2", work, 0);
    expect(relJump).not.toBeNull();
    expect(relJump?.page.id).toEqual(["1", "1"]);
    expect(relJump?.targetSectionId).toBe("1.1.2");

    // Absolute citation across different chapters (e.g. "1.2")
    const absJump = resolveCitationJump("1.2", work, 0);
    expect(absJump).not.toBeNull();
    expect(absJump?.page.id).toEqual(["1", "2"]);

    // Invalid coordinate
    const invalidJump = resolveCitationJump("99.99", work, 0);
    expect(invalidJump).toBeNull();
  });
});
