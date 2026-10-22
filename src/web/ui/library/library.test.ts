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
  ]),
}));

describe("library SSR & client hydration", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  describe("renderLibraryPageHtml", () => {
    it("emits data-work-id and data-reader-url on work cards", async () => {
      const html = await renderLibraryPageHtml();

      expect(html).toContain('data-work-id="phi0448.phi001.perseus-lat2"');
      expect(html).toContain('data-reader-url="/work/caesar/de_bello_gallico"');
      expect(html).toContain('data-work-id="phi0472.phi001.perseus-lat2"');
      expect(html).toContain('data-reader-url="/work/catullus/carmina"');
      expect(html).toContain('href="/work/caesar/de_bello_gallico"');
      expect(html).toContain('data-first-page="1.1"');
      expect(html).toContain('class="work-card-item"');
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
          <input type="search" id="library-search-input" />
          <button type="button" id="library-reset-filter-btn">Reset</button>
          <div class="library-filter-pills">
            <button type="button" class="filter-pill active" data-filter="all">All</button>
            <button type="button" class="filter-pill" data-filter="macra">Macronized</button>
            <button type="button" class="filter-pill" data-filter="progress" hidden>In progress</button>
          </div>
        </header>
        <div id="library-empty-state" hidden></div>
        <main class="library-main">
          <div class="library-grid">
            <div class="work-card-item">
            <a href="/work/caesar/de_bello_gallico"
               class="card card-interactive work-card"
               data-work-id="phi0448.phi001.perseus-lat2"
               data-reader-url="/work/caesar/de_bello_gallico"
               data-first-page="1.1"
               data-author="gaius julius caesar"
               data-title="de bello gallico"
               data-tags="all macra">
              <div class="work-card-content">
                <span class="work-card-author">Gaius Julius Caesar</span>
                <h2 class="work-card-title">De Bello Gallico</h2>
                <div class="work-card-badges">
                  <span class="badge badge-macra">Macronized</span>
                </div>
              </div>
            </a>
            </div>
            <div class="work-card-item">
            <a href="/work/catullus/carmina"
               class="card card-interactive work-card"
               data-work-id="phi0472.phi001.perseus-lat2"
               data-reader-url="/work/catullus/carmina"
               data-first-page="1"
               data-author="gaius valerius catullus"
               data-title="carmina"
               data-tags="all">
              <div class="work-card-content">
                <span class="work-card-author">Gaius Valerius Catullus</span>
                <h2 class="work-card-title">Carmina</h2>
                <div class="work-card-badges"></div>
              </div>
            </a>
            </div>
          </div>
        </main>
      `;
      beforeConnect?.(el);
      document.body.appendChild(el);
      return el;
    }

    const CAESAR = '[data-work-id="phi0448.phi001.perseus-lat2"]';
    const CATULLUS = '[data-work-id="phi0472.phi001.perseus-lat2"]';
    /** The grid item (wrapper) around the card matching `sel`. */
    const item = (el: Element, sel: string) =>
      el
        .querySelector<HTMLElement>(sel)!
        .closest<HTMLElement>(".work-card-item")!;

    it("leaves cards un-modified when no saved spots exist", () => {
      const el = setupLibraryDOM();
      const caesarCard = el.querySelector<HTMLAnchorElement>(
        '[data-work-id="phi0448.phi001.perseus-lat2"]'
      )!;

      expect(caesarCard.getAttribute("href")).toBe(
        "/work/caesar/de_bello_gallico"
      );
      expect(
        item(el, CAESAR).querySelector(".work-card-corner-tag")
      ).toBeNull();
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
      expect(cornerTag!.textContent).toContain("§\u00a01.4");
      expect(cornerTag!.textContent).toContain("saved");
      expect(cornerTag!.querySelector(".badge-resume")).not.toBeNull();

      // Catullus has no saved spot and remains clean
      expect(catullusCard.getAttribute("href")).toBe("/work/catullus/carmina");
      expect(
        item(el, CATULLUS).querySelector(".work-card-corner-tag")
      ).toBeNull();
    });

    it("shows no badge for a spot on the first page, where the card already goes", () => {
      savedSpotsStore.set("phi0448.phi001.perseus-lat2", "1.1");

      const el = setupLibraryDOM();

      expect(el.querySelector(CAESAR)!.getAttribute("href")).toBe(
        "/work/caesar/de_bello_gallico"
      );
      expect(
        item(el, CAESAR).querySelector(".work-card-corner-tag")
      ).toBeNull();
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
      expect(
        item(el, CAESAR).querySelector(".work-card-corner-tag")
      ).toBeNull();
      expect(document.activeElement).toBe(caesarCard);
      // Other works keep theirs.
      expect(savedSpotsStore.get("phi0472.phi001.perseus-lat2")).toBe("5");
      expect(
        item(el, CATULLUS).querySelector(".work-card-corner-tag")
      ).not.toBeNull();
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
  });
});
