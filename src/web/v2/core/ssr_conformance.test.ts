/**
 * Runtime SSR & Progressive-Enhancement Conformance Harness (PE RFC Review §2.3 / Phase 2.3).
 *
 * Self-populating over all registered V2 custom elements (`getRegisteredElementTags()`),
 * using real `.server.ts` renderer output rather than hand-written HTML stubs.
 *
 * Enforces three structural invariants across every SSR fixture:
 * 1. Tree fingerprint (P1): Upgrading custom elements never removes or reparents
 *    any server-rendered element, and inserts no un-allowlisted DOM nodes.
 * 2. No-JS controls (P5): Every interactive control visible without JS is native
 *    (a link with `href`, a submit button inside a `<form>`, or a named form control
 *    inside a `<form>`).
 * 3. Addresses & revealability: Every `id` is unique, every in-page `href="#..."`
 *    resolves to an element in the document, and `revealTarget()` makes every
 *    targeted element visible after upgrade.
 *
 * @jest-environment jsdom
 */

import "@/web/v2/v2_elements.client";
import { XmlNode } from "@/common/xml/xml_node";
import { getRegisteredElementTags } from "@/web/v2/core/base_element.client";
import { revealTarget } from "@/web/v2/core/reveal.client";
import { CONTEXT_LEN, PAGE_SIZE } from "@/web/v2/corpus/corpus_params.common";
import { runCorpusSearch } from "@/web/v2/corpus/corpus_query.server";
import { renderCorpusContentHtml } from "@/web/v2/corpus/corpus_view.server";
import { renderDictPageHtml } from "@/web/v2/dict/dict_page.server";
import { renderExternalLandingContentHtml } from "@/web/v2/external/external.server";
import { renderLibraryPageHtml } from "@/web/v2/library/library.server";
import { renderReaderContentHtml } from "@/web/v2/reader/reader.server";
import {
  CORPUS_TEST_AUTHORS,
  fakeCorpusEngine,
  fakeResult,
} from "@/web/v2/testing/fake_corpus_engine";

jest.mock("@/web/v2/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/v2/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
);

/**
 * Elements allowed to be created dynamically during `onConnect()` (PE RFC §7).
 * Everything else in the upgraded tree must already exist in the SSR HTML.
 */
const CREATED_ON_UPGRADE_ALLOWLIST: readonly string[] = [
  // Inline word tokens wrapped by `tokenizeElement` in passages and entries.
  ".lat-word",
  // Autocomplete list built by `MorcusDictSuggestions` inside its
  // server-rendered host.
  "morcus-dict-suggestions > ul.suggestions",
];

function describeElement(el: Element): string {
  const id = el.id ? `#${el.id}` : "";
  const classes =
    typeof el.className === "string" && el.className.trim()
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
  return `<${el.tagName.toLowerCase()}${id}${classes}>`;
}

interface SsrFixture {
  readonly name: string;
  readonly html: string;
}

function buildDictResultsFixtureHtml(): string {
  return renderDictPageHtml({
    query: "amo",
    queriedDicts: ["L&S", "SH"],
    results: {
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
    },
  });
}

describe("SSR & Progressive-Enhancement Runtime Conformance", () => {
  const fixtures: SsrFixture[] = [];

  beforeAll(async () => {
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

    const [libraryHtml, readerSallustHtml, readerCatullusHtml] =
      await Promise.all([
        renderLibraryPageHtml(),
        renderReaderContentHtml({ workId: "sallust/catalina1", pageId: "1" }),
        renderReaderContentHtml({ workId: "catullus", pageId: "5" }),
      ]);
    const corpusParams = {
      q: "",
      pageSize: PAGE_SIZE.default,
      contextLen: CONTEXT_LEN.default,
      strictMode: false,
    };
    const corpusEngine = fakeCorpusEngine(() =>
      fakeResult({
        resultStats: { estimatedResults: 200 },
        nextPage: { resultId: 1, resultIndex: 50, candidateIndex: 0 },
      })
    );
    const [corpusLanding, corpusResults] = await Promise.all([
      runCorpusSearch(corpusParams, corpusEngine, CORPUS_TEST_AUTHORS),
      runCorpusSearch(
        { ...corpusParams, q: "@case:dat" },
        corpusEngine,
        CORPUS_TEST_AUTHORS
      ),
    ]);

    fixtures.push(
      {
        name: "dict-landing",
        html: renderDictPageHtml({ query: "" }),
      },
      {
        name: "dict-results",
        html: buildDictResultsFixtureHtml(),
      },
      {
        name: "dict-greek",
        html: renderDictPageHtml({ query: "λόγος" }),
      },
      {
        name: "library",
        html: libraryHtml,
      },
      {
        name: "reader-sallust-translation",
        html: readerSallustHtml,
      },
      {
        name: "reader-catullus-macra",
        html: readerCatullusHtml,
      },
      {
        name: "external-landing",
        html: renderExternalLandingContentHtml(),
      },
      {
        name: "corpus-landing",
        html: renderCorpusContentHtml(corpusLanding),
      },
      {
        name: "corpus-results",
        html: renderCorpusContentHtml(corpusResults),
      }
    );
  });

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(""),
      json: () => Promise.resolve([]),
    } as unknown as Response);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  test("every registered custom element is exercised by the real SSR fixtures", () => {
    const seenTags = new Set<string>();
    for (const fixture of fixtures) {
      document.body.innerHTML = fixture.html;
      for (const tag of getRegisteredElementTags()) {
        if (document.body.querySelector(tag)) {
          seenTags.add(tag);
        }
      }
      document.body.innerHTML = "";
    }

    const registered = Array.from(getRegisteredElementTags()).sort();
    expect(Array.from(seenTags).sort()).toEqual(registered);
  });

  describe("1. Tree fingerprint: upgrade reparents no SSR node and builds no un-allowlisted DOM (P1)", () => {
    test("all SSR fixtures preserve their tree across custom element upgrade", () => {
      expect(fixtures.length).toBeGreaterThan(0);

      for (const fixture of fixtures) {
        document.body.innerHTML = "";

        // Parse inside an inert <template> so custom elements do not upgrade
        // until moved into `document.body`. Because we move the exact nodes,
        // object identity is preserved across upgrade.
        const tpl = document.createElement("template");
        tpl.innerHTML = fixture.html;

        const rootWrapper = document.createElement("div");
        while (tpl.content.firstChild) {
          rootWrapper.appendChild(tpl.content.firstChild);
        }

        const ssrParentByElement = new Map<Element, Node>();
        for (const el of Array.from(rootWrapper.querySelectorAll("*"))) {
          ssrParentByElement.set(el, el.parentNode!);
        }

        // Attach to document.body -> triggers custom element upgrade & onConnect().
        document.body.appendChild(rootWrapper);

        const removedSsrNodes: string[] = [];
        const reparentedSsrNodes: string[] = [];

        for (const [el, ssrParent] of ssrParentByElement) {
          if (!rootWrapper.contains(el)) {
            removedSsrNodes.push(`${fixture.name}: ${describeElement(el)}`);
          } else if (el.parentNode !== ssrParent) {
            const fromDesc =
              ssrParent instanceof Element
                ? describeElement(ssrParent)
                : "#root";
            const toDesc =
              el.parentNode instanceof Element
                ? describeElement(el.parentNode)
                : "#root";
            reparentedSsrNodes.push(
              `${fixture.name}: ${describeElement(
                el
              )} moved from ${fromDesc} to ${toDesc}`
            );
          }
        }

        const unexpectedCreatedNodes: string[] = [];
        for (const el of Array.from(rootWrapper.querySelectorAll("*"))) {
          if (ssrParentByElement.has(el)) continue;
          const isAllowlisted = CREATED_ON_UPGRADE_ALLOWLIST.some((sel) =>
            el.matches(sel)
          );
          if (!isAllowlisted) {
            const parentDesc =
              el.parentElement && el.parentElement !== rootWrapper
                ? describeElement(el.parentElement)
                : "#root";
            unexpectedCreatedNodes.push(
              `${fixture.name}: ${describeElement(el)} inside ${parentDesc}`
            );
          }
        }

        expect({
          fixture: fixture.name,
          removedSsrNodes,
          reparentedSsrNodes,
          unexpectedCreatedNodes,
        }).toEqual({
          fixture: fixture.name,
          removedSsrNodes: [],
          reparentedSsrNodes: [],
          unexpectedCreatedNodes: [],
        });
      }
    });
  });

  describe("2. No-JS controls: every visible control in SSR works natively without JS (P5)", () => {
    test("no dead buttons, unassociated inputs, or href-less links in No-JS SSR markup", () => {
      const violations: string[] = [];

      for (const fixture of fixtures) {
        const tpl = document.createElement("template");
        tpl.innerHTML = fixture.html;
        const root = tpl.content;

        const controls = Array.from(
          root.querySelectorAll("button, input, select, textarea, a")
        );

        for (const ctrl of controls) {
          // Controls hidden unconditionally, gated by `data-js-only`, or inside
          // a closed <dialog> are not exposed to No-JS users.
          if (
            ctrl.closest("[data-js-only]") ||
            ctrl.closest("[hidden]") ||
            ctrl.closest("dialog")
          ) {
            continue;
          }

          const tag = ctrl.tagName.toLowerCase();
          if (tag === "a") {
            const href = ctrl.getAttribute("href")?.trim();
            if (!href) {
              violations.push(
                `${fixture.name}: ${describeElement(
                  ctrl
                )} is an <a> without href outside [data-js-only]`
              );
            }
            continue;
          }

          if (tag === "button") {
            const type = (ctrl.getAttribute("type") ?? "submit").toLowerCase();
            const form =
              ctrl.closest("form") ??
              (ctrl.getAttribute("form")
                ? root.getElementById(ctrl.getAttribute("form")!)
                : null);
            if (type !== "submit" || !form) {
              violations.push(
                `${fixture.name}: ${describeElement(
                  ctrl
                )} (type="${type}") is visible without JS but does not submit a <form>`
              );
            }
            continue;
          }

          // input, select, textarea
          if (ctrl.hasAttribute("disabled")) continue;
          const inputType = (ctrl.getAttribute("type") ?? "text").toLowerCase();
          if (inputType === "hidden") continue;

          const form =
            ctrl.closest("form") ??
            (ctrl.getAttribute("form")
              ? root.getElementById(ctrl.getAttribute("form")!)
              : null);
          const name = ctrl.getAttribute("name")?.trim();
          if (!form || !name) {
            violations.push(
              `${fixture.name}: ${describeElement(
                ctrl
              )} is a live form control outside a <form> or missing a name attribute in No-JS mode`
            );
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe("3. Internal addresses & revealability: unique IDs and resolvable, revealable #hash links", () => {
    test("every SSR fixture has unique IDs and every internal #hash link resolves and reveals", () => {
      const duplicateIds: string[] = [];
      const danglingHrefs: string[] = [];
      const unrevealedTargets: string[] = [];

      for (const fixture of fixtures) {
        document.body.innerHTML = fixture.html;

        // 3a. Unique IDs
        const seenIds = new Set<string>();
        for (const el of Array.from(document.body.querySelectorAll("[id]"))) {
          const id = el.getAttribute("id")!;
          if (!id) {
            duplicateIds.push(
              `${fixture.name}: empty id on ${describeElement(el)}`
            );
            continue;
          }
          if (seenIds.has(id)) {
            duplicateIds.push(`${fixture.name}: duplicate id="#${id}"`);
          }
          seenIds.add(id);
        }

        // 3b. Internal #hash resolution + 3c. Revealability
        const anchors = Array.from(
          document.body.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')
        );
        for (const anchor of anchors) {
          const href = anchor.getAttribute("href")!;
          if (href === "#" || href === "#top") continue;

          const rawId = href.slice(1);
          let targetId: string;
          try {
            targetId = decodeURIComponent(rawId);
          } catch {
            targetId = rawId;
          }

          const target = document.getElementById(targetId);
          if (!target) {
            danglingHrefs.push(
              `${fixture.name}: ${describeElement(
                anchor
              )} points to missing #${targetId}`
            );
            continue;
          }

          // An anchor that is itself `[hidden]` (such as `#panel-tab-notes` on
          // a page with no footnotes) is not an active user-facing link.
          if (anchor.closest("[hidden]")) {
            continue;
          }

          // Close any enclosing <details> first so we verify `revealTarget`
          // actually opens closed disclosures.
          const ancestorDetails = target.closest("details");
          if (ancestorDetails) {
            ancestorDetails.open = false;
          }

          revealTarget(target);

          // Check that no ancestor <details> remains closed, no ancestor has
          // `hidden`, and any enclosing `.reader-panel-view` is now `.active`.
          let cur: HTMLElement | null = target;
          while (cur && cur !== document.body) {
            if (cur instanceof HTMLDetailsElement && !cur.open) {
              unrevealedTargets.push(
                `${
                  fixture.name
                }: #${targetId} remained inside closed ${describeElement(
                  cur
                )} after revealTarget()`
              );
            }
            if (cur.hasAttribute("hidden")) {
              unrevealedTargets.push(
                `${
                  fixture.name
                }: #${targetId} remained inside [hidden] ${describeElement(
                  cur
                )} after revealTarget()`
              );
            }
            if (
              cur.classList.contains("reader-panel-view") &&
              !cur.classList.contains("active")
            ) {
              unrevealedTargets.push(
                `${fixture.name}: #${targetId} inside ${describeElement(
                  cur
                )} did not activate its companion panel view on revealTarget()`
              );
            }
            cur = cur.parentElement;
          }
        }
      }

      expect({
        duplicateIds,
        danglingHrefs,
        unrevealedTargets,
      }).toEqual({
        duplicateIds: [],
        danglingHrefs: [],
        unrevealedTargets: [],
      });
    });
  });
});
