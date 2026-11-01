/**
 * @jest-environment jsdom
 */

import { SEED_OPEN_TEXTS_CATALOG_BUNDLE } from "@/common/open_texts/catalog_loader";
import { renderOpenTextsCatalogContentHtml } from "@/web/ui/open_texts/open_texts.server";
import { MorcusOpenTextsView } from "@/web/ui/open_texts/open_texts_view.client";

const ENTRIES = SEED_OPEN_TEXTS_CATALOG_BUNDLE.entries;

function mount(): MorcusOpenTextsView {
  document.body.innerHTML = renderOpenTextsCatalogContentHtml(
    SEED_OPEN_TEXTS_CATALOG_BUNDLE
  );
  const el = document.querySelector("morcus-open-texts-view");
  expect(el).toBeInstanceOf(MorcusOpenTextsView);
  return el as MorcusOpenTextsView;
}

function input(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>("#open-texts-search-input")!;
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
    document.querySelectorAll<HTMLElement>(".open-texts-work-item")
  )
    .filter((li) => !li.hidden)
    .map((li) => li.querySelector(".open-texts-work-link")!.textContent!);
}

function visibleAuthors(): string[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(".open-texts-author-group")
  )
    .filter((g) => !g.hidden)
    .map((g) => g.querySelector(".open-texts-author-name")!.textContent!);
}

/** The summary as the user sees it: without its hidden parts. */
function countText(): string {
  const count = document
    .querySelector('[data-role="open-texts-count"]')!
    .cloneNode(true) as HTMLElement;
  count.querySelectorAll("[hidden]").forEach((el) => el.remove());
  return count.textContent!.replace(/\s+/g, " ").trim();
}

function titlesWhere(pred: (e: (typeof ENTRIES)[number]) => boolean) {
  return ENTRIES.filter(pred)
    .map((e) => e.title)
    .sort();
}

describe("MorcusOpenTextsView", () => {
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
      document.querySelector<HTMLElement>('[data-role="open-texts-reset"]')!
        .hidden
    ).toBe(true);
  });

  test("filters by author, title and volume label as the user types", () => {
    mount();
    type("ambros");
    expect(visibleAuthors()).toEqual(["Ambrosius"]);
    expect(visibleTitles().sort()).toEqual(
      titlesWhere((e) => e.author === "Ambrosius")
    );

    type("ministrorum");
    expect(visibleTitles()).toEqual(["De Officiis Ministrorum Libri Tres"]);
    expect(countText()).toBe(
      `Showing 1 work across 1 author (filtered from ${ENTRIES.length} total)`
    );
    const group = document.querySelector("#author-ambrosius")!;
    expect(group.querySelector(".open-texts-author-count")!.textContent).toBe(
      "1 work"
    );

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

    click('[data-period-filter="patristic"]');
    expect(visibleTitles().sort()).toEqual(
      titlesWhere(
        (e) => e.source === "thelatinlibrary" && e.period === "patristic"
      )
    );

    click('[data-source-filter="all"]');
    click('[data-period-filter="all"]');
    expect(visibleTitles()).toHaveLength(ENTRIES.length);
    expect(
      document.querySelector<HTMLElement>('[data-role="open-texts-reset"]')!
        .hidden
    ).toBe(true);
  });

  test("shows the empty state, and both reset buttons clear every filter", () => {
    mount();
    const empty = document.querySelector<HTMLElement>(
      "#open-texts-empty-state"
    )!;
    for (const reset of [
      '[data-role="open-texts-empty-reset"]',
      '[data-role="open-texts-reset"]',
    ]) {
      click('[data-period-filter="medieval"]');
      type("no_such_author_or_work_xyz");
      expect(visibleTitles()).toEqual([]);
      expect(visibleAuthors()).toEqual([]);
      expect(empty.hidden).toBe(false);
      expect(countText()).toBe(
        `Showing 0 works across 0 authors (filtered from ${ENTRIES.length} total)`
      );

      click(reset);
      expect(input().value).toBe("");
      expect(visibleTitles()).toHaveLength(ENTRIES.length);
      expect(empty.hidden).toBe(true);
      expect(
        document
          .querySelector('[data-period-filter="all"]')!
          .classList.contains("active")
      ).toBe(true);
      expect(countText()).not.toContain("filtered");
    }
  });

  test("adopts a query typed before upgrade", () => {
    document.body.innerHTML = renderOpenTextsCatalogContentHtml(
      SEED_OPEN_TEXTS_CATALOG_BUNDLE
    ).replace(
      'id="open-texts-search-input"',
      'id="open-texts-search-input" value="apicius"'
    );
    expect(visibleAuthors()).toEqual(["Apicius"]);
  });

  test("author cards start open, and a match unfolds a folded card", () => {
    mount();
    const groups = Array.from(
      document.querySelectorAll<HTMLDetailsElement>(".open-texts-author-group")
    );
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.every((g) => g.tagName === "DETAILS" && g.open)).toBe(true);

    const ambrose =
      document.querySelector<HTMLDetailsElement>("#author-ambrosius")!;
    const other = groups.find((g) => g !== ambrose)!;
    ambrose.open = false;
    other.open = false;

    type("ambros");
    expect(ambrose.open).toBe(true);
    // Cards without a match stay as the user left them.
    expect(other.hidden).toBe(true);
    expect(other.open).toBe(false);

    // Unfiltered, nothing is reopened behind the user's back.
    ambrose.open = false;
    click('[data-role="open-texts-reset"]');
    expect(ambrose.open).toBe(false);
    expect(other.hidden).toBe(false);
  });

  test("never touches the URL", () => {
    mount();
    type("augustin");
    click('[data-source-filter="patrologia_latina"]');
    click('[data-role="open-texts-reset"]');
    expect(replaceState).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
  });
});
