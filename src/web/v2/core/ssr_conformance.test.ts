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
 * 4. Failed-owner sweep: with any one `morcus-*` instance failed in
 *    `onConnect()` and everything else upgraded, no listener cancels a native
 *    activation on a control in that instance or pointing into it.
 *
 * @jest-environment jsdom
 */

import "@/web/v2/v2_elements.client";
import { XmlNode } from "@/common/xml/xml_node";
import { getRegisteredElementTags } from "@/web/v2/core/base_element.client";
import { setupAnchorScroll } from "@/web/v2/core/anchor_scroll.client";
import { setupBackToTop } from "@/web/v2/core/back_to_top.client";
import { revealTarget } from "@/web/v2/core/reveal.client";
import { setupAbbrPopover } from "@/web/v2/dict/abbr_popover.client";
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
  // Options (and their contents) built by `MorcusCorpusSuggestions` in its
  // server-rendered listbox. On upgrade only if the input already has focus:
  // see the `corpus-focused-before-upgrade` fixture.
  "morcus-corpus-suggestions > ul > li, morcus-corpus-suggestions > ul > li *",
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

        const focus = fixture.focusBeforeUpgrade;
        const held = focus
          ? Array.from(rootWrapper.querySelectorAll(focus.host), (el) => ({
              el,
              parent: el.parentNode!,
              next: el.nextSibling,
            }))
          : [];
        for (const { el } of held) el.remove();

        // Attach to document.body -> triggers custom element upgrade & onConnect().
        document.body.appendChild(rootWrapper);

        if (focus) {
          document.getElementById(focus.input)!.focus();
          // In reverse, so each `next` is back in place before it's used.
          for (const { el, parent, next } of held.reverse()) {
            parent.insertBefore(el, next);
          }
        }

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

  describe("4. Failed-owner sweep: a component that failed keeps its No-JS behaviour", () => {
    test("no listener cancels a native activation in, or pointing into, a failed component", () => {
      const violations: string[] = [];
      const listenerErrors: string[] = [];
      let instancesSwept = 0;
      let activations = 0;

      jest.spyOn(console, "warn").mockImplementation(() => {});
      jest.spyOn(console, "error").mockImplementation(() => {});

      for (const fixture of fixtures) {
        if (fixture.focusBeforeUpgrade) continue;
        const count = morcusElements(parseInert(fixture.html)).length;

        for (let i = 0; i < count; i++) {
          document.body.innerHTML = "";
          window.history.replaceState(null, "", "/");
          const wrapper = parseInert(fixture.html);
          const failed = morcusElements(wrapper)[i];
          const label = `${fixture.name}: failed ${describeElement(
            failed
          )} (#${i})`;
          instancesSwept++;

          const restore = forceConnectFailure(failed);
          const onError = (e: ErrorEvent) => {
            if (e.error !== FORCED_FAILURE) {
              listenerErrors.push(`${label}: ${String(e.error ?? e.message)}`);
            }
            e.preventDefault();
          };
          window.addEventListener("error", onError);
          const cleanups: (() => void)[] = [];
          try {
            document.body.appendChild(wrapper);
            expect(failed.hasAttribute("data-js-failed")).toBe(true);
            cleanups.push(
              setupAnchorScroll(document, window),
              setupAbbrPopover(document, window),
              setupBackToTop(document, window)
            );

            for (const control of controlsAffectedBy(failed, wrapper)) {
              for (const event of activationEvents(control)) {
                if (!control.isConnected) break;
                activations++;
                control.dispatchEvent(event);
                if (event.defaultPrevented) {
                  violations.push(
                    `${label}: ${eventName(event)} on ${describeElement(
                      control
                    )} was cancelled`
                  );
                }
              }
            }
          } finally {
            for (const cleanup of cleanups) cleanup();
            window.removeEventListener("error", onError);
            restore();
          }
        }
      }

      expect(instancesSwept).toBeGreaterThan(10);
      expect(activations).toBeGreaterThan(100);
      expect({ violations, listenerErrors }).toEqual({
        violations: [],
        listenerErrors: [],
      });
    });
  });
});

const FORCED_FAILURE = new Error(
  "failed-owner sweep: forced onConnect failure"
);
const NATIVE_CONTROLS =
  "a[href], button, summary, input, select, textarea, form";
const ID_REF_ATTRS = [
  "aria-controls",
  "popovertarget",
  "commandfor",
  "form",
  "for",
] as const;

/** Parses `html` into a detached wrapper whose custom elements haven't upgraded. */
function parseInert(html: string): HTMLDivElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const wrapper = document.createElement("div");
  wrapper.append(tpl.content);
  return wrapper;
}

/** Every `morcus-*` element under `root`, in document order. */
function morcusElements(root: Element): Element[] {
  return Array.from(root.querySelectorAll("*")).filter((el) =>
    el.localName.startsWith("morcus-")
  );
}

/** Makes `el` (and only `el`) throw from `onConnect` when it upgrades. */
function forceConnectFailure(el: Element): () => void {
  const ctor = customElements.get(el.localName);
  if (!ctor) throw new Error(`<${el.localName}> is not registered`);
  const proto = ctor.prototype as { onConnect: (this: Element) => void };
  const original = proto.onConnect;
  const hadOwn = Object.prototype.hasOwnProperty.call(proto, "onConnect");
  proto.onConnect = function (this: Element) {
    if (this === el) throw FORCED_FAILURE;
    original.call(this);
  };
  return () => {
    if (hadOwn) proto.onConnect = original;
    else delete (proto as Partial<typeof proto>).onConnect;
  };
}

/** The nearest `morcus-*` element enclosing `el` (itself included). */
function nearestMorcus(el: Element): Element | null {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    if (cur.localName.startsWith("morcus-")) return cur;
  }
  return null;
}

/**
 * Native controls whose No-JS behaviour belongs to `failed`: those it owns
 * directly (not ones inside a nested component, which keeps working), and
 * any control on the page that points at an element inside it.
 */
function controlsAffectedBy(failed: Element, root: Element): Element[] {
  const out = new Set<Element>();
  for (const el of Array.from(failed.querySelectorAll(NATIVE_CONTROLS))) {
    if (nearestMorcus(el) === failed) out.add(el);
  }
  const inFailed = (id: string) => {
    const target = root.ownerDocument.getElementById(id);
    return target !== null && failed.contains(target);
  };
  for (const a of Array.from(root.querySelectorAll('a[href^="#"]'))) {
    const raw = (a.getAttribute("href") ?? "").slice(1);
    let id = raw;
    try {
      id = decodeURIComponent(raw);
    } catch {
      // Keep the raw id.
    }
    if (id && inFailed(id)) out.add(a);
  }
  for (const attr of ID_REF_ATTRS) {
    for (const el of Array.from(root.querySelectorAll(`[${attr}]`))) {
      const ids = (el.getAttribute(attr) ?? "").trim().split(/\s+/);
      if (ids.some((id) => id && inFailed(id))) out.add(el);
    }
  }
  return Array.from(out);
}

function activationEvents(control: Element): Event[] {
  if (control instanceof HTMLFormElement) {
    return [new Event("submit", { bubbles: true, cancelable: true })];
  }
  return [
    new MouseEvent("click", { bubbles: true, cancelable: true }),
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }),
  ];
}

function eventName(e: Event): string {
  return e instanceof KeyboardEvent ? `keydown(${e.key})` : e.type;
}
