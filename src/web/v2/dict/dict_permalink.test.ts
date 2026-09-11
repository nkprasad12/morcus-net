/**
 * @jest-environment jsdom
 */
import { handleDictPermalinkClick } from "@/web/v2/dict/dict_permalink.client";

const ORIGIN = "http://localhost";

let copied: string[] = [];
let copySucceeds = true;

jest.mock("@/web/v2/core/index.client", () => ({
  copyText: jest.fn(async (text: string) => {
    if (!copySucceeds) return false;
    copied.push(text);
    return true;
  }),
  showToast: jest.fn(),
}));

/** Dispatches a real click and returns whether the permalink handler took it. */
function clickOn(selector: string): { handled: boolean; event: MouseEvent } {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`No element matched ${selector}`);
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  let handled = false;
  const listener = (e: Event) => {
    handled = handleDictPermalinkClick(e as MouseEvent, e.target as Element);
  };
  document.addEventListener("click", listener);
  el.dispatchEvent(event);
  document.removeEventListener("click", listener);
  return { handled, event };
}

/** Lets the handler's async copy settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  copied = [];
  copySucceeds = true;
  document.body.innerHTML = `
    <div id="dict-results">
      <article class="v2-entry" id="n20077">
        <a href="/v2/dicts/id/n20077" class="v2-tab-pill v2-copy-pill">Copy link</a>
        <li id="n20077.1">
          <a href="#n20077.1" class="v2-section-anchor">I.</a>
        </li>
        <a href="#missing.9" class="v2-section-anchor">II.</a>
      </article>
      <article class="v2-entry">
        <a href="#orphan.1" class="v2-section-anchor">Orphan</a>
      </article>
      <a href="#somewhere" class="v2-toc-link">Outline entry</a>
    </div>
  `;
});

describe("handleDictPermalinkClick", () => {
  test("copies the article permalink and does not navigate", async () => {
    const { handled, event } = clickOn("a.v2-copy-pill");
    await flush();

    expect(handled).toBe(true);
    // Suppressing the default is what keeps us on the page instead of spending
    // a server render to show content already on screen.
    expect(event.defaultPrevented).toBe(true);
    expect(copied).toEqual([`${ORIGIN}/v2/dicts/id/n20077`]);
  });

  test("qualifies a section permalink with its containing article", async () => {
    const { handled, event } = clickOn('a[href="#n20077.1"]');
    await flush();

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(copied).toEqual([`${ORIGIN}/v2/dicts/id/n20077#n20077.1`]);
  });

  test("still copies a section link whose target does not resolve", async () => {
    // The article id comes from the DOM, not from splitting the sense id, so a
    // missing in-page target does not stop the permalink from being correct.
    const { handled } = clickOn('a[href="#missing.9"]');
    await flush();

    expect(handled).toBe(true);
    expect(copied).toEqual([`${ORIGIN}/v2/dicts/id/n20077#missing.9`]);
  });

  test("ignores a section anchor with no resolvable article id", async () => {
    const { handled, event } = clickOn('a[href="#orphan.1"]');
    await flush();

    // Falls through to the plain in-page jump rather than copying a broken URL.
    expect(handled).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(copied).toEqual([]);
  });

  test("ignores outline links, which should still navigate in-page", async () => {
    const { handled, event } = clickOn("a.v2-toc-link");
    await flush();

    expect(handled).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(copied).toEqual([]);
  });

  test("navigates as a fallback when the clipboard is unavailable", async () => {
    copySucceeds = false;
    const assign = jest.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, origin: ORIGIN, assign },
      writable: true,
    });

    clickOn("a.v2-copy-pill");
    await flush();

    // A blocked clipboard should still leave the user with a shareable URL
    // rather than a click that silently did nothing.
    expect(assign).toHaveBeenCalledWith(`${ORIGIN}/v2/dicts/id/n20077`);
  });
});
