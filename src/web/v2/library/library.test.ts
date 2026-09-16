/**
 * @jest-environment jsdom
 */
import { renderLibraryPageHtml } from "@/web/v2/library/library.server";
import { MorcusLibraryView } from "@/web/v2/library/library_view.client";
import { savedSpotsStore } from "@/web/v2/reader/saved_spots.client";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () => ({
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
      expect(html).toContain(
        'data-reader-url="/v2/reader/caesar/de_bello_gallico"'
      );
      expect(html).toContain('data-work-id="phi0472.phi001.perseus-lat2"');
      expect(html).toContain('data-reader-url="/v2/reader/catullus/carmina"');
      expect(html).toContain('href="/v2/reader/caesar/de_bello_gallico"');
    });
  });

  describe("MorcusLibraryView", () => {
    function setupLibraryDOM(): MorcusLibraryView {
      const el = new MorcusLibraryView();
      el.className = "library-view";
      el.innerHTML = `
        <header class="library-header">
          <input type="search" id="library-search-input" />
          <button type="button" id="library-reset-filter-btn">Reset</button>
          <div class="library-filter-pills">
            <button type="button" class="filter-pill active" data-filter="all">All</button>
            <button type="button" class="filter-pill" data-filter="macra">Macronized</button>
          </div>
        </header>
        <div id="library-empty-state" hidden></div>
        <main class="library-main">
          <div class="library-grid">
            <a href="/v2/reader/caesar/de_bello_gallico"
               class="card card-interactive work-card"
               data-work-id="phi0448.phi001.perseus-lat2"
               data-reader-url="/v2/reader/caesar/de_bello_gallico"
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
            <a href="/v2/reader/catullus/carmina"
               class="card card-interactive work-card"
               data-work-id="phi0472.phi001.perseus-lat2"
               data-reader-url="/v2/reader/catullus/carmina"
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
        </main>
      `;
      document.body.appendChild(el);
      return el;
    }

    it("leaves cards un-modified when no saved spots exist", () => {
      const el = setupLibraryDOM();
      const caesarCard = el.querySelector<HTMLAnchorElement>(
        '[data-work-id="phi0448.phi001.perseus-lat2"]'
      )!;

      expect(caesarCard.getAttribute("href")).toBe(
        "/v2/reader/caesar/de_bello_gallico"
      );
      expect(caesarCard.querySelector(".work-card-corner-tag")).toBeNull();
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
        "/v2/reader/caesar/de_bello_gallico?jump=1.4#sec-1.4"
      );
      const cornerTag = caesarCard.querySelector<HTMLElement>(
        ".work-card-corner-tag"
      );
      expect(cornerTag).not.toBeNull();
      expect(cornerTag!.textContent).toContain("§\u00a01.4");
      expect(cornerTag!.textContent).toContain("saved");
      expect(cornerTag!.querySelector(".badge-resume")).not.toBeNull();

      // Catullus has no saved spot and remains clean
      expect(catullusCard.getAttribute("href")).toBe(
        "/v2/reader/catullus/carmina"
      );
      expect(catullusCard.querySelector(".work-card-corner-tag")).toBeNull();
    });

    it("filters works correctly with query and tags", () => {
      const el = setupLibraryDOM();
      const input = el.querySelector<HTMLInputElement>(
        "#library-search-input"
      )!;
      const caesarCard = el.querySelector<HTMLElement>(
        '[data-work-id="phi0448.phi001.perseus-lat2"]'
      )!;
      const catullusCard = el.querySelector<HTMLElement>(
        '[data-work-id="phi0472.phi001.perseus-lat2"]'
      )!;

      // Type "Catullus"
      input.value = "Catullus";
      input.dispatchEvent(new Event("input"));

      expect(caesarCard.hidden).toBe(true);
      expect(catullusCard.hidden).toBe(false);

      // Reset
      const resetBtn = el.querySelector<HTMLButtonElement>(
        "#library-reset-filter-btn"
      )!;
      resetBtn.click();

      expect(caesarCard.hidden).toBe(false);
      expect(catullusCard.hidden).toBe(false);
    });
  });
});
