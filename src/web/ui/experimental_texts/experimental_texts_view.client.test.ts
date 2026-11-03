/**
 * @jest-environment jsdom
 */

import { EXPERIMENTAL_TEXTS_TEST_CATALOG } from "@/web/ui/experimental_texts/experimental_texts_test_catalog";
import { normalizeExperimentalTextCatalogEntries } from "@/common/experimental_texts/catalog_normalizer";
import { renderExperimentalTextsCatalogContentHtml } from "@/web/ui/experimental_texts/experimental_texts.server";
import { MorcusExperimentalTextsView } from "@/web/ui/experimental_texts/experimental_texts_view.client";

const ENTRIES = EXPERIMENTAL_TEXTS_TEST_CATALOG.entries;

function mount(): MorcusExperimentalTextsView {
  document.body.innerHTML = renderExperimentalTextsCatalogContentHtml(
    EXPERIMENTAL_TEXTS_TEST_CATALOG
  );
  const el = document.querySelector("morcus-experimental-texts-view");
  expect(el).toBeInstanceOf(MorcusExperimentalTextsView);
  return el as MorcusExperimentalTextsView;
}

function input(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(
    "#experimental-texts-search-input"
  )!;
}

function type(text: string) {
  input().value = text;
  input().dispatchEvent(new Event("input", { bubbles: true }));
}

function click(selector: string) {
  document
    .querySelector<HTMLElement>(selector)!
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function visibleTitles(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(".experimental-texts-work-item")
  )
    .filter((li) => !li.hidden)
    .map(
      (li) => li.querySelector(".experimental-texts-work-link")!.textContent!
    );
}

function visibleAuthors(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(".experimental-texts-author-group")
  )
    .filter((g) => !g.hidden)
    .map(
      (g) => g.querySelector(".experimental-texts-author-name")!.textContent!
    );
}

/** The summary as the user sees it: without its hidden parts. */
function countText(): string {
  const count = document
    .querySelector('[data-role="experimental-texts-count"]')!
    .cloneNode(true) as HTMLElement;
  count.querySelectorAll("[hidden]").forEach((el) => el.remove());
  return count.textContent!.replace(/\s+/g, " ").trim();
}

function titlesWhere(pred: (e: (typeof ENTRIES)[number]) => boolean) {
  return ENTRIES.filter(pred)
    .map((e) => e.title)
    .sort();
}

describe("MorcusExperimentalTextsView", () => {
  let replaceState: jest.SpyInstance;
  let pushState: jest.SpyInstance;

  beforeEach(() => {
    replaceState = jest.spyOn(history, "replaceState");
    pushState = jest.spyOn(history, "pushState");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  test("shows everything until the user filters", () => {
    mount();
    expect(visibleTitles()).toHaveLength(ENTRIES.length);
    expect(
      document.querySelector<HTMLElement>(
        '[data-role="experimental-texts-toggle-all"]'
      )!.textContent
    ).toBe("Collapse all");
  });

  test("filters by author, title and volume label as the user types", () => {
    mount();
    type("ambros");
    expect(visibleAuthors()).toEqual([
      "Ambrosius Mediolanensis (Saint Ambrose)",
    ]);
    expect(visibleTitles().sort()).toEqual(
      titlesWhere((e) => e.author === "Ambrosius Mediolanensis (Saint Ambrose)")
    );

    type("ministrorum");
    expect(visibleTitles()).toEqual(["De Officiis Ministrorum Libri Tres"]);
    expect(countText()).toBe("1 work · 1 author");
    const group = document.querySelector(
      "#author-ambrosius-mediolanensis-saint-ambrose"
    )!;
    expect(
      group.querySelectorAll(".experimental-texts-work-item:not([hidden])")
    ).toHaveLength(1);

    // Every token must match; the volume label is searchable.
    type("PL 16");
    expect(visibleTitles().sort()).toEqual(
      titlesWhere((e) => e.volumeLabel === "PL 16")
    );
  });

  test("source and period pills filter and combine with the query", () => {
    mount();
    click('[data-source-filter="thelatinlibrary"]');
    expect(visibleTitles().sort()).toEqual(
      titlesWhere((e) => e.source === "thelatinlibrary")
    );
    const pill = document.querySelector<HTMLElement>(
      '[data-source-filter="thelatinlibrary"]'
    )!;
    expect(pill.classList.contains("active")).toBe(true);
    expect(pill.getAttribute("aria-pressed")).toBe("true");
    expect(
      document
        .querySelector('[data-source-filter="all"]')!
        .getAttribute("aria-pressed")
    ).toBe("false");

    click('[data-period-filter="ancient"]');
    expect(visibleTitles().sort()).toEqual(
      titlesWhere(
        (e) => e.source === "thelatinlibrary" && e.period === "ancient"
      )
    );

    click('[data-source-filter="all"]');
    click('[data-period-filter="all"]');
    expect(visibleTitles()).toHaveLength(ENTRIES.length);
  });

  test("shows the empty state, and empty-state reset clears every filter", () => {
    mount();
    const empty = document.querySelector<HTMLElement>(
      "#experimental-texts-empty-state"
    )!;
    const toggleAll = document.querySelector<HTMLElement>(
      '[data-role="experimental-texts-toggle-all"]'
    )!;
    click('[data-period-filter="medieval"]');
    type("no_such_author_or_work_xyz");
    expect(visibleTitles()).toEqual([]);
    expect(visibleAuthors()).toEqual([]);
    expect(empty.hidden).toBe(false);
    expect(toggleAll.hidden).toBe(true);
    expect(countText()).toBe("0 works · 0 authors");

    click('[data-role="experimental-texts-empty-reset"]');
    expect(input().value).toBe("");
    expect(visibleTitles()).toHaveLength(ENTRIES.length);
    expect(empty.hidden).toBe(true);
    expect(toggleAll.hidden).toBe(false);
    expect(
      document
        .querySelector('[data-period-filter="all"]')!
        .classList.contains("active")
    ).toBe(true);
  });

  test("adopts a query typed before upgrade", () => {
    document.body.innerHTML = renderExperimentalTextsCatalogContentHtml(
      EXPERIMENTAL_TEXTS_TEST_CATALOG
    ).replace(
      'id="experimental-texts-search-input"',
      'id="experimental-texts-search-input" value="apicius"'
    );
    expect(visibleAuthors()).toEqual(["Apicius"]);
  });

  test("author cards start open, a match unfolds a folded card, and clearing restores it", () => {
    mount();
    const groups = Array.from(
      document.querySelectorAll<HTMLDetailsElement>(
        ".experimental-texts-author-group"
      )
    );
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.every((g) => g.tagName === "DETAILS" && g.open)).toBe(true);

    const ambrose = document.querySelector<HTMLDetailsElement>(
      "#author-ambrosius-mediolanensis-saint-ambrose"
    )!;
    const other = groups.find((g) => g !== ambrose)!;
    ambrose.open = false;

    type("ambros");
    expect(ambrose.open).toBe(true);
    expect(other.hidden).toBe(true);

    // Clearing the filter restores auto-opened Ambrose to folded while leaving
    // originally-open cards open.
    type("");
    expect(ambrose.open).toBe(false);
    expect(other.open).toBe(true);
    expect(other.hidden).toBe(false);
  });

  test("Collapse all / Expand all toggles cards and syncs with manual card toggles", () => {
    mount();
    const groups = Array.from(
      document.querySelectorAll<HTMLDetailsElement>(
        ".experimental-texts-author-group"
      )
    );
    const toggleBtn = document.querySelector<HTMLButtonElement>(
      '[data-role="experimental-texts-toggle-all"]'
    )!;
    expect(toggleBtn.textContent).toBe("Collapse all");

    //Manually closing one card keeps "Collapse all" while others remain open.
    groups[0].open = false;
    groups[0].dispatchEvent(new Event("toggle"));
    expect(toggleBtn.textContent).toBe("Collapse all");

    // Clicking "Collapse all" folds every card and flips to "Expand all".
    toggleBtn.click();
    expect(groups.every((g) => !g.open)).toBe(true);
    expect(toggleBtn.textContent).toBe("Expand all");

    // Manually opening one card flips the button back to "Collapse all".
    groups[0].open = true;
    groups[0].dispatchEvent(new Event("toggle"));
    expect(toggleBtn.textContent).toBe("Collapse all");

    // Clicking "Collapse all" folds that card again; clicking "Expand all" opens all.
    toggleBtn.click();
    expect(groups.every((g) => !g.open)).toBe(true);
    expect(toggleBtn.textContent).toBe("Expand all");

    toggleBtn.click();
    expect(groups.every((g) => g.open)).toBe(true);
    expect(toggleBtn.textContent).toBe("Collapse all");
  });

  test("never touches the URL", () => {
    mount();
    type("augustin");
    click('[data-source-filter="patrologia_latina"]');
    type("");
    click('[data-source-filter="all"]');
    expect(replaceState).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
  });

  test("matches an author's other names, from the normalized catalog", () => {
    // Built the way the catalog builder does: Hieronymus is shown as Jerome,
    // Augustine, Saint as Augustine, and their other names stay searchable.
    const entries = normalizeExperimentalTextCatalogEntries([
      ...ENTRIES,
      {
        ...ENTRIES[0],
        id: "pl/jerome",
        author: "Hieronymus",
        title: "Epistolae",
      },
      {
        ...ENTRIES[0],
        id: "ll/augustine",
        source: "thelatinlibrary",
        author: "Augustine, Saint",
        title: "Confessiones",
      },
    ]);
    document.body.innerHTML = renderExperimentalTextsCatalogContentHtml({
      ...EXPERIMENTAL_TEXTS_TEST_CATALOG,
      entries,
    });
    const jerome = document
      .querySelector('a[href="/experimentalTexts?open=pl%2Fjerome"]')!
      .closest<HTMLElement>(".experimental-texts-author-group")!;
    expect(jerome.dataset.author).toBe("hieronymus · eusebius hieronymus");

    type("hieronymus");
    expect(visibleAuthors()).toEqual(["Jerome"]);
    type("jerome");
    expect(visibleAuthors()).toEqual(["Jerome"]);
    // `Augustinus` (PL) and `Augustine, Saint` (LL) are one author now.
    type("augustinus");
    expect(visibleAuthors()).toEqual(["Augustine"]);
    expect(visibleTitles().sort()).toEqual([
      "Confessiones",
      "De Doctrina Christiana Libri Quattuor",
    ]);
    type("saint confessiones");
    expect(visibleTitles()).toEqual(["Confessiones"]);
  });
});
