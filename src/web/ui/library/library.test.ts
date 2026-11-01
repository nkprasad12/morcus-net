/**
 * @jest-environment jsdom
 */
import { renderLibraryPageHtml } from "@/web/ui/library/library.server";
import { MorcusLibraryView } from "@/web/ui/library/library_view.client";
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
      ).toEqual(["/library", "/opentexts", "/externalReader"]);
    });

    it("highlights Texts in the app bar", async () => {
      document.documentElement.innerHTML = await renderLibraryPageHtml();

      const navLink = document.querySelector(
        '.nav-desktop a[aria-current="page"]'
      );
      expect(navLink?.getAttribute("href")).toBe("/library");
      expect(navLink?.textContent?.trim()).toBe("Texts");
    });

    it("points to Open Texts and to reading your own text", async () => {
      document.documentElement.innerHTML = await renderLibraryPageHtml();

      const links = [...document.querySelectorAll(".library-own-text a")];
      expect(links.map((a) => a.getAttribute("href"))).toEqual([
        "/opentexts",
        "/externalReader",
      ]);
    });

    it("puts the description between the tab bar and the search bar", async () => {
      document.documentElement.innerHTML = await renderLibraryPageHtml();

      const header = document.querySelector(".library-header")!;
      expect([...header.children].map((child) => child.classList[0])).toEqual([
        "texts-tabs",
        "library-own-text",
        "library-search-form",
      ]);
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
      expect(
        groups.map(
          (g) => g.querySelector('[data-role="author-count"]')!.textContent
        )
      ).toEqual(["2 works", "1 work"]);

      const summary = groups[0].firstElementChild!;
      expect(summary.tagName).toBe("SUMMARY");
      expect(summary.classList.contains("library-author-header")).toBe(true);
      expect(
        summary
          .querySelector(".author-card-chevron")
          ?.getAttribute("aria-hidden")
      ).toBe("true");

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
        </header>
        <div id="library-empty-state" hidden></div>
        <main class="library-main">
          <div class="library-grid" id="library-grid">
            <details class="library-author-group" data-author-group open>
              <summary class="library-author-header">
                <h2 class="library-author-name">Gaius Julius Caesar</h2>
                <span class="library-author-count" data-role="author-count">2 works</span>
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
                <span class="library-author-count" data-role="author-count">1 work</span>
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
        </main>
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
    const authorCount = (el: Element, sel: string) =>
      group(el, sel).querySelector('[data-role="author-count"]')!.textContent;

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

    it("hides author cards without a match and recounts the rest", () => {
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
      expect(authorCount(el, CAESAR)).toBe("1 work");
      expect(group(el, CATULLUS).hidden).toBe(true);

      // The author's name matches all their works.
      search("caesar");
      expect(authorCount(el, CAESAR)).toBe("2 works");
      expect(group(el, CATULLUS).hidden).toBe(true);

      el.querySelector<HTMLButtonElement>('[data-filter="macra"]')!.click();
      search("");
      expect(authorCount(el, CAESAR)).toBe("1 work");
      expect(group(el, CATULLUS).hidden).toBe(true);

      el.querySelector<HTMLButtonElement>("#library-reset-filter-btn")!.click();
      expect(group(el, CAESAR).hidden).toBe(false);
      expect(group(el, CATULLUS).hidden).toBe(false);
      expect(authorCount(el, CAESAR)).toBe("2 works");
      expect(authorCount(el, CATULLUS)).toBe("1 work");
    });

    it("unfolds a folded author card holding a match, only while filtering", () => {
      const el = setupLibraryDOM();
      const input = el.querySelector<HTMLInputElement>(
        "#library-search-input"
      )!;
      group(el, CAESAR).open = false;
      group(el, CATULLUS).open = false;

      input.value = "gallico";
      input.dispatchEvent(new Event("input"));
      expect(group(el, CAESAR).open).toBe(true);
      // No match: hidden, and left folded as the user had it.
      expect(group(el, CATULLUS).open).toBe(false);

      group(el, CAESAR).open = false;
      el.querySelector<HTMLButtonElement>("#library-reset-filter-btn")!.click();
      expect(group(el, CAESAR).open).toBe(false);
      expect(group(el, CATULLUS).hidden).toBe(false);
    });
  });
});
