/**
 * @jest-environment jsdom
 */
import {
  authorSortKey,
  normalizeLibraryAuthorName,
  renderLibraryPageHtml,
} from "@/web/ui/library/library.server";
import { MorcusLibraryView } from "@/web/ui/library/library_view.client";
import { getV2LibrarySummaries } from "@/web/ui/reader/reader_loader.server";
import { savedSpotsStore } from "@/web/ui/reader/saved_spots.client";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/ui/reader/reader_loader.server", () => ({
  getV2LibrarySummaries: jest.fn().mockResolvedValue([
    {
      id: "phi0448.phi001.perseus-lat2",
      title: "De Bello Gallico",
      author: "Gaius Julius Caesar",
      urlAuthor: "caesar",
      urlName: "de_bello_gallico",
      attribution: "perseus",
      hasMacra: true,
      hasTranslation: true,
      editor: "T. Rice Holmes",
      translator: "W. A. McDevitte",
      textParts: ["book", "chapter"],
      paginationDepth: 2,
      pageCount: 8,
      firstPageId: ["1", "1"],
    },
    {
      id: "phi0472.phi001.perseus-lat2",
      title: "Carmina",
      author: "Gaius Valerius Catullus",
      urlAuthor: "catullus",
      urlName: "carmina",
      attribution: "perseus",
      hasMacra: false,
      hasTranslation: false,
      textParts: ["poem"],
      paginationDepth: 1,
      pageCount: 116,
      firstPageId: ["1"],
    },
    {
      id: "phi0448.phi002.perseus-lat2",
      title: "De Bello Civili",
      author: "Gaius Julius Caesar",
      urlAuthor: "caesar",
      urlName: "de_bello_civili",
      attribution: "perseus",
      hasMacra: false,
      hasTranslation: false,
      textParts: ["book", "chapter"],
      paginationDepth: 2,
      pageCount: 3,
      firstPageId: ["1", "1"],
    },
  ]),
}));

const CAESAR_SEL = '[data-work-id="phi0448.phi001.perseus-lat2"]';

describe("library SSR & client hydration", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  describe("renderLibraryPageHtml", () => {
    it("emits data-work-id and href on work cards", async () => {
      const html = await renderLibraryPageHtml();

      expect(html).toContain('data-work-id="phi0448.phi001.perseus-lat2"');
      expect(html).toContain('data-work-id="phi0472.phi001.perseus-lat2"');
      expect(html).toContain('href="/work/caesar/de_bello_gallico"');
      expect(html).toContain('href="/work/catullus/carmina"');
      expect(html).toContain('data-first-page="1.1"');
      expect(html).toContain('class="library-work-row"');
      expect(html).toContain(
        '<span class="badge badge-macra">Macronized</span>'
      );
      expect(html).toContain(
        '<span class="badge badge-trans">Translated</span>'
      );
    });

    it("doesn't duplicate the URL, author or title into data attributes", async () => {
      // The client reads the href and the visible text instead; on 126 cards
      // the copies cost ~17 kB of HTML.
      const html = await renderLibraryPageHtml();

      expect(html).not.toContain("data-reader-url=");
      expect(html).not.toContain("data-author=");
      expect(html).not.toContain("data-title=");
    });

    it("heads the page with the Texts tabs, Library current", async () => {
      document.documentElement.innerHTML = await renderLibraryPageHtml();

      const tabs = document.querySelector(".library-header > nav.texts-tabs");
      expect(tabs).not.toBeNull();
      const current = tabs!.querySelectorAll('[aria-current="page"]');
      expect(current).toHaveLength(1);
      expect(current[0].getAttribute("href")).toBe("/library");
      expect(
        [...tabs!.querySelectorAll("a")].map((a) => a.getAttribute("href"))
      ).toEqual(["/library", "/experimentalTexts", "/externalReader"]);
    });

    it("highlights Texts in the app bar", async () => {
      document.documentElement.innerHTML = await renderLibraryPageHtml();

      const navLink = document.querySelector(
        '.nav-desktop a[aria-current="page"]'
      );
      expect(navLink?.getAttribute("href")).toBe("/library");
      expect(navLink?.textContent?.trim()).toBe("Texts");
    });

    it("introduces the library as vetted texts, without links", async () => {
      document.documentElement.innerHTML = await renderLibraryPageHtml();

      const intro = document.querySelector(".library-own-text")!;
      expect(intro.textContent).toBe(
        "Welcome to the library! These texts have been carefully vetted to work well in the reader."
      );
      expect(intro.querySelectorAll("a, br")).toHaveLength(0);
    });

    it("puts the sr-only h1 and description between the tab bar and the search bar", async () => {
      document.documentElement.innerHTML = await renderLibraryPageHtml();

      const header = document.querySelector(".library-header")!;
      expect([...header.children].map((child) => child.classList[0])).toEqual([
        "texts-tabs",
        "sr-only",
        "library-own-text",
        "library-search-form",
        "library-summary-bar",
      ]);
      expect(header.querySelector("h1.sr-only")?.textContent).toBe("Library");
      const count = header.querySelector('[data-role="library-count"]')!;
      expect(count.textContent?.replace(/\s+/g, " ").trim()).toBe(
        "3 works · 2 authors"
      );
      expect(
        header.querySelector('[data-role="library-toggle-all"]')?.textContent
      ).toBe("Collapse all");
      expect(document.querySelectorAll("main")).toHaveLength(1);
    });

    it("groups works into collapsible author cards, sorted by author then title", async () => {
      document.documentElement.innerHTML = await renderLibraryPageHtml();

      const grid = document.querySelector("#library-grid")!;
      const groups = [
        ...grid.querySelectorAll<HTMLDetailsElement>(
          "details.library-author-group[data-author-group]"
        ),
      ];
      expect(groups.map((g) => g.parentElement)).toEqual([grid, grid]);
      expect(groups.every((g) => g.open)).toBe(true);
      expect(
        groups.map((g) => g.querySelector(".library-author-name")!.textContent)
      ).toEqual(["Gaius Julius Caesar", "Gaius Valerius Catullus"]);
      // No work count in the header: it competed with the name for room.
      expect(grid.querySelector('[data-role="author-count"]')).toBeNull();
      expect(grid.querySelector(".author-card-count")).toBeNull();

      const summary = groups[0].firstElementChild!;
      expect(summary.tagName).toBe("SUMMARY");
      expect(summary.classList.contains("library-author-header")).toBe(true);
      // The chevron is drawn in CSS (`.author-card-header::after`), so the
      // header holds just the name.
      expect(summary.children).toHaveLength(1);
      expect(summary.querySelector("svg")).toBeNull();

      // Rows are list items holding the card link and its corner tag.
      const rows = [
        ...groups[0].querySelectorAll(".author-card-list > .library-work-row"),
      ];
      expect(
        rows.map((r) => r.querySelector(".work-card-title")!.textContent)
      ).toEqual(["De Bello Civili", "De Bello Gallico"]);
      for (const row of rows) {
        expect(row.querySelector(":scope > a.work-card")).not.toBeNull();
        expect(
          row.querySelector(":scope > .work-card-corner-tag")
        ).not.toBeNull();
      }
      // The author is the card's heading; the link's label still names it.
      expect(grid.querySelector(".work-card-author")).toBeNull();
      expect(grid.querySelector(CAESAR_SEL)!.getAttribute("aria-label")).toBe(
        "De Bello Gallico by Gaius Julius Caesar"
      );
    });
  });

  describe("MorcusLibraryView", () => {
    function setupLibraryDOM(
      beforeConnect?: (el: MorcusLibraryView) => void
    ): MorcusLibraryView {
      const el = new MorcusLibraryView();
      el.className = "library-view";
      el.innerHTML = `
        <header class="library-header">
          <input type="text" id="library-search-input" />
          <button type="button" id="library-reset-filter-btn">Reset</button>
          <div class="library-filter-pills">
            <button type="button" class="filter-pill active" data-filter="all">All</button>
            <button type="button" class="filter-pill" data-filter="macra">Macronized</button>
            <button type="button" class="filter-pill" data-filter="progress" hidden>In progress</button>
          </div>
          <div class="library-summary-bar">
            <p class="library-count" data-role="library-count">
              <span data-role="library-shown-works">3 works</span> &middot; <span data-role="library-shown-authors">2 authors</span>
            </p>
            <button type="button" class="library-toggle-link" data-role="library-toggle-all">Collapse all</button>
          </div>
        </header>
        <div id="library-empty-state" hidden></div>
        <div class="library-main">
          <div class="library-grid" id="library-grid">
            <details class="library-author-group" data-author-group open>
              <summary class="library-author-header">
                <h2 class="library-author-name">Gaius Julius Caesar</h2>
              </summary>
              <ul class="library-work-list">
                <li class="library-work-row">
                  <a href="/work/caesar/de_bello_civili"
                     class="work-card library-work-link"
                     data-work-id="phi0448.phi002.perseus-lat2"
                     data-first-page="1.1"
                     data-tags="all">
                    <h3 class="work-card-title">De Bello Civili</h3>
                  </a>
                  <div class="work-card-corner-tag"></div>
                </li>
                <li class="library-work-row">
                  <a href="/work/caesar/de_bello_gallico"
                     class="work-card library-work-link"
                     data-work-id="phi0448.phi001.perseus-lat2"
                     data-first-page="1.1"
                     data-tags="all macra">
                    <h3 class="work-card-title">De Bello Gallico</h3>
                  </a>
                  <div class="work-card-corner-tag"><span class="badge badge-macra">Macronized</span></div>
                </li>
              </ul>
            </details>
            <details class="library-author-group" data-author-group open>
              <summary class="library-author-header">
                <h2 class="library-author-name">Gaius Valerius Catullus</h2>
              </summary>
              <ul class="library-work-list">
                <li class="library-work-row">
                  <a href="/work/catullus/carmina"
                     class="work-card library-work-link"
                     data-work-id="phi0472.phi001.perseus-lat2"
                     data-first-page="1"
                     data-tags="all">
                    <h3 class="work-card-title">Carmina</h3>
                  </a>
                  <div class="work-card-corner-tag"></div>
                </li>
              </ul>
            </details>
          </div>
        </div>
      `;
      beforeConnect?.(el);
      document.body.appendChild(el);
      return el;
    }

    const CAESAR = '[data-work-id="phi0448.phi001.perseus-lat2"]';
    const CATULLUS = '[data-work-id="phi0472.phi001.perseus-lat2"]';
    const CIVIL = '[data-work-id="phi0448.phi002.perseus-lat2"]';
    /** The row (list item) around the card matching `sel`. */
    const item = (el: Element, sel: string) =>
      el
        .querySelector<HTMLElement>(sel)!
        .closest<HTMLElement>(".library-work-row")!;
    /** The author card around the card matching `sel`. */
    const group = (el: Element, sel: string) =>
      el
        .querySelector<HTMLElement>(sel)!
        .closest<HTMLDetailsElement>("details[data-author-group]")!;
    /** How many of the author's rows (around `sel`) are shown. */
    const shownInGroup = (el: Element, sel: string) =>
      group(el, sel).querySelectorAll(".library-work-row:not([hidden])").length;

    it("leaves cards un-modified when no saved spots exist", () => {
      const el = setupLibraryDOM();
      const caesarCard = el.querySelector<HTMLAnchorElement>(
        '[data-work-id="phi0448.phi001.perseus-lat2"]'
      )!;

      expect(caesarCard.getAttribute("href")).toBe(
        "/work/caesar/de_bello_gallico"
      );
      expect(item(el, CAESAR).querySelector(".badge-resume")).toBeNull();
      expect(item(el, CAESAR).querySelector(".badge-macra")).not.toBeNull();
      expect(
        item(el, CATULLUS).querySelector(".work-card-corner-tag")?.children
      ).toHaveLength(0);
    });

    it("hydrates card with corner tag and resume jump URL when saved spot exists", () => {
      savedSpotsStore.set("phi0448.phi001.perseus-lat2", "1.4");

      const el = setupLibraryDOM();
      const caesarCard = el.querySelector<HTMLAnchorElement>(
        '[data-work-id="phi0448.phi001.perseus-lat2"]'
      )!;
      const catullusCard = el.querySelector<HTMLAnchorElement>(
        '[data-work-id="phi0472.phi001.perseus-lat2"]'
      )!;

      // Caesar card was hydrated with resume target
      expect(caesarCard.getAttribute("href")).toBe(
        "/work/caesar/de_bello_gallico?jump=1.4#sec-1.4"
      );
      // Beside the link, not in it: it holds a button.
      expect(caesarCard.querySelector(".work-card-corner-tag")).toBeNull();
      const cornerTag = item(el, CAESAR).querySelector<HTMLElement>(
        ".work-card-corner-tag"
      );
      expect(cornerTag).not.toBeNull();
      expect(cornerTag!.textContent).toContain("1.4");
      expect(cornerTag!.textContent).not.toContain("saved");
      expect(cornerTag!.querySelector(".badge-resume svg")).not.toBeNull();
      expect(Array.from(cornerTag!.children).map((c) => c.className)).toEqual([
        "badge badge-macra",
        "badge badge-resume",
      ]);

      // Catullus has no saved spot and remains clean
      expect(catullusCard.getAttribute("href")).toBe("/work/catullus/carmina");
      expect(
        item(el, CATULLUS).querySelector(".work-card-corner-tag")?.children
      ).toHaveLength(0);
    });

    it("shows no badge for a spot on the first page, where the card already goes", () => {
      savedSpotsStore.set("phi0448.phi001.perseus-lat2", "1.1");

      const el = setupLibraryDOM();

      expect(el.querySelector(CAESAR)!.getAttribute("href")).toBe(
        "/work/caesar/de_bello_gallico"
      );
      expect(item(el, CAESAR).querySelector(".badge-resume")).toBeNull();
    });

    it("the clear button forgets the spot and restores the card", () => {
      savedSpotsStore.set("phi0448.phi001.perseus-lat2", "1.4");
      savedSpotsStore.set("phi0472.phi001.perseus-lat2", "5");

      const el = setupLibraryDOM();
      const caesarCard = el.querySelector<HTMLAnchorElement>(CAESAR)!;
      const clear = item(el, CAESAR).querySelector<HTMLButtonElement>(
        ".work-card-clear-spot"
      )!;
      expect(clear.getAttribute("aria-label")).toBe("Clear saved spot (§ 1.4)");

      clear.click();

      expect(
        savedSpotsStore.get("phi0448.phi001.perseus-lat2")
      ).toBeUndefined();
      expect(caesarCard.getAttribute("href")).toBe(
        "/work/caesar/de_bello_gallico"
      );
      expect(item(el, CAESAR).querySelector(".badge-resume")).toBeNull();
      // Caesar keeps its static edition badge in the corner tag.
      expect(item(el, CAESAR).querySelector(".badge-macra")).not.toBeNull();
      expect(document.activeElement).toBe(caesarCard);
      // Other works keep theirs; clearing a card removes its resume badge.
      expect(savedSpotsStore.get("phi0472.phi001.perseus-lat2")).toBe("5");
      expect(item(el, CATULLUS).querySelector(".badge-resume")).not.toBeNull();
      const catullusClear = item(el, CATULLUS).querySelector<HTMLButtonElement>(
        ".work-card-clear-spot"
      )!;
      catullusClear.click();
      expect(item(el, CATULLUS).querySelector(".badge-resume")).toBeNull();
    });

    const progressPill = (el: Element) =>
      el.querySelector<HTMLButtonElement>('[data-filter="progress"]')!;

    it("shows the In progress pill only when a work has a saved spot", () => {
      expect(progressPill(setupLibraryDOM()).hidden).toBe(true);

      document.body.innerHTML = "";
      savedSpotsStore.set("phi0448.phi001.perseus-lat2", "1.4");
      expect(progressPill(setupLibraryDOM()).hidden).toBe(false);
    });

    it("the In progress filter shows only works with a saved spot", () => {
      savedSpotsStore.set("phi0448.phi001.perseus-lat2", "1.4");
      // On the first page: no badge, so not in progress.
      savedSpotsStore.set("phi0472.phi001.perseus-lat2", "1");
      const el = setupLibraryDOM();

      progressPill(el).click();

      expect(progressPill(el).classList.contains("active")).toBe(true);
      expect(item(el, CAESAR).hidden).toBe(false);
      expect(item(el, CATULLUS).hidden).toBe(true);
    });

    it("clearing the last saved spot hides the pill and goes back to All", () => {
      savedSpotsStore.set("phi0448.phi001.perseus-lat2", "1.4");
      const el = setupLibraryDOM();
      progressPill(el).click();
      expect(item(el, CATULLUS).hidden).toBe(true);

      item(el, CAESAR)
        .querySelector<HTMLButtonElement>(".work-card-clear-spot")!
        .click();

      expect(progressPill(el).hidden).toBe(true);
      expect(
        el.querySelector('[data-filter="all"]')!.classList.contains("active")
      ).toBe(true);
      expect(item(el, CAESAR).hidden).toBe(false);
      expect(item(el, CATULLUS).hidden).toBe(false);
    });

    it("filters works correctly with query and tags", () => {
      const el = setupLibraryDOM();
      const input = el.querySelector<HTMLInputElement>(
        "#library-search-input"
      )!;
      // Type "Catullus"
      input.value = "Catullus";
      input.dispatchEvent(new Event("input"));

      expect(item(el, CAESAR).hidden).toBe(true);
      expect(item(el, CATULLUS).hidden).toBe(false);

      // Reset
      const resetBtn = el.querySelector<HTMLButtonElement>(
        "#library-reset-filter-btn"
      )!;
      resetBtn.click();

      expect(item(el, CAESAR).hidden).toBe(false);
      expect(item(el, CATULLUS).hidden).toBe(false);
    });

    it("applies a query typed before upgrade", () => {
      const el = setupLibraryDOM((host) => {
        host.querySelector<HTMLInputElement>("#library-search-input")!.value =
          "Catullus";
      });

      expect(item(el, CAESAR).hidden).toBe(true);
      expect(item(el, CATULLUS).hidden).toBe(false);
    });

    it("matches each query word against the visible author or title, ignoring case", () => {
      const el = setupLibraryDOM();
      const input = el.querySelector<HTMLInputElement>(
        "#library-search-input"
      )!;
      const search = (q: string) => {
        input.value = q;
        input.dispatchEvent(new Event("input"));
      };

      search("GALLICO");
      expect(item(el, CAESAR).hidden).toBe(false);
      expect(item(el, CATULLUS).hidden).toBe(true);

      search("caesar gallico");
      expect(item(el, CAESAR).hidden).toBe(false);
      expect(item(el, CATULLUS).hidden).toBe(true);

      // Every word must match: "carmina" is Catullus's, not Caesar's.
      search("caesar carmina");
      expect(item(el, CAESAR).hidden).toBe(true);
      expect(item(el, CATULLUS).hidden).toBe(true);
    });

    it("the saved-spot badge text doesn't match the filter", () => {
      savedSpotsStore.set("phi0448.phi001.perseus-lat2", "1.4");
      const el = setupLibraryDOM();
      const input = el.querySelector<HTMLInputElement>(
        "#library-search-input"
      )!;

      input.value = "1.4";
      input.dispatchEvent(new Event("input"));

      expect(item(el, CAESAR).hidden).toBe(true);
    });

    it("reconnecting doesn't stack the jump URL or the progress tag", () => {
      savedSpotsStore.set("phi0448.phi001.perseus-lat2", "1.4");
      const el = setupLibraryDOM();
      const caesarCard = el.querySelector<HTMLAnchorElement>(CAESAR)!;

      // Moving the element runs onConnect (and hydration) again.
      el.remove();
      document.body.appendChild(el);

      expect(caesarCard.getAttribute("href")).toBe(
        "/work/caesar/de_bello_gallico?jump=1.4#sec-1.4"
      );
      expect(caesarCard.dataset.tags).toBe("all macra progress");
      expect(
        item(el, CAESAR).querySelectorAll(".work-card-corner-tag")
      ).toHaveLength(1);
      expect(item(el, CAESAR).querySelectorAll(".badge-resume")).toHaveLength(
        1
      );

      item(el, CAESAR)
        .querySelector<HTMLButtonElement>(".work-card-clear-spot")!
        .click();

      expect(caesarCard.getAttribute("href")).toBe(
        "/work/caesar/de_bello_gallico"
      );
      expect(caesarCard.dataset.tags).toBe("all macra");
    });

    it("hides author cards without a match, keeping the rest's matches", () => {
      const el = setupLibraryDOM();
      const input = el.querySelector<HTMLInputElement>(
        "#library-search-input"
      )!;
      const search = (q: string) => {
        input.value = q;
        input.dispatchEvent(new Event("input"));
      };

      search("gallico");
      expect(item(el, CAESAR).hidden).toBe(false);
      expect(item(el, CIVIL).hidden).toBe(true);
      expect(group(el, CAESAR).hidden).toBe(false);
      expect(shownInGroup(el, CAESAR)).toBe(1);
      expect(group(el, CATULLUS).hidden).toBe(true);

      // The author's name matches all their works.
      search("caesar");
      expect(shownInGroup(el, CAESAR)).toBe(2);
      expect(group(el, CATULLUS).hidden).toBe(true);

      el.querySelector<HTMLButtonElement>('[data-filter="macra"]')!.click();
      search("");
      expect(shownInGroup(el, CAESAR)).toBe(1);
      expect(group(el, CATULLUS).hidden).toBe(true);

      el.querySelector<HTMLButtonElement>("#library-reset-filter-btn")!.click();
      expect(group(el, CAESAR).hidden).toBe(false);
      expect(group(el, CATULLUS).hidden).toBe(false);
      expect(shownInGroup(el, CAESAR)).toBe(2);
      expect(shownInGroup(el, CATULLUS)).toBe(1);
    });

    it("unfolds a folded author card holding a match while filtering and restores it when cleared", () => {
      const el = setupLibraryDOM();
      const input = el.querySelector<HTMLInputElement>(
        "#library-search-input"
      )!;
      group(el, CAESAR).open = false;
      // Leave Catullus open so we verify already-open groups stay open.
      group(el, CATULLUS).open = true;

      input.value = "gallico";
      input.dispatchEvent(new Event("input"));
      expect(group(el, CAESAR).open).toBe(true);
      expect(group(el, CATULLUS).hidden).toBe(true);

      // Clearing the filter re-folds auto-opened Caesar, while leaving
      // originally-open Catullus open.
      el.querySelector<HTMLButtonElement>("#library-reset-filter-btn")!.click();
      expect(group(el, CAESAR).open).toBe(false);
      expect(group(el, CATULLUS).open).toBe(true);
      expect(group(el, CATULLUS).hidden).toBe(false);
    });

    it("updates count summary and toggles Collapse all / Expand all", () => {
      const el = setupLibraryDOM();
      const count = el.querySelector('[data-role="library-count"]')!;
      const toggleBtn = el.querySelector<HTMLButtonElement>(
        '[data-role="library-toggle-all"]'
      )!;
      const input = el.querySelector<HTMLInputElement>(
        "#library-search-input"
      )!;

      expect(toggleBtn.textContent).toBe("Collapse all");

      // Collapse all folds both authors and switches button to "Expand all".
      toggleBtn.click();
      expect(group(el, CAESAR).open).toBe(false);
      expect(group(el, CATULLUS).open).toBe(false);
      expect(toggleBtn.textContent).toBe("Expand all");

      // Manually opening one author returns button to "Collapse all".
      group(el, CAESAR).open = true;
      group(el, CAESAR).dispatchEvent(new Event("toggle"));
      expect(toggleBtn.textContent).toBe("Collapse all");

      // Collapse all again, then filter: matching author auto-opens, count updates.
      toggleBtn.click();
      expect(toggleBtn.textContent).toBe("Expand all");

      input.value = "gallico";
      input.dispatchEvent(new Event("input"));
      expect(count.textContent?.replace(/\s+/g, " ").trim()).toBe(
        "1 work · 1 author"
      );
      expect(group(el, CAESAR).open).toBe(true);
      expect(toggleBtn.textContent).toBe("Collapse all");

      // Clearing filter restores collapsed state and "Expand all".
      input.value = "";
      input.dispatchEvent(new Event("input"));
      expect(count.textContent?.replace(/\s+/g, " ").trim()).toBe(
        "3 works · 2 authors"
      );
      expect(group(el, CAESAR).open).toBe(false);
      expect(group(el, CATULLUS).open).toBe(false);
      expect(toggleBtn.textContent).toBe("Expand all");
    });
  });

  describe("author normalization", () => {
    function summary(id: string, author: string, title: string) {
      return {
        id,
        title,
        author,
        urlAuthor: "x",
        urlName: id,
        attribution: "perseus" as const,
        hasMacra: false,
        hasTranslation: false,
        textParts: ["section"],
        paginationDepth: 1,
        pageCount: 1,
        firstPageId: ["1"],
      };
    }

    it("maps the inconsistent Perseus author strings to display names", () => {
      expect(normalizeLibraryAuthorName("L. Annaeus Seneca iunior")).toBe(
        "Seneca the Younger"
      );
      expect(normalizeLibraryAuthorName("Seneca, Lucius Annaeus")).toBe(
        "Seneca the Younger"
      );
      expect(normalizeLibraryAuthorName("Augustine, Saint")).toBe("Augustine");
      expect(normalizeLibraryAuthorName("Jerome, Saint")).toBe("Jerome");
      expect(normalizeLibraryAuthorName("Ausonius, Decimus Magnus")).toBe(
        "Decimus Magnus Ausonius"
      );
      expect(normalizeLibraryAuthorName("Cato, Marcus Porcius")).toBe(
        "Marcus Porcius Cato (Cato the Elder)"
      );
      expect(normalizeLibraryAuthorName("Curtius Rufus, Quintus")).toBe(
        "Quintus Curtius Rufus"
      );
      expect(normalizeLibraryAuthorName("Florus, Lucius Annaeus")).toBe(
        "Lucius Annaeus Florus"
      );
      // Everyone else is shown as Perseus has them.
      expect(normalizeLibraryAuthorName("Seneca the Elder")).toBe(
        "Seneca the Elder"
      );
      expect(normalizeLibraryAuthorName("Gaius Julius Caesar")).toBe(
        "Gaius Julius Caesar"
      );
    });

    it("sorts praenomen-first author cards by their familiar surname sort key", async () => {
      expect(authorSortKey("Decimus Magnus Ausonius")).toBe("Ausonius");
      expect(authorSortKey("Marcus Porcius Cato (Cato the Elder)")).toBe(
        "Cato"
      );
      expect(authorSortKey("Quintus Curtius Rufus")).toBe("Curtius Rufus");
      expect(authorSortKey("Lucius Annaeus Florus")).toBe("Florus");
      expect(authorSortKey("M. Tullius Cicero")).toBe("Cicero, M. Tullius");

      jest
        .mocked(getV2LibrarySummaries)
        .mockResolvedValueOnce([
          summary("flo", "Florus, Lucius Annaeus", "Epitome"),
          summary("cat", "Cato, Marcus Porcius", "De Agricultura"),
          summary("aus", "Ausonius, Decimus Magnus", "Mosella"),
          summary("boe", "Boethius", "Consolatio"),
          summary("cur", "Curtius Rufus, Quintus", "Historiae"),
        ]);
      document.body.innerHTML = await renderLibraryPageHtml();

      const names = [...document.querySelectorAll(".library-author-name")].map(
        (el) => el.textContent
      );
      expect(names).toEqual([
        "Decimus Magnus Ausonius",
        "Boethius",
        "Marcus Porcius Cato (Cato the Elder)",
        "Quintus Curtius Rufus",
        "Lucius Annaeus Florus",
      ]);
    });

    it("merges split authors into one card, keeping the raw name searchable", async () => {
      jest
        .mocked(getV2LibrarySummaries)
        .mockResolvedValueOnce([
          summary("sen1", "L. Annaeus Seneca iunior", "De Ira"),
          summary("sen2", "Seneca, Lucius Annaeus", "Medea"),
          summary("sen3", "Seneca the Elder", "Controversiae"),
          summary("aug1", "Augustine, Saint", "Confessiones"),
        ]);
      document.body.innerHTML = await renderLibraryPageHtml();

      const groups = [
        ...document.querySelectorAll<HTMLDetailsElement>(
          "details.library-author-group"
        ),
      ];
      expect(
        groups.map((g) => g.querySelector(".library-author-name")!.textContent)
      ).toEqual(["Augustine", "Seneca the Elder", "Seneca the Younger"]);
      const younger = groups[2];
      expect(
        [...younger.querySelectorAll(".work-card-title")].map(
          (t) => t.textContent
        )
      ).toEqual(["De Ira", "Medea"]);
      const ira = document.querySelector('[data-work-id="sen1"]')!;
      expect(ira.getAttribute("aria-label")).toBe(
        "De Ira by Seneca the Younger"
      );
      expect(ira.getAttribute("data-alt-author")).toBe(
        "L. Annaeus Seneca iunior"
      );
      // An author already shown as-is carries no alternate spelling.
      expect(
        document
          .querySelector('[data-work-id="sen3"]')!
          .hasAttribute("data-alt-author")
      ).toBe(false);

      const view = document.querySelector("morcus-library-view")!;
      expect(view).toBeInstanceOf(MorcusLibraryView);
      const input = view.querySelector<HTMLInputElement>(
        "#library-search-input"
      )!;
      const shownIds = (q: string) => {
        input.value = q;
        input.dispatchEvent(new Event("input"));
        return [
          ...view.querySelectorAll<HTMLElement>(
            ".library-work-row:not([hidden]) .work-card"
          ),
        ].map((c) => c.dataset.workId);
      };
      expect(shownIds("Seneca, Lucius Annaeus")).toEqual(["sen2"]);
      expect(shownIds("iunior")).toEqual(["sen1"]);
      expect(shownIds("saint")).toEqual(["aug1"]);
      expect(shownIds("younger")).toEqual(["sen1", "sen2"]);
      expect(shownIds("seneca")).toEqual(["sen3", "sen1", "sen2"]);
    });
  });
});
