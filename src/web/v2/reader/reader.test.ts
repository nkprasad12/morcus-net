import {
  renderReaderContentHtml,
  renderReaderPageHtml,
  resolveReaderContext,
  renderReaderStickyBar,
  renderReaderTextPanel,
  renderReaderDictPanel,
  renderBiblioDialog,
  renderReaderSettingsDialog,
  renderTocDrawer,
  renderTocItemsHtml,
  buildReaderPageUrl,
} from "@/web/v2/reader/reader.server";
import {
  citationToString,
  parseCitationString,
  citationToSemanticLabel,
  getSectionLocalId,
  getSectionPrefix,
  resolveCitationJump,
} from "@/web/v2/reader/reader_types.server";
import { getReaderWork } from "@/web/v2/testing/reader_data";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--v2-bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

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
    expect(html).toContain("/v2/dicts?embedded=1");

    // Contains Latin words as clean semantic text
    expect(html).toContain("Gallia");
    expect(html).toContain("Belgae");

    // Desktop splitter & mobile sheet handle
    expect(html).toContain('class="v2-reader-splitter"');
    expect(html).toContain('class="v2-reader-sheet-bar"');
  });

  test("renderReaderContentHtml renders gutter markers with separate prefix and local spans for responsive short numbering", async () => {
    const html = await renderReaderContentHtml({
      workId: "dbg",
      pageId: "1.1",
    });

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

    // Dictionary iframe points to embedded query with Latin filter and forced inflections (o=1)
    expect(html).toContain('id="v2-dict-frame"');
    expect(html).toContain(
      "/v2/dicts?q=divisa&amp;lang=La&amp;o=1&amp;embedded=1"
    );

    // Close button present in mobile sheet handle bar
    expect(html).toContain("v2-reader-sheet-close");
  });

  test("renderReaderContentHtml supports parallel translation view mode", async () => {
    const singleHtml = await renderReaderContentHtml({
      workId: "sallust/catalina1",
      pageId: "1",
      view: "single",
    });
    expect(singleHtml).not.toContain("v2-section-parallel");
    expect(singleHtml).not.toContain("v2-passage-english");
    // Translated work renders the Single | Parallel view toggle
    expect(singleHtml).toContain('id="v2-mode-single"');
    expect(singleHtml).toContain('id="v2-mode-parallel"');
    expect(singleHtml).toContain('class="v2-reader-view-toggle"');

    const parallelHtml = await renderReaderContentHtml({
      workId: "sallust/catalina1",
      pageId: "1",
      view: "parallel",
    });
    expect(parallelHtml).toContain("v2-reader-view-parallel");
    expect(parallelHtml).toContain("v2-section-parallel");
    expect(parallelHtml).toContain("v2-passage-english");
    expect(parallelHtml).toContain("John Selby Watson");
    expect(parallelHtml).toContain('id="v2-mode-single"');
    expect(parallelHtml).toContain('id="v2-mode-parallel"');

    // Untranslated work requested with view=parallel cleanly falls back to single
    const untranslatedParallelHtml = await renderReaderContentHtml({
      workId: "dbg",
      pageId: "1.1",
      view: "parallel",
    });
    expect(untranslatedParallelHtml).not.toContain("v2-reader-view-parallel");
    expect(untranslatedParallelHtml).not.toContain("v2-section-parallel");
    expect(untranslatedParallelHtml).not.toContain(
      'class="v2-reader-view-toggle"'
    );
    expect(untranslatedParallelHtml).not.toContain('id="v2-mode-parallel"');
    expect(untranslatedParallelHtml).toContain('data-view="single"');
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
    // Untranslated work (dbg) should omit the Single | Parallel view toggle
    expect(html).not.toContain('id="v2-mode-single"');
    expect(html).not.toContain('id="v2-mode-parallel"');
    expect(html).not.toContain('class="v2-reader-view-toggle"');
    expect(html).toContain('id="v2-reader-settings-btn"');
    expect(html).toContain('id="v2-reader-info-btn"');

    // Settings dialog
    expect(html).toContain("<morcus-reader-settings>");
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

describe("decomposed_reader_renderers", () => {
  const { MOCK_CAESAR_WORK, MOCK_SALLUST_WORK } = jest.requireActual(
    "@/web/v2/testing/mock_reader_loader"
  );
  const dbgWork = MOCK_CAESAR_WORK;
  const sallustWork = MOCK_SALLUST_WORK;

  describe("buildReaderPageUrl", () => {
    test("returns # when page is null", () => {
      expect(buildReaderPageUrl(dbgWork, null)).toBe("#");
    });

    test("constructs canonical page URL with dot citation", () => {
      expect(buildReaderPageUrl(dbgWork, dbgWork.pages[0])).toBe(
        "/v2/reader/caesar/de_bello_gallico/1.1"
      );
    });

    test("appends view and query parameters when specified", () => {
      expect(
        buildReaderPageUrl(dbgWork, dbgWork.pages[0], {
          viewMode: "parallel",
          query: "gallia",
        })
      ).toBe("/v2/reader/caesar/de_bello_gallico/1.1?view=parallel&q=gallia");
    });
  });

  describe("renderBiblioDialog", () => {
    test("renders scholarly bibliographical dialog with metadata", () => {
      const html = renderBiblioDialog(dbgWork);
      expect(html).toContain('id="v2-reader-biblio-dialog"');
      expect(html).toContain("De bello Gallico");
      expect(html).toContain("Julius Caesar");
      expect(html).toContain('["book", "chapter", "section"]');
      expect(html).toContain("T. Rice Holmes");
      expect(html).toContain('id="v2-reader-biblio-ok-btn"');
      expect(html).toContain("data-dialog-close");
    });

    test("conditionally renders translator when present", () => {
      const html = renderBiblioDialog(sallustWork);
      expect(html).toContain("English Translation");
      expect(html).toContain("John Selby Watson");
    });

    test("conditionally renders optional URN, license, and source repository", () => {
      const workWithMetadata = {
        ...dbgWork,
        ctsUrn: "urn:cts:latinLit:phi0448.phi001",
        license: "CC BY-SA 4.0",
        sourceRepo: "https://github.com/PerseusDL/canonical-latinLit",
      };
      const html = renderBiblioDialog(workWithMetadata);
      expect(html).toContain("<code>urn:cts:latinLit:phi0448.phi001</code>");
      expect(html).toContain("CC BY-SA 4.0");
      expect(html).toContain(
        'href="https://github.com/PerseusDL/canonical-latinLit"'
      );
      expect(html).toContain('rel="noopener noreferrer"');
    });
  });

  describe("renderReaderSettingsDialog", () => {
    test("renders settings modal with custom element container and steppers", () => {
      const html = renderReaderSettingsDialog();
      expect(html).toContain("<morcus-reader-settings>");
      expect(html).toContain('id="v2-reader-settings-dialog"');
      expect(html).toContain('id="v2-reader-size-dec"');
      expect(html).toContain('id="v2-reader-size-inc"');
      expect(html).toContain('id="v2-dict-size-dec"');
      expect(html).toContain('id="v2-dict-size-inc"');
      expect(html).toContain('id="v2-toggle-macra"');
      expect(html).toContain('id="v2-toggle-gutter"');
      expect(html).toContain('id="v2-font-select"');
      expect(html).toContain('id="v2-line-height-select"');
      expect(html).toContain('id="v2-reader-settings-reset-btn"');
      expect(html).toContain('id="v2-reader-settings-done-btn"');
    });
  });

  describe("renderTocDrawer", () => {
    test("renders TOC drawer with search filter and marked active chapter", () => {
      const html = renderTocDrawer({
        work: dbgWork,
        activePageIndex: 0,
      });

      expect(html).toContain('id="v2-reader-toc-drawer"');
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain("hidden");
      expect(html).toContain('id="v2-reader-toc-back-btn"');
      expect(html).toContain('id="v2-reader-toc-close-btn"');
      expect(html).toContain('id="v2-reader-toc-filter"');
      expect(html).toContain("v2-reader-toc-work-title");
      expect(html).toContain("book · chapter · section");

      // First chapter active
      expect(html).toContain('class="v2-reader-toc-item active"');
      expect(html).toContain('aria-current="page"');
      expect(html).toContain("Liber I, Caput I");
      expect(html).toContain("§ 1.1");
    });

    test("renderTocItemsHtml marks selected index active and leaves other inactive", () => {
      const itemsHtml = renderTocItemsHtml({
        pages: dbgWork.pages,
        activePageIndex: 1,
        work: dbgWork,
      });

      // Page 0 should not be active
      expect(itemsHtml).toContain(
        'href="/v2/reader/caesar/de_bello_gallico/1.1"\n           class="v2-reader-toc-item "'
      );
      // Page 1 should be active
      expect(itemsHtml).toContain(
        'href="/v2/reader/caesar/de_bello_gallico/1.2"\n           class="v2-reader-toc-item active"\n           aria-current="page"'
      );
    });
  });

  describe("renderReaderStickyBar", () => {
    test("disables prev button on first chapter and enables next button", async () => {
      const ctx = await resolveReaderContext({ workId: "dbg", pageId: "1.1" });
      const html = renderReaderStickyBar(ctx);

      expect(html).toContain('class="v2-reader-sticky-bar"');
      expect(html).toContain('id="v2-pager-prev"');
      expect(html).toContain(
        'class="v2-reader-btn v2-reader-nav-arrow disabled"'
      );
      expect(html).toContain('aria-disabled="true" tabindex="-1"');
      expect(html).toContain('id="v2-pager-next"');
      expect(html).not.toContain(
        'id="v2-pager-next"\n               aria-disabled="true"'
      );
      expect(html).toContain('id="v2-reader-jump-form"');
      expect(html).toContain('value="1.1"');
      expect(html).toContain('id="v2-sticky-expand-btn"');
      expect(html).toContain('id="v2-reader-toc-btn"');
    });

    test("disables next button on last chapter", async () => {
      const lastPageIdx = dbgWork.pages.length - 1;
      const lastPage = dbgWork.pages[lastPageIdx];
      const pageId = Array.isArray(lastPage.id)
        ? lastPage.id.join(".")
        : lastPage.id;
      const ctx = await resolveReaderContext({ workId: "dbg", pageId });
      const html = renderReaderStickyBar(ctx);

      expect(html).toContain('id="v2-pager-next"');
      expect(html).toContain('aria-disabled="true" tabindex="-1"');
    });

    test("renders view toggle for translated work and omits it for untranslated work", async () => {
      const untranslatedCtx = await resolveReaderContext({ workId: "dbg" });
      const untranslatedHtml = renderReaderStickyBar(untranslatedCtx);
      expect(untranslatedHtml).not.toContain("v2-reader-view-toggle");

      const translatedCtx = await resolveReaderContext({
        workId: "sallust/catalina1",
        pageId: "1",
      });
      const translatedHtml = renderReaderStickyBar(translatedCtx);
      expect(translatedHtml).toContain("v2-reader-view-toggle");
      expect(translatedHtml).toContain('id="v2-mode-single"');
      expect(translatedHtml).toContain('id="v2-mode-parallel"');
    });
  });

  describe("renderReaderTextPanel", () => {
    test("renders author tag, passage heading, article body, and library link", async () => {
      const ctx = await resolveReaderContext({ workId: "dbg", pageId: "1.1" });
      const html = renderReaderTextPanel(ctx);

      expect(html).toContain('class="v2-reader-text-panel"');
      expect(html).toContain("Julius Caesar");
      expect(html).toContain("De bello Gallico");
      expect(html).toContain("Liber I, Caput I");
      expect(html).toContain('id="v2-reader-passage"');
      expect(html).toContain("Gallia est omnis divisa");
      expect(html).toContain("v2-reader-continue-btn");
      expect(html).toContain('href="/v2/library"');
    });
  });

  describe("renderReaderDictPanel", () => {
    test("renders empty state teaser when query is absent", async () => {
      const ctx = await resolveReaderContext({ workId: "dbg" });
      const html = renderReaderDictPanel(ctx);

      expect(html).toContain('class="v2-reader-splitter"');
      expect(html).toContain('id="v2-reader-dict"');
      expect(html).toContain("Tap any word to view definitions");
      expect(html).not.toContain("v2-reader-sheet-close");
      expect(html).toContain('src="/v2/dicts?embedded=1"');
    });

    test("renders query definition label and close link when query is present", async () => {
      const ctx = await resolveReaderContext({
        workId: "dbg",
        query: "omnis",
      });
      const html = renderReaderDictPanel(ctx);

      expect(html).toContain("Definitions for <strong>omnis</strong>");
      expect(html).toContain('class="v2-reader-sheet-close"');
      expect(html).toContain(
        'src="/v2/dicts?q=omnis&amp;lang=La&amp;o=1&amp;embedded=1"'
      );
    });
  });

  describe("resolveReaderContext", () => {
    test("resolves work, active page, and navigation properties", async () => {
      const ctx = await resolveReaderContext({ workId: "dbg", pageId: "1.1" });
      expect(ctx.work.id).toBe("phi0448.phi001.perseus-lat2");
      expect(ctx.activePage.id).toBe("1.1");
      expect(ctx.pageDotId).toBe("1.1");
      expect(ctx.activePageIndex).toBe(0);
      expect(ctx.prevPage).toBeNull();
      expect(ctx.nextPage).not.toBeNull();
      expect(ctx.viewMode).toBe("single");
      expect(ctx.hasParallel).toBe(false);
      expect(ctx.layoutStateClass).toBe("v2-reader-layout-empty");
      expect(ctx.dictIframeSrc).toBe("/v2/dicts?embedded=1");
    });

    test("resolves layout state and dictionary iframe src when query is provided", async () => {
      const ctx = await resolveReaderContext({ workId: "dbg", query: "arma" });
      expect(ctx.query).toBe("arma");
      expect(ctx.layoutStateClass).toBe("v2-reader-layout-active");
      expect(ctx.dictIframeSrc).toBe("/v2/dicts?q=arma&lang=La&o=1&embedded=1");
    });
  });
});
