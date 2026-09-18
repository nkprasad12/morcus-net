/**
 * Conformance test: every V2 custom element must survive being moved in the DOM.
 *
 * `BaseElement.disconnectedCallback` calls `dispose()`, which unregisters every
 * listener added through `listen()` / `delegate()`. Moving an element fires
 * disconnect and then connect, so `onConnect()` is responsible for putting all
 * of them back. Anything registered behind a "do this only once" guard — a
 * cached field, a `data-` marker, or the constructor — is dropped on the first
 * move and never returns.
 *
 * That mistake has been made three times in this codebase, in three different
 * disguises, and it is invisible in review because the guarded code reads as a
 * sensible optimization. So rather than trusting inspection, this test moves
 * every registered element and fails if a listener that was torn down is not
 * put back.
 *
 * @jest-environment jsdom
 */
import "@/web/v2/v2_elements.client";
import { getRegisteredElementTags } from "@/web/v2/core/base_element.client";
import * as fs from "node:fs";
import * as path from "node:path";

interface ListenerRecord {
  target: EventTarget;
  type: string;
}

const originalAdd = EventTarget.prototype.addEventListener;
const originalRemove = EventTarget.prototype.removeEventListener;
const originalWinAdd: EventTarget["addEventListener"] = window.addEventListener;
const originalWinRemove: EventTarget["removeEventListener"] =
  window.removeEventListener;

let added: ListenerRecord[] = [];
let removed: ListenerRecord[] = [];
let recording = false;

/** Runs `fn` and reports the listeners registered and unregistered during it. */
function record(fn: () => void): {
  added: ListenerRecord[];
  removed: ListenerRecord[];
} {
  added = [];
  removed = [];
  recording = true;
  try {
    fn();
  } finally {
    recording = false;
  }
  return { added, removed };
}

function describeTarget(target: EventTarget): string {
  if (target === window) return "window";
  if (target === document) return "document";
  if (target instanceof Element) {
    const classes =
      typeof target.className === "string" && target.className.trim()
        ? "." + target.className.trim().split(/\s+/).slice(0, 2).join(".")
        : "";
    return `${target.tagName.toLowerCase()}${classes}`;
  }
  return String(target);
}

/**
 * Fixtures mirror the shape of the SSR markup each element enhances — enough of
 * it that the element finds what it queries for and registers its listeners.
 */
const FIXTURES: Record<string, string> = {
  "morcus-theme-toggle": `<morcus-theme-toggle></morcus-theme-toggle>`,

  "morcus-dict-suggestions": `<morcus-dict-suggestions></morcus-dict-suggestions>`,

  "morcus-dict-settings": `<morcus-dict-settings></morcus-dict-settings>`,

  "morcus-dict-toc": `
    <morcus-dict-toc class="drawer drawer-toc">
      <details class="toc-details" open>
        <summary class="drawer-bar toc-bar">Contents</summary>
        <div class="toc-body">Outline</div>
      </details>
    </morcus-dict-toc>`,

  "morcus-dict-search": `
    <morcus-dict-search>
      <form class="search-form" action="/v2/dicts" method="GET">
        <div class="input-wrapper">
          <input type="text" name="q" class="input" value="habeo" />
        </div>
      </form>
      <output id="dict-results" class="results"></output>
    </morcus-dict-search>`,

  "morcus-greek-embed": `
    <morcus-greek-embed>
      <details class="greek-details">
        <summary>
          <span class="greek-toggle-text">Show</span>
          <span class="greek-toggle-icon"></span>
        </summary>
        <input type="checkbox" class="greek-auto-open-checkbox" />
      </details>
    </morcus-greek-embed>`,

  "morcus-library-view": `
    <morcus-library-view class="library-view">
      <input id="library-search-input" />
      <button id="library-reset-filter-btn">Reset</button>
      <button class="filter-pill" data-filter="all">All</button>
      <div class="library-author-group">
        <div class="work-card" data-title="x"></div>
      </div>
    </morcus-library-view>`,

  "morcus-report-dialog": `
    <morcus-report-dialog>
      <button class="report-btn">Report</button>
      <dialog class="report-dialog">
        <form class="report-form">
          <textarea class="report-textarea"></textarea>
          <input class="report-reporter" />
          <div class="report-status"></div>
          <button class="report-submit-btn">Send</button>
        </form>
      </dialog>
    </morcus-report-dialog>`,

  "morcus-reader-view": `
    <morcus-reader-view class="reader-view">
      <div id="reader-toc-backdrop" class="reader-toc-backdrop" hidden></div>
      <div id="reader-toc-drawer" class="reader-toc-drawer" role="dialog" hidden>
        <button type="button" id="reader-toc-close-btn">&times;</button>
        <div id="reader-toc-list" class="reader-toc-list">
          <a href="#sec-1" class="reader-toc-item">Section 1</a>
        </div>
      </div>
      <div class="reader-sticky-bar">
        <button type="button" id="reader-toc-btn" aria-expanded="false">Contents</button>
      </div>
      <div class="reader-split-layout">
        <section class="reader-text-panel">
          <div class="reader-text-card">
            <article class="reader-passage" id="reader-passage">
              <div class="reader-section" id="sec-1">
                <span class="reader-line">arma virumque cano</span>
              </div>
            </article>
          </div>
        </section>
        <div class="reader-splitter" role="separator" tabindex="0"></div>
        <aside class="reader-dict-panel">
          <div class="reader-sheet-bar">
            <div class="reader-sheet-teaser">
              <span class="reader-sheet-label">Tap any word</span>
            </div>
          </div>
          <div class="dict-iframe-container">
            <iframe id="dict-frame" src="/v2/dicts?embedded=1"></iframe>
          </div>
        </aside>
        <div id="reader-settings-popover" hidden>
          <input type="checkbox" id="toggle-macra" checked />
        </div>
      </div>
    </morcus-reader-view>`,

  "morcus-reader-settings": `
    <morcus-reader-settings>
      <button id="reader-settings-btn"></button>
      <div id="reader-settings-backdrop" hidden></div>
      <div class="reader-settings-popover" id="reader-settings-popover" role="dialog" hidden>
        <button id="reader-size-dec">-</button>
        <span id="reader-size-label">100%</span>
        <button id="reader-size-inc">+</button>
        <button id="dict-size-dec">-</button>
        <span id="dict-size-label">100%</span>
        <button id="dict-size-inc">+</button>
        <input type="checkbox" id="toggle-macra" checked />
        <input type="checkbox" id="toggle-gutter" checked />
        <select id="font-select">
          <option value="serif">Serif</option>
          <option value="sans">Sans</option>
        </select>
        <select id="line-height-select">
          <option value="compact">Compact</option>
          <option value="normal">Normal</option>
          <option value="relaxed">Relaxed</option>
        </select>
        <button id="reader-settings-reset-btn">Reset</button>
        <button id="reader-settings-close-btn">&times;</button>
      </div>
    </morcus-reader-settings>`,
};

beforeAll(() => {
  // The TOC only builds its DrawerController below 1080px, so report a mobile
  // viewport to exercise the branch that actually registers listeners.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  EventTarget.prototype.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ) {
    if (recording) added.push({ target: this, type });
    originalAdd.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ) {
    if (recording) removed.push({ target: this, type });
    originalRemove.call(this, type, listener, options);
  };
  window.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ) {
    if (recording) added.push({ target: window, type });
    originalWinAdd.call(window, type, listener, options);
  };
  window.removeEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ) {
    if (recording) removed.push({ target: window, type });
    originalWinRemove.call(window, type, listener, options);
  };
});

afterAll(() => {
  EventTarget.prototype.addEventListener = originalAdd;
  EventTarget.prototype.removeEventListener = originalRemove;
  window.addEventListener = originalWinAdd;
  window.removeEventListener = originalWinRemove;
});

function findCustomElementFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") {
        results.push(...findCustomElementFiles(fullPath));
      }
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".client.ts") &&
      !entry.name.endsWith(".test.ts") &&
      entry.name !== "base_element.client.ts" &&
      entry.name !== "v2_elements.client.ts" &&
      entry.name !== "v2_bundle.client.ts"
    ) {
      const content = fs.readFileSync(fullPath, "utf-8");
      if (content.includes("registerElement(")) {
        const rel = path
          .relative(path.resolve(__dirname, "../../.."), fullPath)
          .replace(/\\/g, "/")
          .replace(/\.ts$/, "");
        results.push(`@/${rel}`);
      }
    }
  }
  return results;
}

describe("V2 custom elements survive being moved in the DOM", () => {
  test("every registered element has a conformance fixture", () => {
    const registered = Array.from(getRegisteredElementTags()).sort();
    const configured = Object.keys(FIXTURES).sort();
    expect(configured).toEqual(registered);
  });

  test("all custom element files are imported in v2_elements.client.ts", () => {
    const v2Dir = path.resolve(__dirname, "..");
    const elementFiles = findCustomElementFiles(v2Dir).sort();
    const manifestPath = path.resolve(v2Dir, "v2_elements.client.ts");
    const manifestContent = fs.readFileSync(manifestPath, "utf-8");

    expect(elementFiles.length).toBeGreaterThan(0);
    for (const file of elementFiles) {
      expect(manifestContent).toContain(`import "${file}";`);
    }
  });

  test("v2_bundle.client.ts imports v2_elements.client.ts", () => {
    const v2Dir = path.resolve(__dirname, "..");
    const bundlePath = path.resolve(v2Dir, "v2_bundle.client.ts");
    const bundleContent = fs.readFileSync(bundlePath, "utf-8");
    expect(bundleContent).toContain('import "@/web/v2/v2_elements.client";');
  });

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
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

  for (const [tag, fixture] of Object.entries(FIXTURES)) {
    test(`${tag} re-registers every listener it tears down`, () => {
      const firstConnect = record(() => {
        document.body.innerHTML = fixture;
      });
      const element = document.querySelector(tag);
      expect(element).not.toBeNull();
      // Keeps the fixtures honest: an element that registers nothing would
      // satisfy every assertion below without exercising anything.
      expect(firstConnect.added.length).toBeGreaterThan(0);

      // A move is a disconnect immediately followed by a connect.
      const disconnect = record(() => element!.remove());
      // An element that tears down nothing would pass both assertions below:
      // `dead` would be empty, and the second connect would register exactly
      // as many listeners as the first. That is what a misspelled or broken
      // disconnectedCallback looks like, so require real teardown.
      expect(disconnect.removed.length).toBeGreaterThan(0);
      const secondConnect = record(() => document.body.appendChild(element!));

      // A target that is no longer in the document was replaced rather than
      // abandoned — re-rendering an element's own markup is legitimate, and the
      // listener moved to the replacement.
      const stillInUse = (target: EventTarget) =>
        target === window ||
        target === document ||
        (target instanceof Node && document.contains(target));

      const dead = disconnect.removed.filter(
        (torn) =>
          stillInUse(torn.target) &&
          !secondConnect.added.some(
            (fresh) => fresh.target === torn.target && fresh.type === torn.type
          )
      );

      expect({
        dead: dead.map((d) => `${describeTarget(d.target)} "${d.type}"`),
      }).toEqual({ dead: [] });

      // Guards against the opposite failure: re-registering without tearing
      // down would leak a duplicate listener on every move.
      expect(secondConnect.added.length).toBeLessThanOrEqual(
        firstConnect.added.length
      );
    });
  }
});

describe("open-state popovers survive being moved in the DOM", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
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

  test("morcus-reader-settings resets open state on move, tears down open-state listeners, and re-binds trigger listener", () => {
    document.body.innerHTML = FIXTURES["morcus-reader-settings"];
    const settingsEl = document.querySelector<
      HTMLElement & { isOpen(): boolean; open(): void }
    >("morcus-reader-settings")!;
    const triggerBtn = settingsEl.querySelector<HTMLButtonElement>(
      "#reader-settings-btn"
    )!;
    const popoverEl = settingsEl.querySelector<HTMLElement>(
      "#reader-settings-popover"
    )!;

    // Open settings popover and record transient open-state listeners
    const opened = record(() => settingsEl.open());
    expect(opened.added.length).toBeGreaterThan(0);
    expect(settingsEl.isOpen()).toBe(true);
    expect(popoverEl.hasAttribute("hidden")).toBe(false);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("true");

    // Move in DOM (disconnect then reconnect)
    const disconnected = record(() => settingsEl.remove());
    expect(settingsEl.isOpen()).toBe(false);
    expect(popoverEl.hasAttribute("hidden")).toBe(true);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");

    // Every listener added by open() must be removed on disconnect
    const leakedOpenListeners = opened.added.filter(
      (a) =>
        !disconnected.removed.some(
          (r) => r.target === a.target && r.type === a.type
        )
    );
    expect(leakedOpenListeners).toEqual([]);

    document.body.appendChild(settingsEl);
    expect(settingsEl.isOpen()).toBe(false);
    expect(popoverEl.hasAttribute("hidden")).toBe(true);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("false");

    // Re-trigger opens popover cleanly
    triggerBtn.click();
    expect(settingsEl.isOpen()).toBe(true);
    expect(popoverEl.hasAttribute("hidden")).toBe(false);
    expect(triggerBtn.getAttribute("aria-expanded")).toBe("true");
  });

  test("ReaderTocController resets open state on move, tears down open-state listeners, and re-binds trigger listener", () => {
    document.body.innerHTML = FIXTURES["morcus-reader-view"];
    const readerView =
      document.querySelector<HTMLElement>("morcus-reader-view")!;
    const tocBtn =
      readerView.querySelector<HTMLButtonElement>("#reader-toc-btn")!;
    const tocDrawer =
      readerView.querySelector<HTMLElement>("#reader-toc-drawer")!;

    const opened = record(() => tocBtn.click());
    expect(opened.added.length).toBeGreaterThan(0);

    expect(tocDrawer.hasAttribute("hidden")).toBe(false);
    expect(tocBtn.getAttribute("aria-expanded")).toBe("true");

    // Move in DOM (disconnect then reconnect)
    const disconnected = record(() => readerView.remove());
    expect(tocDrawer.hasAttribute("hidden")).toBe(true);
    expect(tocBtn.getAttribute("aria-expanded")).toBe("false");

    const leakedOpenListeners = opened.added.filter(
      (a) =>
        !disconnected.removed.some(
          (r) => r.target === a.target && r.type === a.type
        )
    );
    expect(leakedOpenListeners).toEqual([]);

    document.body.appendChild(readerView);
    expect(tocDrawer.hasAttribute("hidden")).toBe(true);
    expect(tocBtn.getAttribute("aria-expanded")).toBe("false");

    // Re-trigger opens drawer cleanly
    tocBtn.click();
    expect(tocDrawer.hasAttribute("hidden")).toBe(false);
    expect(tocBtn.getAttribute("aria-expanded")).toBe("true");
  });
});
