/**
 * @jest-environment jsdom
 */

import express from "express";
import request from "supertest";
import {
  renderReaderContentHtml,
  renderReaderPageHtml,
  resolveReaderContext,
  buildReaderDictIframeSrc,
  renderReaderStickyBar,
  renderReaderTextPanel,
  renderReaderDictPanel,
  renderReaderTranslationHtml,
} from "@/web/ui/reader/reader.server";
import { createReaderRoutes } from "@/web/ui/reader/reader_routes.server";
import { resolvePageInWork } from "@/web/ui/reader/reader_loader.server";
import {
  renderReaderAboutSection,
  renderReaderSettingsPopover,
} from "@/web/ui/reader/reader_dialogs.server";
import {
  renderTocDrawer,
  renderTocItemsHtml,
  buildReaderPageUrl,
} from "@/web/ui/reader/reader_toc.server";
import {
  citationToString,
  parseCitationString,
  getDifferentialCitationLabel,
} from "@/web/ui/reader/reader_types.server";
import {
  MOCK_CAESAR_WORK,
  MOCK_SALLUST_WORK,
} from "@/web/ui/testing/mock_reader_loader";
import type { V2PreprocessedWork } from "@/common/library/preprocess/preprocessed_types";

const realResolvePageInWork: typeof resolvePageInWork = jest.requireActual<
  typeof import("@/web/ui/reader/reader_loader.server")
>("@/web/ui/reader/reader_loader.server").resolvePageInWork;

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

describe("reader_ssr", () => {
  test("renderReaderContentHtml without query displays empty state, breadcrumbs, and clean Latin text", async () => {
    const html = await renderReaderContentHtml({
      workId: "caesar/de_bello_gallico",
    });

    // Custom element container
    expect(html).toContain("<morcus-reader-view");
    expect(html).toContain("reader-view");

    // Author and Work headers
    expect(html).toContain("Caesar");
    expect(html).toContain("Gallico");
    expect(html).toContain("Chapter 1");

    // Dictionary landing card and deferred iframe in initial view
    expect(html).toContain('id="dict-frame"');
    expect(html).toContain('src="/dicts?embedded=1"');
    expect(html).toContain("data-dict-unarmed");
    expect(html).toContain("reader-dict-landing");
    expect(html).toContain("reader-dict-kbd");

    // Contains Latin words as clean semantic text
    expect(html).toContain("Gallia");
    expect(html).toContain("Belgae");

    // Desktop splitter & mobile sheet handle
    expect(html).toContain('class="reader-splitter resize-handle"');
    expect(html).toContain('class="reader-sheet-bar"');
  });

  test("renderReaderContentHtml renders gutter markers with separate prefix and local spans for responsive short numbering", async () => {
    const html = await renderReaderContentHtml({
      workId: "caesar/de_bello_gallico",
      pageId: "1.1",
    });

    // Section 1.1.1
    expect(html).toContain('id="sec-1.1.1"');
    expect(html).toContain('class="reader-gutter"');
    expect(html).toContain('href="#sec-1.1.1" class="section-anchor"');
    expect(html).toContain('class="cite-prefix">1.1.</span>');
    expect(html).toContain('class="cite-local">1</span>');

    // Section 1.1.2
    expect(html).toContain('id="sec-1.1.2"');
    expect(html).toContain('class="cite-prefix">1.1.</span>');
    expect(html).toContain('class="cite-local">2</span>');

    // Section 1.1.3
    expect(html).toContain('id="sec-1.1.3"');
    expect(html).toContain('class="cite-local">3</span>');
  });

  test("renderReaderContentHtml with query points dictionary iframe to embedded query", async () => {
    const html = await renderReaderContentHtml({
      workId: "caesar/de_bello_gallico",
      query: "divisa",
    });

    // Dictionary iframe points to embedded query with Latin filter and forced inflections (o=1)
    expect(html).toContain('id="dict-frame"');
    expect(html).toContain(
      "/dicts?q=divisa&amp;lang=La&amp;o=1&amp;embedded=1"
    );

    // Close button present in mobile sheet handle bar
    expect(html).toContain("reader-sheet-close");
  });

  test("renderReaderContentHtml uses single-column Latin canvas and exposes data-has-translation", async () => {
    const translatedHtml = await renderReaderContentHtml({
      workId: "sallust/catalina1",
      pageId: "1",
    });
    // Single-column Latin canvas, no dual-column parallel DOM
    expect(translatedHtml).not.toContain("section-parallel");
    expect(translatedHtml).not.toContain("passage-english");
    expect(translatedHtml).not.toContain("reader-view-parallel");
    // Sticky bar omits view toggle
    expect(translatedHtml).not.toContain('id="mode-single"');
    expect(translatedHtml).not.toContain('id="mode-parallel"');
    expect(translatedHtml).not.toContain('class="reader-view-toggle"');
    // Root element indicates translation availability for client controller
    expect(translatedHtml).toContain('data-has-translation="true"');

    // Untranslated work has data-has-translation="false"
    const untranslatedHtml = await renderReaderContentHtml({
      workId: "caesar/de_bello_gallico",
      pageId: "1.1",
    });
    expect(untranslatedHtml).not.toContain("reader-view-parallel");
    expect(untranslatedHtml).not.toContain("section-parallel");
    expect(untranslatedHtml).not.toContain('class="reader-view-toggle"');
    expect(untranslatedHtml).not.toContain('id="mode-parallel"');
    expect(untranslatedHtml).toContain('data-has-translation="false"');
  });

  test("renderReaderContentHtml renders Table of Contents drawer and About section", async () => {
    const html = await renderReaderContentHtml({
      workId: "caesar/de_bello_gallico",
    });

    // Table of Contents drawer
    expect(html).toContain('id="reader-toc-drawer"');
    expect(html).toContain('class="reader-toc-drawer"');
    expect(html).toContain('id="reader-toc-close-btn"');
    expect(html).toContain('class="reader-toc-item active"');

    // Scholarly About section in document flow (and no legacy biblio dialog)
    expect(html).toContain('id="reader-work-about"');
    expect(html).toContain('class="reader-work-about"');
    expect(html).toContain("Holmes");
    expect(html).not.toContain('id="reader-biblio-dialog"');
  });

  test("renderReaderContentHtml renders unified primary sticky navigation bar with Aa trigger", async () => {
    const html = await renderReaderContentHtml({
      workId: "caesar/de_bello_gallico",
    });

    // Primary row: essentials, Contents trigger, pager arrows, and Aa trigger
    expect(html).toContain('class="reader-sticky-bar"');
    expect(html).toContain('class="sticky-primary-row"');
    expect(html).toContain('id="pager-prev"');
    expect(html).toContain('id="pager-next"');
    expect(html).toContain('class="sticky-work-title"');
    expect(html).toContain("Bellum Gallicum");
    expect(html).toContain('class="jump-glyph"');
    expect(html).not.toContain('id="sticky-expand-btn"');
    expect(html).not.toContain('class="expand-icon"');
    expect(html).toContain('id="reader-settings-btn"');
    expect(html).toContain('aria-controls="reader-settings-popover"');

    // Main text panel header: Author and Work Name (About lives in the panel tab)
    expect(html).toContain('class="reader-author-tag"');
    expect(html).toContain('class="reader-work-tag"');
    expect(html).not.toContain('class="reader-about-link"');

    // Primary sticky bar: unified single row with Contents trigger, arrows, and Aa trigger
    expect(html).not.toContain('id="sticky-expand-btn"');
    expect(html).not.toContain('id="sticky-expanded-row"');
    expect(html).toContain('id="reader-toc-btn"');
    expect(html).toContain('id="reader-settings-btn"');
    expect(html).not.toContain('id="mode-single"');
    expect(html).not.toContain('id="mode-parallel"');
    expect(html).not.toContain('class="reader-view-toggle"');
    expect(html).not.toContain('id="reader-info-btn"');

    // Dismissal backdrops
    expect(html).toContain('id="reader-toc-backdrop"');
    expect(html).toContain('id="reader-settings-backdrop"');

    // Settings popover (Caesar dbgWork has hasMacra: false, so toggle-macra is omitted)
    expect(html).toContain("<morcus-reader-settings");
    expect(html).toContain('data-has-macra="false"');
    expect(html).toContain('id="reader-settings-popover"');
    expect(html).toContain('id="dict-size-dec"');
    expect(html).toContain('id="dict-size-inc"');
    expect(html).not.toContain('id="toggle-macra"');
    expect(html).not.toContain("Show Macra");
    expect(html).toContain('id="toggle-gutter"');
    expect(html).toContain('id="reader-appearance-link"');
  });

  test("renderReaderContentHtml renders multi-scheme works with arbitrary depth", async () => {
    // Catullus: 2 levels (poem, line)
    const catullusHtml = await renderReaderContentHtml({
      workId: "catullus/carmina",
      pageId: "5",
    });
    expect(catullusHtml).toContain("Catullus");
    expect(catullusHtml).toContain("Carmen V");
    expect(catullusHtml).toContain('id="sec-5.1"');
    expect(catullusHtml).toContain('class="cite-prefix">5.</span>');
    expect(catullusHtml).toContain("Vivamus");
    expect(catullusHtml).toContain("Lesbia");
    // Catullus has hasMacra: true, so toggle-macra should be present
    expect(catullusHtml).toContain('id="toggle-macra"');
    expect(catullusHtml).toContain("Show Macra");

    // Virgil Aeneid: 2 levels (book, line)
    const aeneidHtml = await renderReaderContentHtml({
      workId: "vergil/aeneid",
    });
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
    const pageHtml = await renderReaderPageHtml({
      workId: "caesar/de_bello_gallico",
      query: "Gallia",
    });

    expect(pageHtml).toContain("<!DOCTYPE html>");
    expect(pageHtml).toContain(
      "<title>De bello Gallico: Book 1, Chapter 1 - Morcus Latin Tools</title>"
    );
    expect(pageHtml).toContain(
      '<link rel="canonical" href="https://morcus.net/work/caesar/de_bello_gallico/1.1">'
    );
    expect(pageHtml).toContain('<header class="app-bar">');
    expect(pageHtml).toContain('href="/library"');
    expect(pageHtml).toContain('class="nav-link active"');
    expect(pageHtml).toContain('aria-current="page"');
    expect(pageHtml).toContain("body-reader");
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
});

describe("decomposed_reader_renderers", () => {
  const { MOCK_CAESAR_WORK, MOCK_SALLUST_WORK } = jest.requireActual(
    "@/web/ui/testing/mock_reader_loader"
  );
  const dbgWork = MOCK_CAESAR_WORK;
  const sallustWork = MOCK_SALLUST_WORK;

  describe("buildReaderPageUrl", () => {
    test("returns # when page is null", () => {
      expect(buildReaderPageUrl(dbgWork, null)).toBe("#");
    });

    test("constructs canonical page URL with dot citation", () => {
      expect(buildReaderPageUrl(dbgWork, dbgWork.pages[0])).toBe(
        "/work/caesar/de_bello_gallico/1.1"
      );
    });

    test("appends query parameter when specified", () => {
      expect(
        buildReaderPageUrl(dbgWork, dbgWork.pages[0], {
          query: "gallia",
        })
      ).toBe("/work/caesar/de_bello_gallico/1.1?q=gallia");
    });
  });

  describe("renderReaderAboutSection", () => {
    test("renders scholarly attribution section with metadata", () => {
      const html = renderReaderAboutSection(dbgWork);
      expect(html).toContain('id="reader-work-about"');
      expect(html).toContain('class="reader-work-about"');
      expect(html).toContain("Julius Caesar");
      expect(html).toContain("T. Rice Holmes");
      expect(html).toContain("About this text");
      expect(html).toContain("Perseus Digital Library");
      expect(html).not.toContain('["book", "chapter", "section"]');
    });

    test("conditionally renders translator when present", () => {
      const html = renderReaderAboutSection(sallustWork);
      expect(html).toContain("Translator");
      expect(html).toContain("John Selby Watson");
    });

    test("conditionally renders optional funder, sponsor, URN, and source repository", () => {
      const workWithMetadata = {
        ...dbgWork,
        funder: "The National Endowment for the Humanities",
        sponsor: "Perseus Project, Tufts University",
        ctsUrn: "urn:cts:latinLit:phi0448.phi001",
        sourceRef: [
          "https://archive.org/details/desenectutedeami0000cice/page/108",
        ],
      };
      const html = renderReaderAboutSection(workWithMetadata);
      expect(html).toContain("The National Endowment for the Humanities");
      expect(html).toContain("Perseus Project, Tufts University");
      expect(html).toContain("<code>urn:cts:latinLit:phi0448.phi001</code>");
      expect(html).toContain(
        'href="https://archive.org/details/desenectutedeami0000cice/page/108"'
      );
      expect(html).toContain('rel="noopener noreferrer"');
    });
  });

  describe("renderReaderSettingsPopover", () => {
    test("renders settings popover with custom element container and steppers (default hasMacra true)", () => {
      const html = renderReaderSettingsPopover();
      expect(html).toContain("<morcus-reader-settings");
      expect(html).not.toContain('data-has-macra="false"');
      expect(html).toContain('id="reader-settings-popover"');
      expect(html).toContain('id="reader-settings-close-btn"');
      // Text size, font and spacing moved to the app-wide Appearance menu.
      expect(html).not.toContain('id="reader-size-label"');
      expect(html).not.toContain('id="reader-size-dec"');
      expect(html).not.toContain('id="reader-size-inc"');
      expect(html).toContain('id="reader-appearance-link"');
      expect(html).toContain('id="dict-size-label"');
      expect(html).toContain('id="dict-size-dec"');
      expect(html).toContain('id="dict-size-inc"');
      expect(html).toContain('id="toggle-macra"');
      expect(html).toContain("Show Macra");
      expect(html).toContain('id="toggle-gutter"');
      expect(html).toContain('id="toggle-swipe-nav"');
      expect(html).not.toContain('id="font-select"');
      expect(html).not.toContain('id="line-height-select"');
      expect(html).toContain('id="reader-settings-reset-btn"');
      expect(html).not.toContain('id="reader-settings-done-btn"');
    });

    test("renders macra toggle when hasMacra is explicitly true", () => {
      const html = renderReaderSettingsPopover({ hasMacra: true });
      expect(html).toContain("<morcus-reader-settings>");
      expect(html).toContain('id="toggle-macra"');
      expect(html).toContain("Show Macra");
    });

    test("omits macra toggle when hasMacra is false", () => {
      const html = renderReaderSettingsPopover({ hasMacra: false });
      expect(html).toContain("<morcus-reader-settings>");
      expect(html).not.toContain('id="toggle-macra"');
      expect(html).not.toContain("Show Macra");
      expect(html).toContain('id="toggle-gutter"');
    });
  });

  describe("renderTocDrawer", () => {
    test("renders TOC drawer with tree structure and marked active chapter", () => {
      const html = renderTocDrawer({
        work: dbgWork,
        activePageIndex: 0,
      });

      expect(html).toContain('id="reader-toc-drawer"');
      expect(html).toContain('role="dialog"');
      expect(html).not.toContain('aria-modal="true"');
      expect(html).toContain("hidden");
      expect(html).toContain('id="reader-toc-close-btn"');
      expect(html).toContain('id="reader-toc-search-input"');
      expect(html).toContain('id="reader-toc-list"');
      expect(html).toContain('id="reader-toc-empty"');

      // Clutter removed
      expect(html).not.toContain('id="reader-toc-back-btn"');
      expect(html).not.toContain('id="reader-toc-filter"');
      expect(html).not.toContain("reader-toc-work-title");
      expect(html).not.toContain("book · chapter · section");

      // Tree groups and items
      expect(html).toContain("reader-toc-group");
      expect(html).toContain("Book 1");
      expect(html).toContain('class="reader-toc-item active"');
      expect(html).toContain('aria-current="page"');
      expect(html).toContain("Chapter 1");
    });

    test("renderTocItemsHtml marks selected index active and leaves other inactive", () => {
      const itemsHtml = renderTocItemsHtml({
        pages: dbgWork.pages,
        activePageIndex: 1,
        work: dbgWork,
      });

      // Page 0 should not be active
      expect(itemsHtml).toContain(
        '<a href="/work/caesar/de_bello_gallico/1.1" class="reader-toc-item" data-page-id="1.1">'
      );
      // Page 1 should be active
      expect(itemsHtml).toContain(
        '<a href="/work/caesar/de_bello_gallico/1.2" class="reader-toc-item active" data-page-id="1.2" aria-current="page">'
      );
    });

    test("renderTocItemsHtml splices active item, open group, and query into pre-rendered tocHtml", () => {
      const baseHtml = renderTocItemsHtml({
        activePageIndex: -1,
        work: dbgWork,
      });
      const splicedHtml = renderTocItemsHtml({
        activePageIndex: 1,
        query: "gallia",
        work: { ...dbgWork, tocHtml: baseHtml },
      });

      expect(splicedHtml).toContain(
        '<details class="reader-toc-group" data-group-id="1" open>'
      );
      expect(splicedHtml).toContain(
        '<a href="/work/caesar/de_bello_gallico/1.2?q=gallia" class="reader-toc-item active" data-page-id="1.2" aria-current="page">'
      );
    });
  });

  describe("renderReaderStickyBar", () => {
    test("disables prev button on first chapter and enables next button", async () => {
      const ctx = await resolveReaderContext({
        workId: "caesar/de_bello_gallico",
        pageId: "1.1",
      });
      const html = renderReaderStickyBar(ctx);

      expect(html).toContain('class="reader-sticky-bar"');
      expect(html).toContain('id="pager-prev"');
      expect(html).toContain('class="reader-btn reader-nav-arrow disabled"');
      expect(html).toContain('aria-disabled="true" tabindex="-1"');
      expect(html).toContain('id="pager-next"');
      expect(html).not.toContain(
        'id="pager-next"\n               aria-disabled="true"'
      );
      expect(html).toContain('id="reader-jump-form"');
      expect(html).toContain('class="sticky-center-group"');
      expect(html).not.toContain('id="sticky-expand-btn"');
      expect(html).toContain('id="reader-settings-btn"');
      expect(html).toContain('id="reader-toc-btn"');
    });

    test("disables next button on last chapter", async () => {
      const lastPageIdx = dbgWork.pages.length - 1;
      const lastPage = dbgWork.pages[lastPageIdx];
      const pageId = Array.isArray(lastPage.id)
        ? lastPage.id.join(".")
        : lastPage.id;
      const ctx = await resolveReaderContext({
        workId: "caesar/de_bello_gallico",
        pageId,
      });
      const html = renderReaderStickyBar(ctx);

      expect(html).toContain('id="pager-next"');
      expect(html).toContain('aria-disabled="true" tabindex="-1"');
    });

    test("omits view toggle in sticky bar for both translated and untranslated works", async () => {
      const untranslatedCtx = await resolveReaderContext({
        workId: "caesar/de_bello_gallico",
      });
      const untranslatedHtml = renderReaderStickyBar(untranslatedCtx);
      expect(untranslatedHtml).not.toContain("reader-view-toggle");
      expect(untranslatedHtml).not.toContain('id="mode-single"');
      expect(untranslatedHtml).not.toContain('id="mode-parallel"');

      const translatedCtx = await resolveReaderContext({
        workId: "sallust/catalina1",
        pageId: "1",
      });
      const translatedHtml = renderReaderStickyBar(translatedCtx);
      expect(translatedHtml).not.toContain("reader-view-toggle");
      expect(translatedHtml).not.toContain('id="mode-single"');
      expect(translatedHtml).not.toContain('id="mode-parallel"');
    });
  });

  describe("renderReaderTextPanel", () => {
    test("renders author tag, passage heading, article body, and library link", async () => {
      const ctx = await resolveReaderContext({
        workId: "caesar/de_bello_gallico",
        pageId: "1.1",
      });
      const html = renderReaderTextPanel(ctx);

      expect(html).toContain('class="reader-text-panel"');
      expect(html).toContain("Julius Caesar");
      expect(html).toContain("De bello Gallico");
      expect(html).toContain("Book 1, Chapter 1");
      expect(html).toContain('id="reader-passage"');
      expect(html).toContain("Gallia est omnis divisa");
      expect(html).toContain("reader-continue-btn");
      expect(html).toContain('href="/library"');
    });

    test("leaves notes and About to the companion panel", async () => {
      const ctx = await resolveReaderContext({
        workId: "caesar/de_bello_gallico",
        pageId: "1.1",
      });
      const ctxWithNotes = {
        ...ctx,
        activePage: {
          ...ctx.activePage,
          notesHtml:
            '<aside class="reader-notes"><ol class="reader-notes-list"><li id="note-1">Note 1</li></ol></aside>',
        },
      };
      const html = renderReaderTextPanel(ctxWithNotes);

      expect(html).not.toContain('id="note-1"');
      expect(html).not.toContain('id="reader-work-about"');
      // The About tab replaces the old in-card link to the section.
      expect(html).not.toContain('href="#reader-work-about"');
    });
  });

  describe("renderReaderDictPanel", () => {
    test("renders empty state teaser when query is absent", async () => {
      const ctx = await resolveReaderContext({
        workId: "caesar/de_bello_gallico",
      });
      const html = renderReaderDictPanel(ctx);

      expect(html).toContain('class="reader-splitter resize-handle"');
      expect(html).toContain('id="reader-dict"');
      expect(html).toContain("Open Dictionary Search");
      expect(html).toContain("Tap any word to view definitions");
      expect(html).toContain("reader-teaser-nojs");
      expect(html).toContain("reader-teaser-js");
      expect(html).toContain('href="#reader-dict"');
      expect(html).toContain("reader-sheet-open-link");
      expect(html).toContain("reader-dict-landing");
      expect(html).toContain("data-dict-unarmed");
      expect(html).toContain('src="/dicts?embedded=1"');
    });

    test("renders the companion tabs and views in their final position", async () => {
      const ctx = await resolveReaderContext({
        workId: "caesar/de_bello_gallico",
        pageId: "1.1",
      });
      const html = renderReaderDictPanel({
        ...ctx,
        activePage: {
          ...ctx.activePage,
          notesHtml:
            '<aside class="reader-notes"><ol class="reader-notes-list"><li class="reader-note" id="note-1">Note 1</li></ol></aside>',
        },
      });
      const doc = new DOMParser().parseFromString(html, "text/html");
      const panel = doc.getElementById("reader-dict");

      expect(panel?.classList.contains("has-companion-tabs")).toBe(true);
      const tabs = Array.from(doc.querySelectorAll(".reader-panel-tab"));
      expect(tabs.map((t) => [t.id, t.getAttribute("href")])).toEqual([
        ["panel-tab-dict", "#panel-view-dict"],
        ["panel-tab-notes", "#panel-view-notes"],
        ["panel-tab-translation", "#panel-view-translation"],
        ["panel-tab-about", "#panel-view-about"],
      ]);
      // Tab roles and the selected tab come from JS; the server never marks
      // a view active, so `:target` decides without JS.
      expect(
        doc.querySelector("[role='tab'], [aria-selected], .active")
      ).toBeNull();
      // Caesar has no translation.
      expect(doc.getElementById("panel-tab-translation")?.hidden).toBe(true);
      expect(doc.getElementById("panel-tab-notes")?.hidden).toBe(false);

      expect(doc.getElementById("dict-frame")?.parentElement?.id).toBe(
        "panel-view-dict"
      );
      expect(
        doc.getElementById("note-1")?.closest("[data-slot='notes']")
          ?.parentElement?.id
      ).toBe("panel-view-notes");
      const about = doc.getElementById("reader-work-about");
      expect(about?.closest("#panel-view-about")).not.toBeNull();
      expect(about?.hasAttribute("open")).toBe(true);
    });

    test("hides the Notes tab on a page without notes", async () => {
      const ctx = await resolveReaderContext({
        workId: "caesar/de_bello_gallico",
        pageId: "1.1",
      });
      const doc = new DOMParser().parseFromString(
        renderReaderDictPanel(ctx),
        "text/html"
      );
      expect(doc.getElementById("panel-tab-notes")?.hidden).toBe(true);
      expect(
        doc.querySelector(".reader-panel-tabs")?.hasAttribute("hidden")
      ).toBe(false);
    });

    test("renders static teaser label and close link when query is present", async () => {
      const ctx = await resolveReaderContext({
        workId: "caesar/de_bello_gallico",
        query: "omnis",
      });
      const html = renderReaderDictPanel(ctx);

      expect(html).toContain("reader-sheet-open-link");
      expect(html).toContain("Tap any word to view definitions");
      expect(html).toContain('class="reader-sheet-close"');
      expect(html).not.toContain("data-dict-unarmed");
      expect(html).toContain(
        'src="/dicts?q=omnis&amp;lang=La&amp;o=1&amp;embedded=1&amp;scale=93"'
      );
    });
  });

  describe("resolveReaderContext", () => {
    test("resolves work, active page, and navigation properties", async () => {
      const ctx = await resolveReaderContext({
        workId: "caesar/de_bello_gallico",
        pageId: "1.1",
      });
      expect(ctx.work.id).toBe("phi0448.phi001.perseus-lat2");
      expect(ctx.activePage.id).toBe("1.1");
      expect(ctx.pageDotId).toBe("1.1");
      expect(ctx.activePageIndex).toBe(0);
      expect(ctx.prevPage).toBeNull();
      expect(ctx.nextPage).not.toBeNull();
      expect(ctx.work.hasTranslation).toBe(false);
      expect(ctx.layoutStateClass).toBe("reader-layout-empty");
      expect(ctx.dictIframeSrc).toBe("/dicts?embedded=1");
    });

    test("throws when work is not found", async () => {
      await expect(
        resolveReaderContext({ workId: "unknown/work" })
      ).rejects.toThrow("Classical work not found: unknown/work");
    });

    test("resolves layout state and dictionary iframe src when query is provided", async () => {
      const ctx = await resolveReaderContext({
        workId: "caesar/de_bello_gallico",
        query: "arma",
      });
      expect(ctx.query).toBe("arma");
      expect(ctx.layoutStateClass).toBe("reader-layout-active");
      expect(ctx.dictIframeSrc).toBe(
        "/dicts?q=arma&lang=La&o=1&embedded=1&scale=93"
      );
    });

    test("the dictionary iframe src never pins dictionaries (d=), so the saved morcus_d applies", () => {
      for (const q of ["", "arma", "Mūsa", "d=1"]) {
        const src = new URL(buildReaderDictIframeSrc(q), "http://x");
        expect(src.searchParams.has("d")).toBe(false);
        expect(src.searchParams.has("dict")).toBe(false);
        expect(src.searchParams.has("in")).toBe(false);
      }
    });

    test("falls back to first section in matchText when pageId is omitted and preserves matchText on same-page URLs", async () => {
      const ctx = await resolveReaderContext({
        workId: "caesar/de_bello_gallico",
        matchText: "1.2.1~0~2",
        query: "Orgetorix",
      });
      expect(ctx.activePage.id).toBe("1.2");
      expect(ctx.pageDotId).toBe("1.2");
      expect(ctx.matchText).toBe("1.2.1~0~2");
      expect(ctx.singleViewUrl).toContain("matchText=1.2.1%7E0%7E2");
      expect(renderReaderDictPanel(ctx)).toContain(
        "matchText=1.2.1%7E0%7E2#reader-dict-dismissed"
      );
      // Server HTML remains static (client applies .reader-match)
      expect(ctx.activePage.singleHtml).not.toContain("reader-match");
    });
  });

  describe("getDifferentialCitationLabel", () => {
    test("returns leaf tier label when navigating within the same parent section", () => {
      expect(
        getDifferentialCitationLabel(
          ["1", "2"],
          ["1", "3"],
          ["book", "chapter"]
        )
      ).toBe("Chapter 3");

      expect(
        getDifferentialCitationLabel(
          ["14", "1", "1"],
          ["14", "1", "2"],
          ["book", "topic", "chapter"]
        )
      ).toBe("Chapter 2");
    });

    test("returns higher boundary tier label when navigating across parent boundaries", () => {
      expect(
        getDifferentialCitationLabel(
          ["1", "29"],
          ["2", "1"],
          ["book", "chapter"]
        )
      ).toBe("Book 2");

      expect(
        getDifferentialCitationLabel(
          ["14", "1", "14"],
          ["14", "2", "1"],
          ["book", "topic", "chapter"]
        )
      ).toBe("Topic 2");
    });

    test("handles fallback when textParts are shorter than citation depth", () => {
      expect(
        getDifferentialCitationLabel(["1", "1"], ["1", "2"], ["book"])
      ).toBe("Section 2");
    });
  });
});

describe("renderReaderTranslationHtml", () => {
  const untranslatedPage: V2PreprocessedWork = {
    ...MOCK_SALLUST_WORK,
    pages: [
      MOCK_SALLUST_WORK.pages[0],
      { ...MOCK_SALLUST_WORK.pages[1], translationHtml: undefined },
    ],
  };

  test("renders the translation of a translated page", () => {
    const html = renderReaderTranslationHtml(untranslatedPage, "1");
    expect(html).toContain("reader-translation-content");
    expect(html).toContain("Translated by John Selby Watson");
    expect(html).toContain("It becomes all men");
  });

  test("renders an empty state for an untranslated page of a translated work", () => {
    const html = renderReaderTranslationHtml(untranslatedPage, "2");
    expect(html).toContain("reader-translation-empty");
    expect(html).toContain("No translation available for this page.");
    expect(html).not.toContain("reader-translation-content");
  });

  test("returns null for a work without a translation", () => {
    expect(
      renderReaderTranslationHtml(
        { ...untranslatedPage, hasTranslation: false },
        "1"
      )
    ).toBeNull();
  });

  test("returns null when pageParam does not match any page in the work", () => {
    expect(renderReaderTranslationHtml(untranslatedPage, "999")).toBeNull();
    expect(renderReaderTranslationHtml(untranslatedPage, "15")).toBeNull();
  });
});

describe("resolvePageInWork citation resolution and RDR-07 route handling", () => {
  const multiBookWork: V2PreprocessedWork = {
    ...MOCK_CAESAR_WORK,
    urlAuthor: "ovid",
    urlName: "amores",
    textParts: ["book", "poem", "line"],
    paginationDepth: 2,
    pages: [
      {
        ...MOCK_CAESAR_WORK.pages[0],
        id: ["1", "1"],
        title: "Book 1, Elegy 1",
      },
      {
        ...MOCK_CAESAR_WORK.pages[1],
        id: ["1", "5"],
        title: "Book 1, Elegy 5",
      },
      {
        ...MOCK_CAESAR_WORK.pages[0],
        id: ["2", "1"],
        title: "Book 2, Elegy 1",
      },
      {
        ...MOCK_CAESAR_WORK.pages[1],
        id: ["2", "3"],
        title: "Book 2, Elegy 3",
      },
    ],
  };

  test.each([
    ["production resolvePageInWork", realResolvePageInWork],
    ["mock resolvePageInWork", resolvePageInWork],
  ])(
    "%s distinguishes matched vs unmatched citations and enforces segment boundaries",
    (_, resolver) => {
      // Bare URL resolves to first page with matched: true
      expect(resolver(multiBookWork, undefined)).toEqual({
        page: multiBookWork.pages[0],
        index: 0,
        pageIndex: 0,
        matched: true,
      });
      expect(resolver(multiBookWork, "   ")).toEqual({
        page: multiBookWork.pages[0],
        index: 0,
        pageIndex: 0,
        matched: true,
      });

      // Exact match
      expect(resolver(multiBookWork, "1.5")).toEqual({
        page: multiBookWork.pages[1],
        index: 1,
        pageIndex: 1,
        matched: true,
      });

      // Sub-page citation (e.g. "1.5.10" -> "1.5")
      expect(resolver(multiBookWork, "1.5.10")).toEqual({
        page: multiBookWork.pages[1],
        index: 1,
        pageIndex: 1,
        matched: true,
      });

      // Book prefix citation (e.g. "2" -> "2.1")
      expect(resolver(multiBookWork, "2")).toEqual({
        page: multiBookWork.pages[2],
        index: 2,
        pageIndex: 2,
        matched: true,
      });

      // Leading label word stripped (e.g. "Book 2" -> "2" -> "2.1")
      expect(resolver(multiBookWork, "Book 2")).toEqual({
        page: multiBookWork.pages[2],
        index: 2,
        pageIndex: 2,
        matched: true,
      });

      // Non-segment prefix "1.55" must NEVER prefix-match "1.5"
      expect(resolver(multiBookWork, "1.55")).toEqual({
        page: multiBookWork.pages[0],
        index: 0,
        pageIndex: 0,
        matched: false,
      });

      // Unknown citation "999" returns matched: false
      expect(resolver(multiBookWork, "999")).toEqual({
        page: multiBookWork.pages[0],
        index: 0,
        pageIndex: 0,
        matched: false,
      });
    }
  );

  test("renderTocDrawer renders jumpMiss status banner and pre-fills search input when jumpMiss is provided", () => {
    const html = renderTocDrawer({
      work: MOCK_CAESAR_WORK,
      activePageIndex: 1,
      query: "Gallia",
      jumpMiss: "999",
    });

    expect(html).toContain('action="/work/caesar/de_bello_gallico/1.2"');
    expect(html).toContain(
      '<p class="reader-toc-miss" role="status">No section &ldquo;999&rdquo; in this work.</p>'
    );
    expect(html).toContain('value="999"');
  });

  test("reader routes return 404 for unknown path citations and redirect ?jump misses back to current page with ?jumpMiss", async () => {
    const app = express();
    app.use("/", createReaderRoutes());

    // 1. Direct path citation miss (full and partial) -> 404
    const missFull = await request(app).get(
      "/work/caesar/de_bello_gallico/999"
    );
    expect(missFull.status).toBe(404);
    expect(missFull.text).toContain("Classical Work Not Found");
    expect(missFull.text).toContain("caesar/de_bello_gallico/999");

    const missSegment = await request(app).get(
      "/work/caesar/de_bello_gallico/1.15"
    );
    expect(missSegment.status).toBe(404);

    const missPartial = await request(app).get(
      "/work/caesar/de_bello_gallico/999?format=partial"
    );
    expect(missPartial.status).toBe(404);

    // 2. ?jump= miss from /work/caesar/de_bello_gallico/1.2 stays on /1.2 with ?jumpMiss=...#reader-toc-drawer
    const jumpMissFromPage = await request(app).get(
      "/work/caesar/de_bello_gallico/1.2?jump=999&q=Gallia"
    );
    expect(jumpMissFromPage.status).toBe(302);
    expect(jumpMissFromPage.header.location).toBe(
      "/work/caesar/de_bello_gallico/1.2?q=Gallia&jumpMiss=999#reader-toc-drawer"
    );

    // 3. Following the redirect renders page 1.2 with the miss banner inside #reader-toc-drawer
    const renderedMiss = await request(app).get(
      "/work/caesar/de_bello_gallico/1.2?q=Gallia&jumpMiss=999"
    );
    expect(renderedMiss.status).toBe(200);
    expect(renderedMiss.text).toContain('data-page="1.2"');
    expect(renderedMiss.text).toContain(
      '<p class="reader-toc-miss" role="status">No section &ldquo;999&rdquo; in this work.</p>'
    );
    expect(renderedMiss.text).toContain('value="999"');

    // 4. ?jump=Book+1 resolves via label stripping without appending a bogus #sec-Book 1 hash
    const jumpBook = await request(app).get(
      "/work/caesar/de_bello_gallico/1.2?jump=Book+1"
    );
    expect(jumpBook.status).toBe(302);
    expect(jumpBook.header.location).toBe("/work/caesar/de_bello_gallico/1.1");
  });
});
