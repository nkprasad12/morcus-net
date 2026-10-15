/**
 * @jest-environment jsdom
 */

import {
  CONTEXT_LEN,
  PAGE_SIZE,
  type CorpusParams,
} from "@/web/v2/corpus/corpus_params.common";
import {
  runCorpusSearch,
  type CorpusSearchView,
} from "@/web/v2/corpus/corpus_query.server";
import { CORPUS_SLOTS } from "@/web/v2/corpus/corpus_slots.common";
import { INFLECTION_CATEGORIES } from "@/web/v2/corpus/corpus_syntax.common";
import {
  renderCorpusPageHtml,
  renderCorpusPartialHtml,
  renderCorpusUnavailableHtml,
} from "@/web/v2/corpus/corpus_view.server";
import {
  CORPUS_TEST_AUTHORS,
  fakeCorpusEngine,
  fakeMatch,
  fakeResult,
} from "@/web/v2/testing/fake_corpus_engine";
import { expectSlotParity } from "@/web/v2/testing/slot_parity";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "",
  getV2CriticalJs: () => "",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

const BASE: CorpusParams = {
  q: "omnis",
  pageSize: PAGE_SIZE.default,
  contextLen: CONTEXT_LEN.default,
  strictMode: false,
};

const NEXT = { resultId: 2, resultIndex: 50, candidateIndex: 1 };

function search(
  params: Partial<CorpusParams> = {},
  engine = fakeCorpusEngine()
): Promise<CorpusSearchView> {
  return runCorpusSearch({ ...BASE, ...params }, engine, CORPUS_TEST_AUTHORS);
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function text(doc: Document, selector: string): string {
  return (doc.querySelector(selector)?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("corpus page", () => {
  test("landing: form, open help, welcome, no results or pager", async () => {
    const doc = parse(renderCorpusPageHtml(await search({ q: "" })));

    expect(doc.title).toBe("Corpus Query - Morcus Latin Tools");
    const form = doc.querySelector("form.corpus-form");
    expect(form?.getAttribute("action")).toBe("/v2/corpus");
    expect(form?.getAttribute("method")).toBe("GET");
    expect(doc.querySelector("details.corpus-help")?.hasAttribute("open")).toBe(
      true
    );
    expect(text(doc, ".corpus-welcome-card")).toContain(
      "About the classical corpus search engine"
    );
    expect(doc.querySelector(".corpus-result")).toBeNull();
    expect(doc.querySelector(".corpus-next")).toBeNull();
  });

  test("the form is prefilled from the params", async () => {
    const doc = parse(
      renderCorpusPageHtml(
        await search({ q: "#Caesar bellum", contextLen: 7, pageSize: 25 })
      )
    );
    const value = (name: string) =>
      doc.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value;
    expect(value("q")).toBe("#Caesar bellum");
    expect(value("contextLen")).toBe("7");
    expect(value("pageSize")).toBe("25");
    expect(
      doc.querySelector<HTMLInputElement>('[name="strictMode"]')?.checked
    ).toBe(false);
    expect(text(doc, "[data-slot=settings-summary]")).toBe(
      "Context 7 • Page size 25 • Inflections Relaxed"
    );
  });

  test("results: summary, snippet highlighting, and reader links", async () => {
    const doc = parse(renderCorpusPageHtml(await search()));

    expect(doc.title).toBe("Corpus: omnis - Morcus Latin Tools");
    expect(
      doc.querySelector("details.corpus-syntax-details")?.hasAttribute("open")
    ).toBe(false);
    expect(text(doc, ".corpus-summary-headline")).toContain(
      "Found 1 results matching omnis"
    );
    expect(text(doc, ".corpus-beta-chip")).toBe("Beta");
    expect(text(doc, ".corpus-summary-detail")).toContain(
      "~3M words / ½ classical corpus indexed"
    );
    expect(doc.querySelector(".corpus-syntax-link")?.textContent).toContain(
      "Syntax guide"
    );
    const heading = doc.querySelector<HTMLAnchorElement>(
      "a.corpus-result-heading"
    );
    expect(heading?.textContent?.trim()).toBe("De Bello Gallico 1.1 [Caesar]");
    expect(heading?.getAttribute("href")).toMatch(
      /^\/v2\/work\/caesar\/de_bello_gallico\?matchText=/
    );
    expect(text(doc, "mark.corpus-match")).toBe("omnis");
    expect(text(doc, ".corpus-snippet")).toBe(
      "Gallia est omnis divisa in partes tres"
    );
  });

  test("escapes query text and snippets", async () => {
    const doc = parse(
      renderCorpusPageHtml(
        await search(
          { q: "amoris" },
          fakeCorpusEngine(() =>
            fakeResult({
              matches: [fakeMatch({}, [["<b>x</b>", true]])],
            })
          )
        )
      )
    );
    expect(doc.querySelector(".corpus-snippet b")).toBeNull();
    expect(text(doc, "mark.corpus-match")).toBe("<b>x</b>");
  });

  test("a next page renders a No-JS pager link with the cursor", async () => {
    const view = await search(
      {},
      fakeCorpusEngine(() =>
        fakeResult({ resultStats: { estimatedResults: 200 }, nextPage: NEXT })
      )
    );
    const doc = parse(renderCorpusPageHtml(view));

    expect(doc.querySelector(".corpus-next")?.getAttribute("href")).toBe(
      "/v2/corpus?q=omnis&contextLen=20&pageSize=50&cursor=2-50-1"
    );
    expect(doc.querySelector(".corpus-next svg")).not.toBeNull();
    expect(doc.querySelector(".corpus-next")?.getAttribute("aria-label")).toBe(
      "Next page"
    );
    expect(text(doc, ".corpus-summary-headline")).toContain(
      "Found about 200 results matching omnis"
    );
    expect(text(doc, ".corpus-summary-detail")).toContain(
      "Showing results 1 to 1"
    );
  });

  test("no results: message, expanded query guide, no pager", async () => {
    const doc = parse(
      renderCorpusPageHtml(
        await search(
          {},
          fakeCorpusEngine(() =>
            fakeResult({ matches: [], resultStats: { estimatedResults: 0 } })
          )
        )
      )
    );
    expect(text(doc, ".corpus-summary-headline")).toContain(
      "No results found for omnis"
    );
    expect(doc.querySelector("details.corpus-help")?.hasAttribute("open")).toBe(
      true
    );
    expect(text(doc, ".guide-title")).toBe("How to write queries");
    expect(doc.querySelector(".corpus-result")).toBeNull();
    expect(doc.querySelector(".corpus-next")).toBeNull();
  });

  test("errors render as an alert", async () => {
    const doc = parse(renderCorpusPageHtml(await search({ q: "#Nobody x" })));
    const alert = doc.querySelector("[role=alert]");
    expect(alert?.textContent).toContain("#Nobody x");
  });

  test("the syntax guide lists every inflection category and its values from the grammar", async () => {
    const doc = parse(renderCorpusPageHtml(await search({ q: "" })));
    const desktopCategories = text(
      doc,
      ".desktop-guide-view details.guide-categories"
    );
    const mobileCategories = text(
      doc,
      ".mobile-guide-container details.guide-categories"
    );
    for (const [category, values] of INFLECTION_CATEGORIES) {
      expect(desktopCategories).toContain(`@${category}`);
      expect(mobileCategories).toContain(`@${category}`);
      for (const value of values.keys()) {
        expect(desktopCategories).toContain(value);
        expect(mobileCategories).toContain(value);
      }
    }
  });

  test("the inflection disclaimer only shows for inflection filters", async () => {
    const plain = parse(renderCorpusPageHtml(await search()));
    const inflected = parse(
      renderCorpusPageHtml(await search({ q: "@case:dat" }))
    );
    const summaries = (doc: Document) =>
      Array.from(
        doc.querySelectorAll(".corpus-inflection-notice > summary")
      ).map((s) => s.textContent?.trim());
    expect(summaries(plain)).toHaveLength(0);
    expect(summaries(inflected)).toContain(
      "Inflected match may include false positives"
    );
    expect(
      inflected.querySelector(".corpus-inflection-notice")?.hasAttribute("open")
    ).toBe(false);
  });

  test("strict mode is reflected in the checkbox and tray", async () => {
    const doc = parse(renderCorpusPageHtml(await search({ strictMode: true })));
    expect(
      doc.querySelector<HTMLInputElement>('[name="strictMode"]')?.checked
    ).toBe(true);
    expect(text(doc, ".inflect-chip.is-on")).toBe("Strict");
  });

  test("the autocomplete host: JS-only, pointing at the input, with the authors", async () => {
    const doc = parse(renderCorpusPageHtml(await search()));
    const host = doc.querySelector<HTMLElement>("morcus-corpus-suggestions");
    const input = doc.querySelector("input[name=q]");

    expect(host?.hasAttribute("data-js-only")).toBe(true);
    expect(host?.closest("form")).toBe(input?.closest("form"));
    expect(doc.getElementById(host?.dataset.input ?? "")).toBe(input);
    expect(JSON.parse(host?.dataset.authors ?? "")).toEqual(
      CORPUS_TEST_AUTHORS
    );
    // The element only fills in options; the listbox is the server's.
    const listbox = host?.firstElementChild;
    expect(listbox?.getAttribute("role")).toBe("listbox");
    expect(listbox?.id).toBe("corpus-suggestions");
    expect(listbox?.hasAttribute("hidden")).toBe(true);
    expect(listbox?.children).toHaveLength(0);
  });

  test("the autocomplete host omits what the server doesn't know", async () => {
    const view = await runCorpusSearch(BASE, fakeCorpusEngine(), undefined);
    const host = parse(renderCorpusPageHtml(view)).querySelector(
      "morcus-corpus-suggestions"
    );
    expect(host?.hasAttribute("data-authors")).toBe(false);
  });

  test("unavailable page", () => {
    const doc = parse(renderCorpusUnavailableHtml("amoris"));
    expect(text(doc, "h1")).toBe("Corpus unavailable");
  });
});

describe("corpus partial", () => {
  test.each([
    ["landing", { q: "" }],
    ["results", {}],
    ["error", { q: "#Nobody x" }],
    ["strict", { strictMode: true, contextLen: 3 }],
  ])("%s: slots match the full page", async (_name, params) => {
    const view = await search(params);
    expectSlotParity(
      renderCorpusPageHtml(view),
      renderCorpusPartialHtml(view),
      CORPUS_SLOTS
    );
  });

  test("with a next page: slots match the full page", async () => {
    const view = await search(
      {},
      fakeCorpusEngine(() => fakeResult({ nextPage: NEXT }))
    );
    expectSlotParity(
      renderCorpusPageHtml(view),
      renderCorpusPartialHtml(view),
      CORPUS_SLOTS
    );
  });
});
