/**
 * @jest-environment jsdom
 */

import type {
  OpenTextDocument,
  OpenTextPage,
} from "@/common/open_texts/open_text_document";
import {
  OPEN_TEXT_NOTES_VIEW_ID,
  findOpenTextPageIndex,
  openTextPageHref,
  renderOpenTextAboutHtml,
  renderOpenTextFrameHtml,
  renderOpenTextNotesHtml,
  renderOpenTextPassageHtml,
  swapOpenTextNotes,
  syncOpenTextPageChrome,
  type OpenTextViewModel,
} from "@/web/ui/open_texts/open_text_view_adapter.client";
import {
  FIXTURE_LL_PARTIAL_ENTRY,
  FIXTURE_LL_SOURCE,
  FIXTURE_PL_ENTRY,
  FIXTURE_PL_SOURCE,
} from "@/web/ui/open_texts/open_texts_reader_fixtures";

/** Rendered text, ignoring the formatting whitespace in templates. */
function text(el: Element | null | undefined): string | undefined {
  return el?.textContent?.replace(/\s+/g, " ").trim();
}

function page(partial: Partial<OpenTextPage> & { id: string }): OpenTextPage {
  return { label: `col. ${partial.id}`, blocks: [], notes: [], ...partial };
}

const DOC: OpenTextDocument = {
  title: "De Fide",
  author: "Ambrosius",
  pagination: "pageBreaks",
  warnings: [],
  pages: [
    page({
      id: "529",
      blocks: [
        { kind: "heading", segments: [{ kind: "text", text: "LIBER PRIMUS" }] },
        {
          kind: "paragraph",
          segments: [
            { kind: "section", label: "529A" },
            { kind: "text", text: "Regina Austri venit " },
            { kind: "text", text: "audire", style: { italic: true } },
            { kind: "text", text: " sapientiam. " },
            { kind: "section", label: "529B" },
            { kind: "text", text: "Tu quoque " },
            { kind: "text", text: "λόγος", lang: "grc" },
          ],
        },
      ],
      notes: [{ segments: [{ kind: "text", text: "Cf. 3 Reg. 10." }] }],
    }),
    page({
      id: "530",
      blocks: [
        {
          kind: "paragraph",
          continued: true,
          segments: [{ kind: "text", text: "sed non ego Salomon." }],
        },
      ],
    }),
    page({
      id: "531",
      blocks: [
        {
          kind: "line",
          stanzaStart: true,
          segments: [{ kind: "text", text: "Primus versus" }],
        },
        { kind: "line", segments: [{ kind: "text", text: "Secundus versus" }] },
        {
          kind: "line",
          stanzaStart: true,
          segments: [
            { kind: "section", label: "531C" },
            { kind: "text", text: "Tertius versus" },
          ],
        },
      ],
    }),
  ],
};

const MODEL: OpenTextViewModel = {
  entry: FIXTURE_PL_ENTRY,
  sourceMeta: FIXTURE_PL_SOURCE,
  doc: DOC,
  backHref: "/opentexts",
};

function fragment(markup: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = markup;
  document.body.replaceChildren(div);
  return div;
}

describe("renderOpenTextPassageHtml", () => {
  afterEach(() => document.body.replaceChildren());

  it("puts each section marker in the gutter of its own row", () => {
    const root = fragment(renderOpenTextPassageHtml(DOC.pages[0]));
    const sections = root.querySelectorAll(":scope > .reader-section");
    // Heading, 529A, 529B: the notes are in the companion panel.
    expect(sections).toHaveLength(3);
    expect(root.querySelector(".reader-notes, .reader-note")).toBeNull();
    expect(text(sections[0].querySelector("h3.reader-subheading"))).toBe(
      "LIBER PRIMUS"
    );
    expect(sections[0].id).toBe("");
    expect(sections[1].id).toBe("sec-529A");
    expect(
      sections[1]
        .querySelector(".reader-gutter a.section-anchor")
        ?.getAttribute("href")
    ).toBe("#sec-529A");
    expect(text(sections[1].querySelector(".cite-local"))).toBe("529A");
    expect(text(sections[1].querySelector(".reader-paragraph"))).toBe(
      "Regina Austri venit audire sapientiam."
    );
    expect(text(sections[1].querySelector(".italic"))).toBe("audire");
    expect(sections[2].id).toBe("sec-529B");
  });

  it("keeps text in another language out of word lookup", () => {
    const root = fragment(renderOpenTextPassageHtml(DOC.pages[0]));
    const greek = root.querySelector('[lang="grc"]');
    expect(text(greek)).toBe("λόγος");
    expect(greek?.getAttribute("data-no-tokenize")).toBe("true");
  });

  it("renders verse lines with stanza breaks and gutter markers", () => {
    const root = fragment(renderOpenTextPassageHtml(DOC.pages[2]));
    const rows = root.querySelectorAll(".reader-section.section-verse");
    expect(rows).toHaveLength(3);
    // No break before the first line of the page.
    expect(rows[0].querySelector(".line-space")).toBeNull();
    expect(rows[1].querySelector(".line-space")).toBeNull();
    expect(rows[2].querySelector(".line-space")).not.toBeNull();
    expect(rows[2].id).toBe("sec-531C");
    expect(text(rows[2].querySelector(".reader-line"))).toBe("Tertius versus");
  });

  it("escapes source text and keeps section ids unique", () => {
    const root = fragment(
      renderOpenTextPassageHtml(
        page({
          id: "1",
          blocks: [
            {
              kind: "paragraph",
              segments: [
                { kind: "section", label: "1" },
                { kind: "text", text: "<img src=x onerror=alert(1)>" },
                { kind: "section", label: "1" },
                { kind: "text", text: "again" },
              ],
            },
          ],
        })
      )
    );
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(
      Array.from(root.querySelectorAll(".reader-section[id]"), (el) => el.id)
    ).toEqual(["sec-1", "sec-1-2"]);
  });

  it("says so when a page has no text", () => {
    const root = fragment(renderOpenTextPassageHtml(page({ id: "9" })));
    expect(root.textContent).toContain("This page has no text.");
  });
});

describe("renderOpenTextNotesHtml", () => {
  afterEach(() => document.body.replaceChildren());

  it("renders the page's notes in the library's endnote shape", () => {
    const root = fragment(renderOpenTextNotesHtml(DOC.pages[0]));
    const notes = root.querySelector('aside.reader-notes[role="doc-endnotes"]');
    expect(text(notes?.querySelector("h2.reader-notes-heading"))).toBe("Notes");
    const items = notes?.querySelectorAll("ol.reader-notes-list > li") ?? [];
    expect(items).toHaveLength(1);
    expect(items[0].classList.contains("reader-note")).toBe(true);
    // `#note-<n>`, which ReaderPanelController reveals in the Notes tab.
    expect(items[0].id).toBe("note-1");
    expect(text(items[0])).toContain("[1]");
    expect(text(items[0].querySelector(".reader-note-body"))).toBe(
      "Cf. 3 Reg. 10."
    );
  });

  it("is empty for a page without notes, as on library pages", () => {
    expect(String(renderOpenTextNotesHtml(DOC.pages[1]))).toBe("");
  });

  it("escapes note text", () => {
    const root = fragment(
      renderOpenTextNotesHtml(
        page({
          id: "1",
          notes: [{ segments: [{ kind: "text", text: "<img src=x>" }] }],
        })
      )
    );
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("<img src=x>");
  });
});

describe("findOpenTextPageIndex", () => {
  it("finds pages by id, then by label", () => {
    expect(findOpenTextPageIndex(DOC, "530")).toBe(1);
    expect(findOpenTextPageIndex(DOC, "COL. 531")).toBe(2);
    expect(findOpenTextPageIndex(DOC, "999")).toBe(-1);
    expect(findOpenTextPageIndex(DOC, undefined)).toBe(-1);
  });
});

describe("renderOpenTextFrameHtml", () => {
  afterEach(() => document.body.replaceChildren());

  it("builds a reader frame with header badges, pager and companion panel", () => {
    const root = fragment(renderOpenTextFrameHtml(MODEL, 0));
    const view = root.querySelector("morcus-reader-view.reader-view");
    expect(view).not.toBeNull();
    expect(
      root.querySelector("#reader-passage .reader-section")
    ).not.toBeNull();
    expect(text(root.querySelector(".reader-author-tag"))).toBe("Ambrosius");
    expect(text(root.querySelector(".open-text-badge-uncurated"))).toBe(
      "Uncurated"
    );
    expect(text(root.querySelector(".open-text-badge-source"))).toBe(
      "Patrologia Latina · PL 16"
    );
    expect(text(root.querySelector("h1.reader-passage-heading"))).toBe(
      "col. 529"
    );
    // The heading is the library reader's copy-permalink link.
    const headingLink = root.querySelector<HTMLAnchorElement>(
      'h1.reader-passage-heading[aria-live="polite"] > a.reader-heading-link'
    );
    expect(headingLink?.getAttribute("href")).toBe(
      openTextPageHref(FIXTURE_PL_ENTRY.id, "529")
    );
    expect(headingLink?.getAttribute("title")).toBe("Copy link to this page");
    expect(headingLink?.getAttribute("aria-label")).toBe(
      "col. 529 (copy link to this page)"
    );
    expect(
      headingLink?.querySelectorAll(".copy-pill-icon svg.copy-pill-glyph")
    ).toHaveLength(2);
    // The About panel carries the provenance and the no-promise notice.
    const about = root.querySelector("#panel-view-about");
    expect(about?.querySelector(".reader-work-about")).not.toBeNull();
    expect(about?.textContent).toContain("no promise");
    expect(about?.textContent).toContain(FIXTURE_PL_ENTRY.license);
    expect(about?.textContent).toContain("Migne");
    // Prev is disabled on the first page; next links to the second.
    const prev = root.querySelector<HTMLAnchorElement>(
      '.reader-sticky-bar [data-role="open-text-prev"]'
    );
    expect(prev?.getAttribute("aria-disabled")).toBe("true");
    const next = root.querySelector<HTMLAnchorElement>(
      '.reader-sticky-bar [data-role="open-text-next"]'
    );
    expect(next?.getAttribute("href")).toBe(
      openTextPageHref(FIXTURE_PL_ENTRY.id, "530")
    );
    // No bespoke page selector: the library reader's contents do that.
    expect(root.querySelector(".reader-text-card-header select")).toBeNull();
    // The dictionary starts unarmed without a lookup.
    expect(
      root.querySelector("#dict-frame")?.hasAttribute("data-dict-unarmed")
    ).toBe(true);
  });

  it("has the library reader's Aa button and settings dialog", () => {
    const root = fragment(renderOpenTextFrameHtml(MODEL, 0));
    const right = root.querySelector(
      ".reader-sticky-bar .sticky-primary-right"
    );
    const btn = right?.querySelector<HTMLButtonElement>(
      "button#reader-settings-btn.reader-settings-btn"
    );
    expect(btn?.getAttribute("aria-controls")).toBe("reader-settings-popover");
    expect(btn?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(btn?.hasAttribute("data-js-only")).toBe(true);
    expect(text(btn)).toBe("Aa");
    // After the next arrow and a separator, as on library pages.
    expect(
      Array.from(right?.children ?? [], (el) => el.className.split(" ")[0])
    ).toEqual(["reader-btn", "running-right-sep", "reader-btn"]);
    // The dialog is inside the reader view, which listens for its changes.
    const dialog = root.querySelector(
      "morcus-reader-view > morcus-reader-settings > dialog#reader-settings-popover"
    );
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector("#toggle-gutter")).not.toBeNull();
    expect(dialog?.querySelector("#dict-size-inc")).not.toBeNull();
    // Open Texts have no macra.
    expect(dialog?.querySelector("#toggle-macra")).toBeNull();
  });

  it("puts the page's notes in the companion panel's Notes tab", () => {
    const root = fragment(renderOpenTextFrameHtml(MODEL, 0));
    const tab = root.querySelector<HTMLAnchorElement>("a#panel-tab-notes");
    expect(tab?.getAttribute("href")).toBe("#panel-view-notes");
    expect(tab?.hidden).toBe(false);
    const view = root.querySelector(
      `.reader-panel-views > #${OPEN_TEXT_NOTES_VIEW_ID}.reader-panel-notes`
    );
    const slot = view?.querySelector('.reader-notes-slot[data-slot="notes"]');
    expect(slot?.querySelector("li.reader-note#note-1")).not.toBeNull();
    // The header's notes link opens the tab.
    const link = root.querySelector<HTMLAnchorElement>(
      '.reader-text-card-header a[data-role="open-text-notes-link"]'
    );
    expect(link?.getAttribute("href")).toBe("#panel-view-notes");
    expect(text(link)).toBe("1 note");

    // A page without notes hides the tab and leaves the slot empty.
    const empty = fragment(renderOpenTextFrameHtml(MODEL, 1));
    expect(
      empty.querySelector<HTMLAnchorElement>("a#panel-tab-notes")?.hidden
    ).toBe(true);
    expect(
      text(empty.querySelector('#panel-view-notes [data-slot="notes"]'))
    ).toBe("");
  });

  it("switches pages with the library reader's contents button and dialog", () => {
    const root = fragment(renderOpenTextFrameHtml(MODEL, 1));
    const btn = root.querySelector<HTMLAnchorElement>(
      ".reader-sticky-bar .sticky-jump-box a#reader-toc-btn"
    );
    expect(btn?.getAttribute("href")).toBe("#reader-toc-drawer");
    expect(btn?.classList.contains("sticky-section-btn")).toBe(true);
    expect(btn?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(btn?.getAttribute("aria-expanded")).toBe("false");
    expect(btn?.getAttribute("aria-controls")).toBe("reader-toc-drawer");
    expect(text(btn?.querySelector(".sticky-work-title"))).toBe(
      FIXTURE_PL_ENTRY.title
    );
    expect(btn?.querySelector(".sticky-section-sep")).not.toBeNull();
    // Page labels name their own unit, so there is no `§`.
    expect(btn?.querySelector(".jump-glyph")).toBeNull();
    const label = btn?.querySelector(
      '.jump-val[data-role="open-text-page-label"]'
    );
    expect(text(label)).toBe("col. 530");
    expect(btn?.querySelector("svg.jump-chevron")).not.toBeNull();
    expect(root.querySelector(".sticky-title-wrapper")).toBeNull();

    // The dialog sits in the reader view, as on library pages.
    const drawer = root.querySelector(
      "morcus-reader-view > dialog#reader-toc-drawer.reader-toc-drawer"
    );
    expect(drawer).not.toBeNull();
    expect(drawer?.querySelector("#reader-toc-search-input")).not.toBeNull();
    expect(drawer?.querySelector("#reader-toc-close-btn")).not.toBeNull();
    expect(
      drawer?.querySelector("#reader-toc-empty")?.hasAttribute("hidden")
    ).toBe(true);
    const items = Array.from(
      drawer?.querySelectorAll<HTMLAnchorElement>(
        "#reader-toc-list a.reader-toc-item"
      ) ?? []
    );
    expect(items.map((a) => a.dataset.pageId)).toEqual(["529", "530", "531"]);
    expect(items.map((a) => text(a))).toEqual([
      "col. 529",
      "col. 530",
      "col. 531",
    ]);
    expect(items.map((a) => a.getAttribute("href"))).toEqual(
      ["529", "530", "531"].map((id) =>
        openTextPageHref(FIXTURE_PL_ENTRY.id, id)
      )
    );
    expect(items.map((a) => a.getAttribute("aria-current"))).toEqual([
      null,
      "page",
      null,
    ]);
    expect(items[1].classList.contains("active")).toBe(true);
    const back = drawer?.querySelector<HTMLAnchorElement>(
      ".reader-toc-footer a.reader-library-link"
    );
    expect(back?.getAttribute("href")).toBe("/opentexts");
    expect(text(back)).toBe("← Back to Open Texts");
  });

  it("escapes page labels and ids in the contents", () => {
    const doc: OpenTextDocument = {
      ...DOC,
      pages: [
        page({ id: '1"<x>', label: "<b>one</b>" }),
        page({ id: "2", label: "two" }),
      ],
    };
    const root = fragment(renderOpenTextFrameHtml({ ...MODEL, doc }, 0));
    const first = root.querySelector<HTMLAnchorElement>(
      "#reader-toc-drawer a.reader-toc-item"
    );
    expect(first?.dataset.pageId).toBe('1"<x>');
    expect(text(first)).toBe("<b>one</b>");
    expect(root.querySelector("#reader-toc-drawer b")).toBeNull();
  });

  it("opens the dictionary on a lookup already in the URL", () => {
    const root = fragment(renderOpenTextFrameHtml(MODEL, 0, "regina"));
    expect(
      root
        .querySelector(".reader-split-layout")
        ?.classList.contains("reader-layout-active")
    ).toBe(true);
    expect(root.querySelector("#dict-frame")?.getAttribute("src")).toBe(
      "/dicts?q=regina&lang=La&o=1&embedded=1"
    );
  });

  it("shows the partial-coverage note with a link to the Library", () => {
    const root = fragment(
      renderOpenTextFrameHtml(
        {
          entry: FIXTURE_LL_PARTIAL_ENTRY,
          sourceMeta: FIXTURE_LL_SOURCE,
          doc: { ...DOC, pages: [DOC.pages[1]] },
          backHref: "/opentexts",
        },
        0
      )
    );
    const links = Array.from(
      root.querySelectorAll<HTMLAnchorElement>(
        'a[href="/work/apicius/de_re_coquinaria"]'
      )
    );
    // In the header notice and in About.
    expect(links).toHaveLength(2);
    // A single page has no pager or contents, just its title and page.
    expect(root.querySelector("#reader-toc-btn")).toBeNull();
    expect(root.querySelector("#reader-toc-drawer")).toBeNull();
    expect(text(root.querySelector(".sticky-title-wrapper .jump-val"))).toBe(
      "col. 530"
    );
    expect(root.querySelector(".reader-continuation-actions")).toBeNull();
  });

  it("About escapes catalog metadata", () => {
    const root = fragment(
      renderOpenTextAboutHtml({
        ...MODEL,
        entry: { ...FIXTURE_PL_ENTRY, license: "<b>bold</b>" },
      })
    );
    expect(root.querySelector("b")).toBeNull();
    expect(root.textContent).toContain("<b>bold</b>");
  });
});

describe("syncOpenTextPageChrome", () => {
  afterEach(() => document.body.replaceChildren());

  it("updates labels, the heading, pager links and the notes link", () => {
    const root = fragment(renderOpenTextFrameHtml(MODEL, 0));
    const notesLink = root.querySelector<HTMLAnchorElement>(
      'a[data-role="open-text-notes-link"]'
    );
    expect(notesLink?.hidden).toBe(false);
    expect(text(notesLink)).toBe("1 note");

    syncOpenTextPageChrome(root, MODEL, 2);

    expect(
      Array.from(
        root.querySelectorAll('[data-role="open-text-page-label"]'),
        (el) => text(el)
      )
    ).toEqual(["col. 531"]);
    const headingLink = root.querySelector<HTMLAnchorElement>(
      "h1.reader-passage-heading a.reader-heading-link"
    );
    expect(text(headingLink)).toBe("col. 531");
    expect(headingLink?.getAttribute("href")).toBe(
      openTextPageHref(FIXTURE_PL_ENTRY.id, "531")
    );
    expect(headingLink?.getAttribute("aria-label")).toBe(
      "col. 531 (copy link to this page)"
    );
    expect(headingLink?.querySelector(".copy-pill-icon")).not.toBeNull();
    const stickyNext = root.querySelector<HTMLAnchorElement>(
      '.reader-sticky-bar [data-role="open-text-next"]'
    );
    expect(stickyNext?.classList.contains("disabled")).toBe(true);
    const stickyPrev = root.querySelector<HTMLAnchorElement>(
      '.reader-sticky-bar [data-role="open-text-prev"]'
    );
    expect(stickyPrev?.hasAttribute("aria-disabled")).toBe(false);
    expect(stickyPrev?.getAttribute("href")).toBe(
      openTextPageHref(FIXTURE_PL_ENTRY.id, "530")
    );
    const nextCard = root.querySelector<HTMLAnchorElement>(
      '.reader-continuation-card[data-role="open-text-next"]'
    );
    expect(nextCard?.hidden).toBe(true);
    expect(text(root.querySelector("#reader-toc-btn .jump-val"))).toBe(
      "col. 531"
    );
    expect(notesLink?.hidden).toBe(true);
  });
});

describe("swapOpenTextNotes", () => {
  afterEach(() => document.body.replaceChildren());

  it("replaces the notes slot's content with the page's notes", () => {
    const root = fragment(renderOpenTextFrameHtml(MODEL, 1));
    const slot = root.querySelector('#panel-view-notes [data-slot="notes"]');
    expect(slot?.querySelector(".reader-note")).toBeNull();

    swapOpenTextNotes(root, MODEL, 0);
    // The slot element itself stays, as `#panel-view-notes`' state does.
    expect(root.querySelector('[data-slot="notes"]')).toBe(slot);
    expect(slot?.querySelectorAll(".reader-note")).toHaveLength(1);

    swapOpenTextNotes(root, MODEL, 2);
    expect(slot?.querySelector(".reader-note")).toBeNull();
  });
});
