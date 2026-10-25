/**
 * Whole-site SSR conformance checks: the ones that need every page at once.
 * The per-page checks (tree fingerprint, No-JS controls, addresses, and the
 * failed-owner sweep) run in each feature's `*_ssr_conformance.test.ts`, via
 * `testing/ssr_conformance_harness.ts`.
 *
 * @jest-environment jsdom
 */

import "@/web/ui/testing/all_entries.client";
import fs from "fs";
import path from "path";
import { BaseController } from "@/web/ui/core/dom/base_controller.client";
import { getRegisteredElementTags } from "@/web/ui/core/dom/base_element.client";
import { LifetimeScope } from "@/web/ui/core/dom/lifetime_scope.client";
import {
  PAGE_SETUPS,
  buildSsrFixtures,
  installMatchMediaStub,
  mountFixture,
  type SsrFixture,
} from "@/web/ui/testing/ssr_fixtures";
import { parseInert } from "@/web/ui/testing/ssr_invariants";
import { renderPageShell } from "@/web/ui/shell/page_shell.server";

jest.mock("@/web/ui/shell/asset_manifest.server", () => ({
  getV2AssetHref: (name: string) => `/assets/${name}`,
  getV2CriticalCss: () => "body{background-color:var(--bg)}",
  getV2CriticalJs: () => "/* critical js */",
}));

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

describe("SSR conformance across every page", () => {
  const fixtures: SsrFixture[] = [];

  beforeAll(async () => {
    installMatchMediaStub();
    fixtures.push(...(await buildSsrFixtures()));
  });

  beforeEach(() => {
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

  test("the failed-owner sweep runs every global setup the entry files start", () => {
    // The sweep must see the same document-level listeners as a real page.
    expect(Object.keys(PAGE_SETUPS).sort()).toEqual(setupsStartedByEntries());
  });

  test("SSR markup ships no HTML comments or template indentation", () => {
    // Templates are written with the `ssr` or `html` tags, which strip their
    // own indentation (`dedentTemplateStrings` in `core/dom/html.common.ts`).
    // An indented tag here means a template that skipped them.
    const pages = [
      ...fixtures,
      ...PAGE_SHELL_VARIANTS.map((options, i) => ({
        name: `page-shell-${i}`,
        html: renderPageShell(options),
      })),
    ];
    const offenders = pages.flatMap(({ name, html: page }) => {
      // Textarea contents are the user's text, kept verbatim.
      const html = page.replace(/<textarea\b.*?<\/textarea/gs, "");
      return [
        ...Array.from(
          html.matchAll(/<!--.{0,40}/gs),
          (m) => `${name}: ${m[0]}`
        ),
        ...Array.from(
          html.matchAll(/\n[ \t]+<.{0,40}/g),
          (m) => `${name}: ${m[0]}`
        ),
      ];
    });
    expect(offenders).toEqual([]);
  });

  test("every connect-time and delegated selector lookup matches in at least one SSR fixture", () => {
    const recorder = installLookupRecorder();
    try {
      for (const mediaMatches of [false, true]) {
        stubMatchMedia(mediaMatches);
        for (const fixture of fixtures) {
          mountWithPageSetups(fixture, recorder);
        }
      }
    } finally {
      recorder.restore();
      installMatchMediaStub();
    }

    const { matchedByKey } = recorder;
    const unexpectedUnmatched = Array.from(matchedByKey)
      .filter(
        ([key, matched]) => !matched && !(key in UNMATCHED_SELECTOR_ALLOWLIST)
      )
      .map(([key]) => key)
      .sort();
    const staleAllowlist = Object.keys(UNMATCHED_SELECTOR_ALLOWLIST)
      .filter((key) => matchedByKey.get(key) !== false)
      .sort();

    // Floor (~70% of the 82 recorded pairs when this check landed) so a
    // refactor that drops lookups out of the connect path fails loudly.
    expect(matchedByKey.size).toBeGreaterThanOrEqual(58);
    expect({ unexpectedUnmatched, staleAllowlist }).toEqual({
      unexpectedUnmatched: [],
      staleAllowlist: [],
    });
  });
});

/**
 * Page shells the fixtures don't cover: most fixtures are page content only.
 * The full-page variants (head, reader, embedded) are checked here.
 */
const PAGE_SHELL_VARIANTS: Parameters<typeof renderPageShell>[0][] = [
  {
    title: "Shell",
    description: "A description",
    canonicalPath: "/about",
    activePage: "about",
    extraHeadHtml: "<style>:root{}</style>",
    contentHtml: "",
  },
  {
    title: "Reader",
    activePage: "library",
    isReader: true,
    widthSurface: "library",
    contentHtml: "",
  },
  { title: "Embedded", activePage: "dicts", hideAppBar: true, contentHtml: "" },
];

/** Mounts `fixture` on a clean page and runs every global page setup. */
function mountWithPageSetups(fixture: SsrFixture, recorder: LookupRecorder) {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  document.body.replaceChildren();
  const cleanups: (() => void)[] = [];
  try {
    mountFixture(fixture, parseInert(fixture.html));
    for (const [name, setup] of Object.entries(PAGE_SETUPS)) {
      cleanups.push(recorder.withOwner(name, () => setup(document, window)));
    }
  } finally {
    cleanups.forEach((cleanup) => cleanup());
    document.body.replaceChildren();
  }
}

/** Every media query reports `matches`, so both layout branches connect. */
function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
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

/**
 * Connect-time or delegated lookups whose targets are genuinely absent from
 * the initial SSR fixtures. When a selector lookup fails above, decide whether
 * the server dropped the element on purpose (delete the client code) or
 * renamed it (fix the selector); only add an entry here when the target is
 * created on the client or lives outside the fixture's scope.
 */
const UNMATCHED_SELECTOR_ALLOWLIST: Readonly<Record<string, string>> = {
  "morcus-external-loader :: .external-saved-delete":
    "Delete buttons are rendered on the client from IndexedDB saved items.",
  "morcus-reader-view :: #btn-retry-translation":
    "Retry button is rendered on the client when a translation fetch fails.",
  "morcus-reader-view :: #reader-passage .reader-match":
    "Match highlight spans are created when ?match= is present.",
  "morcus-reader-view :: .back-to-top":
    "Rendered by renderPageShell; reader fixtures mount renderReaderContentHtml.",
  "morcus-reader-view :: .reader-note":
    "Mock reader works in mock_reader_loader.ts have no footnotes.",
  "setupDeferredIframes :: iframe[data-deferred-src], iframe[data-src]":
    "Emitted only for dictionary entries with Mateo facsimile <figure> plates.",
};

/**
 * `setupX()` calls in `*_entry.client.ts` files. boot_conformance.test.ts
 * guarantees entries only start setups from `onPageReady`, so a plain scan
 * is enough.
 */
function setupsStartedByEntries(): string[] {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith("_entry.client.ts")) {
        const src = fs.readFileSync(full, "utf8");
        for (const m of src.matchAll(/\b(setup[A-Z]\w*)\s*\(/g)) {
          names.add(m[1]);
        }
      }
    }
  };
  walk(path.resolve(__dirname, "../.."));
  return [...names].sort();
}

interface LookupRecorder {
  /** `"<owner> :: <selector>"` → whether it matched at least once. */
  readonly matchedByKey: ReadonlyMap<string, boolean>;
  /** Runs `fn` with `owner` credited for any lookups it makes. */
  withOwner<T>(owner: string, fn: () => T): T;
  /** Undoes every patch. */
  restore(): void;
}

/**
 * Patches DOM queries and `scope.delegate` to record each selector lookup
 * and whether it matched, credited to the element (or page setup) whose
 * connect path made it. Post-connect handler lookups are out of scope; those
 * belong to `*_interaction_conformance.test.ts`.
 */
function installLookupRecorder(): LookupRecorder {
  const matchedByKey = new Map<string, boolean>();
  const ownerStack: string[] = [];
  const restores: (() => void)[] = [];
  let paused = false;

  const record = (selector: string, matched: boolean) => {
    const owner = ownerStack[ownerStack.length - 1];
    if (paused || !owner || !selector) return;
    const key = `${owner} :: ${selector}`;
    matchedByKey.set(key, (matchedByKey.get(key) ?? false) || matched);
  };

  const withOwner = <T>(owner: string, fn: () => T): T => {
    ownerStack.push(owner);
    try {
      return fn();
    } finally {
      ownerStack.pop();
    }
  };

  // DOM query methods: every `scope.$`/`$$` ends up in one of these.
  const spyQuery = (
    proto: object,
    name: string,
    isHit: (result: unknown) => boolean,
    prefix = ""
  ) => {
    const orig = Reflect.get(proto, name) as (
      this: unknown,
      arg: string
    ) => unknown;
    Reflect.set(proto, name, function (this: unknown, arg: string) {
      const result = orig.call(this, arg);
      record(prefix + arg, isHit(result));
      return result;
    });
    restores.push(() => Reflect.set(proto, name, orig));
  };
  const found = (r: unknown) => r !== null;
  const nonEmpty = (r: unknown) => (r as NodeList).length > 0;
  spyQuery(Element.prototype, "querySelector", found);
  spyQuery(Element.prototype, "querySelectorAll", nonEmpty);
  spyQuery(Document.prototype, "querySelector", found);
  spyQuery(Document.prototype, "querySelectorAll", nonEmpty);
  spyQuery(Document.prototype, "getElementById", found, "#");

  // Delegated selectors are checked against the delegate root up front.
  const origDelegate = LifetimeScope.prototype.delegate;
  LifetimeScope.prototype.delegate = function <
    T extends HTMLElement = HTMLElement
  >(
    this: LifetimeScope,
    root: EventTarget | null | undefined,
    type: string,
    selector: string,
    handler: (e: Event, matched: T) => void,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (root instanceof Element || root instanceof Document) {
      paused = true;
      const hit = root.querySelector(selector) !== null;
      paused = false;
      record(selector, hit);
    }
    Reflect.apply(origDelegate, this, [root, type, selector, handler, options]);
  };
  restores.push(() => (LifetimeScope.prototype.delegate = origDelegate));

  // jsdom snapshots `connectedCallback` at `customElements.define()` time,
  // so wrap each registered element's `onConnect` instead.
  for (const tag of getRegisteredElementTags()) {
    const proto: unknown = customElements.get(tag)?.prototype;
    if (typeof proto !== "object" || proto === null) continue;
    const orig = Reflect.get(proto, "onConnect") as unknown;
    if (typeof orig !== "function") continue;
    const hadOwn = Object.prototype.hasOwnProperty.call(proto, "onConnect");
    Reflect.set(proto, "onConnect", function (this: Element) {
      withOwner(this.localName, () => orig.call(this));
    });
    restores.push(() =>
      hadOwn
        ? Reflect.set(proto, "onConnect", orig)
        : Reflect.deleteProperty(proto, "onConnect")
    );
  }

  // Controllers connect after their host's `onConnect`; credit the host.
  const origConnect = BaseController.prototype.connect;
  BaseController.prototype.connect = function (this: BaseController) {
    const owner = this.owner?.localName ?? ownerStack[ownerStack.length - 1];
    if (owner) withOwner(owner, () => origConnect.call(this));
    else origConnect.call(this);
  };
  restores.push(() => (BaseController.prototype.connect = origConnect));

  return {
    matchedByKey,
    withOwner,
    restore: () => restores.reverse().forEach((undo) => undo()),
  };
}
