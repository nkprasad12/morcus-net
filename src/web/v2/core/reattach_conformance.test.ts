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
import "@/web/v2/dialog/report_dialog.client";
import "@/web/v2/dict/dict_greek.client";
import "@/web/v2/dict/dict_search.client";
import "@/web/v2/dict/dict_settings.client";
import "@/web/v2/dict/dict_suggestions.client";
import "@/web/v2/dict/dict_toc.client";
import "@/web/v2/library/library_view.client";
import "@/web/v2/reader/reader_view.client";
import "@/web/v2/shell/theme_toggle.client";

interface ListenerRecord {
  target: EventTarget;
  type: string;
}

const originalAdd = EventTarget.prototype.addEventListener;
const originalRemove = EventTarget.prototype.removeEventListener;

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
    <morcus-dict-toc class="v2-drawer v2-drawer-toc">
      <details class="v2-toc-details" open>
        <summary class="v2-drawer-bar v2-toc-bar">Contents</summary>
        <div class="v2-toc-body">Outline</div>
      </details>
    </morcus-dict-toc>`,

  "morcus-dict-search": `
    <morcus-dict-search>
      <form class="v2-search-form" action="/v2/dicts" method="GET">
        <div class="v2-input-wrapper">
          <input type="text" name="q" class="v2-input" value="habeo" />
        </div>
      </form>
      <output id="dict-results" class="v2-results"></output>
    </morcus-dict-search>`,

  "morcus-greek-embed": `
    <morcus-greek-embed>
      <details class="v2-greek-details">
        <summary>
          <span class="v2-greek-toggle-text">Show</span>
          <span class="v2-greek-toggle-icon"></span>
        </summary>
        <input type="checkbox" class="v2-greek-auto-open-checkbox" />
      </details>
    </morcus-greek-embed>`,

  "morcus-library-view": `
    <morcus-library-view class="v2-library-view">
      <input id="v2-library-search-input" />
      <button id="v2-library-reset-filter-btn">Reset</button>
      <button class="v2-filter-pill" data-filter="all">All</button>
      <div class="v2-library-author-group">
        <div class="v2-work-card" data-title="x"></div>
      </div>
    </morcus-library-view>`,

  "morcus-report-dialog": `
    <morcus-report-dialog>
      <button class="v2-report-btn">Report</button>
      <dialog class="v2-report-dialog">
        <form class="v2-report-form">
          <textarea class="v2-report-textarea"></textarea>
          <input class="v2-report-reporter" />
          <div class="v2-report-status"></div>
          <button class="v2-report-submit-btn">Send</button>
        </form>
      </dialog>
    </morcus-report-dialog>`,

  "morcus-reader-view": `
    <morcus-reader-view class="v2-reader-view">
      <div class="v2-reader-split-layout">
        <section class="v2-reader-text-panel">
          <div class="v2-reader-text-card">
            <article class="v2-reader-passage" id="v2-reader-passage">
              <div class="v2-reader-section" id="sec-1">
                <span class="v2-reader-line">arma virumque cano</span>
              </div>
            </article>
          </div>
        </section>
        <aside class="v2-reader-dict-panel">
          <div class="v2-reader-sheet-bar">
            <div class="v2-reader-sheet-teaser">
              <span class="v2-reader-sheet-label">Tap any word</span>
            </div>
          </div>
          <iframe id="v2-dict-frame" src="/v2/dicts?embedded=1"></iframe>
        </aside>
        <dialog id="v2-reader-settings-dialog">
          <input type="checkbox" id="v2-toggle-macra" checked />
        </dialog>
      </div>
    </morcus-reader-view>`,
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
});

afterAll(() => {
  EventTarget.prototype.addEventListener = originalAdd;
  EventTarget.prototype.removeEventListener = originalRemove;
});

describe("V2 custom elements survive being moved in the DOM", () => {
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
