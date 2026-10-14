/**
 * Real SSR fixtures for the conformance harnesses, rendered with the
 * production `.server.ts` renderers.
 *
 * Test files that import this must also mock `shell/asset_manifest.server`
 * and `reader/reader_loader.server`, as the `*_ssr_conformance.test.ts` files do.
 * Each feature has its own builder, so a feature's suite builds only its
 * own pages; `buildSsrFixtures()` builds them all, in a fixed order.
 */

import type { DictsFusedResponse } from "@/common/dictionaries/dictionaries";
import { XmlNode } from "@/common/xml/xml_node";
import { setupAnchorScroll } from "@/web/v2/core/nav/anchor_scroll.client";
import { setupBackToTop } from "@/web/v2/core/widgets/back_to_top.client";
import { setupDeferredIframes } from "@/web/v2/core/widgets/deferred_iframe.client";
import { setupAbbrPopover } from "@/web/v2/dict/entry/abbr_popover.client";
import { setupMobileMenu } from "@/web/v2/shell/mobile_menu.client";
import { CONTEXT_LEN, PAGE_SIZE } from "@/web/v2/corpus/corpus_params.common";
import {
  runCorpusSearch,
  type CorpusEngine,
} from "@/web/v2/corpus/corpus_query.server";
import { renderCorpusContentHtml } from "@/web/v2/corpus/corpus_view.server";
import { renderDictPageHtml } from "@/web/v2/dict/dict_page.server";
import { renderAboutContentHtml } from "@/web/v2/about/about.server";
import {
  renderExternalLandingContentHtml,
  renderExternalLocalContentHtml,
  renderExternalReaderContentHtml,
} from "@/web/v2/external/external.server";
import { renderLibraryPageHtml } from "@/web/v2/library/library.server";
import { renderNotFoundContentHtml } from "@/web/v2/library/not_found.server";
import {
  applyChoices,
  resolveInitialResult,
} from "@/web/v2/macronizer/macronizer_apply.server";
import {
  decodeSuggestions,
  encodeSuggestions,
} from "@/web/v2/macronizer/macronizer_params.server";
import { renderMacronizerContentHtml } from "@/web/v2/macronizer/macronizer_view.server";
import { renderReaderContentHtml } from "@/web/v2/reader/reader.server";
import {
  CORPUS_TEST_AUTHORS,
  fakeCorpusEngine,
  fakeResult,
} from "@/web/v2/testing/fake_corpus_engine";
import {
  CANNED_MACRONIZER_RESULT,
  CANNED_MACRONIZER_TEXT,
} from "@/web/v2/testing/fake_macronizer_engine";

export interface SsrFixture {
  readonly name: string;
  readonly html: string;
  /**
   * A user who focused `input` (an id) before the bundle ran. Every `host`
   * is held out of the document until the input has focus, so it upgrades
   * the way it would on a real page: adopting the focused input.
   */
  readonly focusBeforeUpgrade?: {
    readonly input: string;
    readonly host: string;
  };
}

/** The dictionary results for `amo` in the `dict-results` fixture. */
export const DICT_AMO_QUERIED: string[] = ["L&S", "SH"];
export const DICT_AMO_RESULTS: DictsFusedResponse = {
  "L&S": [
    {
      entry: new XmlNode(
        "div",
        [["id", "ls-amo-root"]],
        [
          new XmlNode("b", [["class", "lsOrth"]], ["amo"]),
          " ",
          new XmlNode("span", [["class", "lsQuote"]], ["Gallia est omnis"]),
          new XmlNode(
            "div",
            [["id", "ls-amo-s1"]],
            [
              new XmlNode(
                "span",
                [
                  ["class", "lsSenseBullet"],
                  ["senseid", "ls-amo-s1"],
                ],
                ["I."]
              ),
              " To love",
            ]
          ),
        ]
      ),
      outline: {
        mainKey: "amo",
        mainSection: {
          text: "amo",
          level: 0,
          ordinal: "",
          sectionId: "ls-amo-root",
        },
        senses: [
          {
            text: "To love",
            level: 1,
            ordinal: "I.",
            sectionId: "ls-amo-s1",
          },
        ],
      },
      inflections: [
        { form: "amas", lemma: "amo", data: "2nd sg. pres. ind. act." },
      ],
    },
  ],
  SH: [
    {
      entry: new XmlNode(
        "div",
        [["id", "sh-love-root"]],
        [new XmlNode("b", [["class", "lsOrth"]], ["love"]), " amo"]
      ),
      outline: {
        mainKey: "love",
        mainSection: {
          text: "love",
          level: 0,
          ordinal: "",
          sectionId: "sh-love-root",
        },
        senses: [],
      },
    },
  ],
};

/** The corpus engine behind the corpus fixtures. */
export function ssrFixtureCorpusEngine(): CorpusEngine {
  return fakeCorpusEngine(() =>
    fakeResult({
      resultStats: { estimatedResults: 200 },
      nextPage: { resultId: 1, resultIndex: 50, candidateIndex: 0 },
    })
  );
}

/** jsdom has no `matchMedia`; components read it on connect. */
export function installMatchMediaStub(): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

export function buildDictFixtures(): SsrFixture[] {
  return [
    {
      name: "dict-landing",
      html: renderDictPageHtml({ query: "" }),
    },
    {
      name: "dict-results",
      html: renderDictPageHtml({
        query: "amo",
        queriedDicts: DICT_AMO_QUERIED,
        results: DICT_AMO_RESULTS,
      }),
    },
    {
      name: "dict-greek",
      html: renderDictPageHtml({ query: "λόγος" }),
    },
  ];
}

export async function buildLibraryFixtures(): Promise<SsrFixture[]> {
  return [{ name: "library", html: await renderLibraryPageHtml() }];
}

export async function buildReaderFixtures(): Promise<SsrFixture[]> {
  const [sallust, catullus, caesar] = await Promise.all([
    renderReaderContentHtml({ workId: "sallust/catalina1", pageId: "1" }),
    renderReaderContentHtml({ workId: "catullus", pageId: "5" }),
    // The last page of a multi-level work, so its previous-page link and
    // nested TOC are live.
    renderReaderContentHtml({
      workId: "caesar_de_bello_gallico",
      pageId: "1.2",
    }),
  ]);
  return [
    { name: "reader-sallust-translation", html: sallust },
    { name: "reader-catullus-macra", html: catullus },
    { name: "reader-caesar-last-page", html: caesar },
  ];
}

export function buildExternalFixtures(): SsrFixture[] {
  return [
    { name: "external-landing", html: renderExternalLandingContentHtml() },
    {
      // `?url=`: a text imported from a web page, rendered on the server.
      name: "external-url",
      html: renderExternalReaderContentHtml({
        sourceUrl: "https://example.com/gallia",
        // Verse with a stanza break, so the loader's `.line-space` check hits.
        text: "Vīvāmus, mea Lesbia, atque amēmus,\nrūmōrēsque senum sevēriōrum\n\nomnēs ūnius aestimēmus assis.",
        lines: "verse",
        query: "",
      }),
    },
    {
      // `?local=`: a saved text; the loader fills it in from IndexedDB.
      name: "external-local",
      html: renderExternalLocalContentHtml({
        localKey: "saved-1",
        lines: "keep",
        query: "",
      }),
    },
  ];
}

export async function buildCorpusFixtures(): Promise<SsrFixture[]> {
  const corpusParams = {
    q: "",
    pageSize: PAGE_SIZE.default,
    contextLen: CONTEXT_LEN.default,
    strictMode: false,
  };
  const corpusEngine = ssrFixtureCorpusEngine();
  const [corpusLanding, corpusResults] = await Promise.all([
    runCorpusSearch(corpusParams, corpusEngine, CORPUS_TEST_AUTHORS),
    runCorpusSearch(
      { ...corpusParams, q: "@case:dat" },
      corpusEngine,
      CORPUS_TEST_AUTHORS
    ),
  ]);
  return [
    {
      name: "corpus-landing",
      html: renderCorpusContentHtml(corpusLanding),
    },
    {
      name: "corpus-results",
      // With a commit id, as in production, so the autocomplete host has
      // every attribute it can carry.
      html: renderCorpusContentHtml(corpusResults, "test-commit"),
    },
    {
      // Clicked into the search box before the bundle ran (DESIGN §7.3
      // rule 2), so the suggestions open during `onConnect()`.
      name: "corpus-focused-before-upgrade",
      html: renderCorpusContentHtml(corpusLanding, "test-commit"),
      focusBeforeUpgrade: {
        input: "corpus-q",
        host: "morcus-corpus-suggestions",
      },
    },
  ];
}

/** Static pages: no feature elements, but the shell and page setups run. */
export function buildStaticPageFixtures(): SsrFixture[] {
  return [
    { name: "about", html: renderAboutContentHtml() },
    {
      name: "not-found",
      html: renderNotFoundContentHtml({ workSlug: "nobody/nothing" }),
    },
  ];
}

export function buildMacronizerFixtures(): SsrFixture[] {
  const initialDoc = resolveInitialResult(CANNED_MACRONIZER_RESULT);
  const suggestions = decodeSuggestions(
    encodeSuggestions(CANNED_MACRONIZER_RESULT)
  );
  const appliedDoc = applyChoices(CANNED_MACRONIZER_RESULT, {
    suggestions,
    priorShown: new Map(),
    wordChoices: new Map([[1, 1]]),
    vowelSubmissions: new Map([[6, new Set([2])]]),
  });

  return [
    {
      name: "macronizer-landing",
      html: renderMacronizerContentHtml(),
    },
    {
      name: "macronizer-results",
      html: renderMacronizerContentHtml({
        inputText: CANNED_MACRONIZER_TEXT,
        document: initialDoc,
      }),
    },
    {
      name: "macronizer-applied",
      html: renderMacronizerContentHtml({
        inputText: CANNED_MACRONIZER_TEXT,
        document: appliedDoc,
      }),
    },
    {
      name: "macronizer-error",
      html: renderMacronizerContentHtml({
        inputText: "   ",
        errorBanner: "Please enter some Latin text to macronize.",
      }),
    },
    {
      name: "macronizer-unavailable",
      html: renderMacronizerContentHtml({
        inputText: CANNED_MACRONIZER_TEXT,
        errorBanner: "The macronizer service is not available on this server.",
      }),
    },
  ];
}

/** Every fixture, for the suites that check all pages at once. */
export async function buildSsrFixtures(): Promise<SsrFixture[]> {
  const groups = await Promise.all([
    buildDictFixtures(),
    buildLibraryFixtures(),
    buildReaderFixtures(),
    buildExternalFixtures(),
    buildCorpusFixtures(),
    buildMacronizerFixtures(),
    buildStaticPageFixtures(),
  ]);
  return groups.flat();
}

/**
 * Attaches `wrapper` (from `parseInert(fixture.html)`) to `document.body`,
 * which upgrades its custom elements. Honours `focusBeforeUpgrade`.
 */
export function mountFixture(
  fixture: SsrFixture,
  wrapper: HTMLDivElement
): void {
  const focus = fixture.focusBeforeUpgrade;
  const held = focus
    ? Array.from(wrapper.querySelectorAll(focus.host), (el) => ({
        el,
        parent: el.parentNode,
        next: el.nextSibling,
      }))
    : [];
  for (const { el } of held) el.remove();

  document.body.appendChild(wrapper);

  if (focus) {
    const input = document.getElementById(focus.input);
    if (!(input instanceof HTMLElement)) {
      throw new Error(`${fixture.name}: no #${focus.input} to focus`);
    }
    input.focus();
    // In reverse, so each `next` is back in place before it's used.
    for (const { el, parent, next } of held.reverse()) {
      parent?.insertBefore(el, next);
    }
  }
}

/**
 * Every global setup an entry file starts, so the harnesses run with the same
 * document-level listeners as a real page. Keyed by name so
 * `ssr_conformance.test.ts` can compare it against the entries.
 */
export const PAGE_SETUPS: Readonly<
  Record<string, (doc: Document, win: Window) => () => void>
> = {
  setupAbbrPopover,
  setupAnchorScroll,
  setupBackToTop,
  setupDeferredIframes,
  setupMobileMenu,
};

export function runPageSetups(): (() => void)[] {
  return Object.values(PAGE_SETUPS).map((setup) => setup(document, window));
}
