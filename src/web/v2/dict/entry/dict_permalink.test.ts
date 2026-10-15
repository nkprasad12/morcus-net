/**
 * @jest-environment jsdom
 */
import { closeActiveSectionUI, showToast } from "@/web/v2/core/index.client";
import { setupAbbrPopover } from "@/web/v2/dict/entry/abbr_popover.client";
import { handleDictPermalinkClick } from "@/web/v2/dict/entry/dict_permalink.client";

const ORIGIN = "http://localhost";

let copied: string[] = [];
let copySucceeds = true;

jest.mock("@/web/v2/core/widgets/clipboard.client", () => ({
  copyText: jest.fn(async (text: string) => {
    if (!copySucceeds) return false;
    copied.push(text);
    return true;
  }),
}));

jest.mock("@/web/v2/core/widgets/toast.client", () => ({
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

/** Lets async handlers settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  copied = [];
  copySucceeds = true;
  (showToast as jest.Mock).mockClear();
  closeActiveSectionUI();
  document.body.innerHTML = `
    <div id="dict-results">
      <article class="entry" id="n20077">
        <a href="/dicts/id/n20077" class="tab-pill copy-pill">Copy link</a>
        <li id="n20077.1">
          <a href="#n20077.1" class="section-anchor">I.</a>
          Lit., <span class="lsTrans">to have</span>, <span class="lsQuote"><span class="lat-word" data-word="aliquid">aliquid</span></span>
          <div class="mateo-embed-pane">Facsimile</div>
          <ol class="sense-list">
            <li id="n20077.2">
              <a href="#n20077.2" class="section-anchor">A.</a>
              Sub-sense text
            </li>
          </ol>
        </li>
        <a href="#missing.9" class="section-anchor">II.</a>
      </article>
      <article class="entry">
        <a href="#orphan.1" class="section-anchor">Orphan</a>
      </article>
      <a href="#somewhere" class="toc-link">Outline entry</a>
    </div>
  `;
});

afterEach(() => {
  closeActiveSectionUI();
  jest.restoreAllMocks();
});

describe("handleDictPermalinkClick", () => {
  test("copies the article permalink directly on copy-pill click and does not open menu", async () => {
    const { handled, event } = clickOn("a.copy-pill");
    await flush();

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector(".section-action-menu")).toBeNull();
    expect(copied).toEqual([`${ORIGIN}/dicts/id/n20077`]);
  });

  test("opens section action menu on section-anchor click and copies article-qualified permalink", async () => {
    const { handled, event } = clickOn('a[href="#n20077.1"]');

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);

    const menu = document.querySelector<HTMLElement>(".section-action-menu");
    expect(menu).not.toBeNull();

    const copyBtn = menu!.querySelector<HTMLButtonElement>(
      '[data-action="copy"]'
    )!;
    copyBtn.click();
    await flush();

    expect(document.querySelector(".section-action-menu")).toBeNull();
    expect(copied).toEqual([`${ORIGIN}/dicts/id/n20077#n20077.1`]);
  });

  test("still copies a section link whose target does not resolve", async () => {
    const { handled } = clickOn('a[href="#missing.9"]');
    expect(handled).toBe(true);

    document
      .querySelector<HTMLButtonElement>(
        '.section-action-menu [data-action="copy"]'
      )!
      .click();
    await flush();

    expect(copied).toEqual([`${ORIGIN}/dicts/id/n20077#missing.9`]);
  });

  test("ignores a section anchor with no resolvable article id", async () => {
    const { handled, event } = clickOn('a[href="#orphan.1"]');
    await flush();

    expect(handled).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(document.querySelector(".section-action-menu")).toBeNull();
    expect(copied).toEqual([]);
  });

  test("ignores outline links, which should still navigate in-page", async () => {
    const { handled, event } = clickOn("a.toc-link");
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

    clickOn("a.copy-pill");
    await flush();

    expect(assign).toHaveBeenCalledWith(`${ORIGIN}/dicts/id/n20077`);
  });

  describe("section action menu dismissal", () => {
    const SENSE = 'a[href="#n20077.1"]';
    const menu = () => document.querySelector(".section-action-menu");
    const anchor = () => document.querySelector<HTMLElement>(SENSE)!;
    const pointerDownOn = (el: Element) =>
      el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    /** Makes the anchor report `top` from getBoundingClientRect. */
    const placeAnchorAt = (top: number) => {
      anchor().getBoundingClientRect = () =>
        ({
          top,
          bottom: top + 20,
          left: 100,
          right: 120,
          width: 20,
        } as DOMRect);
    };

    test("closes on an outside tap and marks the anchor collapsed", () => {
      clickOn(SENSE);
      expect(menu()).not.toBeNull();
      expect(anchor().getAttribute("aria-expanded")).toBe("true");

      pointerDownOn(document.querySelector(".lsTrans")!);

      expect(menu()).toBeNull();
      expect(anchor().getAttribute("aria-expanded")).toBe("false");
    });

    test("stays open for taps inside the menu and on its own anchor", () => {
      clickOn(SENSE);
      pointerDownOn(menu()!.querySelector("button")!);
      pointerDownOn(anchor());
      expect(menu()).not.toBeNull();
    });

    test("toggles closed when its anchor is clicked again", () => {
      clickOn(SENSE);
      clickOn(SENSE);
      expect(menu()).toBeNull();
      clickOn(SENSE);
      expect(menu()).not.toBeNull();
    });

    test("closes on Escape and returns focus to the anchor", () => {
      clickOn(SENSE);
      expect(document.activeElement).toBe(
        menu()!.querySelector('[data-action="copy"]')
      );

      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );

      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(anchor());
    });

    test("closes on Tab, handing focus back to the anchor", () => {
      clickOn(SENSE);
      menu()!
        .querySelector("button")!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
        );
      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(anchor());
    });

    test("closes on a window scroll that moves the anchor", () => {
      placeAnchorAt(300);
      clickOn(SENSE);

      placeAnchorAt(250);
      document.dispatchEvent(new Event("scroll"));

      expect(menu()).toBeNull();
    });

    test("closes on an inner scroller's scroll (scroll events don't bubble)", () => {
      placeAnchorAt(300);
      clickOn(SENSE);

      placeAnchorAt(250);
      // Non-bubbling, like a real element scroll: only a capture listener sees it.
      document
        .getElementById("dict-results")!
        .dispatchEvent(new Event("scroll", { bubbles: false }));

      expect(menu()).toBeNull();
    });

    test("ignores scrolls that don't move the anchor", () => {
      placeAnchorAt(300);
      clickOn(SENSE);

      document
        .getElementById("dict-results")!
        .dispatchEvent(new Event("scroll", { bubbles: false }));

      expect(menu()).not.toBeNull();
    });

    test("repositions on resize instead of closing", () => {
      placeAnchorAt(300);
      clickOn(SENSE);
      expect((menu() as HTMLElement).style.top).toBe("328px");

      placeAnchorAt(200);
      window.dispatchEvent(new Event("resize"));

      expect((menu() as HTMLElement).style.top).toBe("228px");
    });

    test("closes when another reader-chrome popover opens, and announces itself", () => {
      const announced = jest.fn();
      document.addEventListener("morcus:popover-will-open", announced);
      clickOn(SENSE);
      document.removeEventListener("morcus:popover-will-open", announced);
      expect(announced).toHaveBeenCalledTimes(1);

      document.dispatchEvent(
        new CustomEvent("morcus:popover-will-open", {
          detail: { source: {}, group: "reader-chrome" },
        })
      );

      expect(menu()).toBeNull();
    });

    test("is a manual popover, so native light-dismiss can't fight the toggle", () => {
      clickOn(SENSE);
      expect(menu()!.getAttribute("popover")).toBe("manual");
    });
  });

  describe("in-flow sense editing (Suggest correction)", () => {
    test("swaps sense content in-place, strips non-editorial widgets, and preserves nested <ol> and .lat-word tokens on cancel", () => {
      clickOn('a[href="#n20077.1"]');
      document
        .querySelector<HTMLButtonElement>(
          '.section-action-menu [data-action="edit"]'
        )!
        .click();

      const senseLi = document.getElementById("n20077.1")!;
      const editBox = senseLi.querySelector<HTMLElement>(".section-edit-box")!;
      expect(editBox).not.toBeNull();

      const textarea = editBox.querySelector<HTMLTextAreaElement>(
        ".section-edit-input"
      )!;
      // Excludes bullet "I.", excludes .mateo-embed-pane "Facsimile", and excludes child <ol> "Sub-sense text"
      expect(textarea.value).toBe("Lit., to have, aliquid");

      // Child <ol> remains outside the hidden stash
      const subSenseOl = senseLi.querySelector("ol.sense-list")!;
      expect(subSenseOl.closest("[hidden]")).toBeNull();

      // Cancel restores exact DOM including .lat-word token
      editBox.querySelector<HTMLButtonElement>(".section-edit-cancel")!.click();
      expect(senseLi.querySelector(".section-edit-box")).toBeNull();
      expect(senseLi.querySelector(".lat-word")?.textContent).toBe("aliquid");
      expect(document.activeElement).toBe(
        senseLi.querySelector('a[href="#n20077.1"]')
      );
    });

    test("resolves sense scope via anchor.parentElement for Smith & Hall blurb, Riddle & Arnold self-anchor, and Georges nested divs", () => {
      document.body.innerHTML = `
        <div id="dict-results">
          <article class="entry" id="sh57">
            <header class="entry-header">Header</header>
            <div id="sh57">
              <a href="#sh57" class="lsSenseBullet section-anchor"> • </a>
              <span class="lsOrth">Greetings</span>, welcome.
            </div>
            <ol><li id="sh57.0"><a href="#sh57.0" class="section-anchor">I.</a> First sense</li></ol>
          </article>
          <article class="entry" id="ra_dog">
            <div>
              <a id="ra_dog.1" href="#ra_dog.1" class="lsSenseBullet section-anchor"> 1. </a>
              <span class="lsQuote">canis</span>, a dog.
            </div>
          </article>
          <article class="entry" id="grg123">
            <div id="grg123.I">
              <a href="#grg123.I" class="lsSenseBullet section-anchor">I)</a>
              eig.: parent text
              <div id="grg123.I.1">
                <a href="#grg123.I.1" class="lsSenseBullet section-anchor">1)</a>
                child sense text
              </div>
            </div>
          </article>
        </div>
      `;

      // 1. Smith & Hall blurb (#sh57 inside article#sh57)
      clickOn('a[href="#sh57"]');
      document
        .querySelector<HTMLButtonElement>(
          '.section-action-menu [data-action="edit"]'
        )!
        .click();
      let textarea = document.querySelector<HTMLTextAreaElement>(
        ".section-edit-input"
      )!;
      expect(textarea.value).toBe("Greetings, welcome.");
      // Entry header and <ol> were not swallowed into the stash
      expect(
        document.querySelector(".entry-header")?.closest("[hidden]")
      ).toBeNull();
      document
        .querySelector<HTMLButtonElement>(".section-edit-cancel")!
        .click();

      // 2. Riddle & Arnold self-targeted anchor (id="ra_dog.1" on the <a> itself)
      clickOn('a[href="#ra_dog.1"]');
      document
        .querySelector<HTMLButtonElement>(
          '.section-action-menu [data-action="edit"]'
        )!
        .click();
      textarea = document.querySelector<HTMLTextAreaElement>(
        ".section-edit-input"
      )!;
      expect(textarea.value).toBe("canis, a dog.");
      document
        .querySelector<HTMLButtonElement>(".section-edit-cancel")!
        .click();

      // 3. Georges nested sub-sense div (#grg123.I containing #grg123.I.1)
      clickOn('a[href="#grg123.I"]');
      document
        .querySelector<HTMLButtonElement>(
          '.section-action-menu [data-action="edit"]'
        )!
        .click();
      textarea = document.querySelector<HTMLTextAreaElement>(
        ".section-edit-input"
      )!;
      expect(textarea.value).toBe("eig.: parent text");
      expect(
        document.getElementById("grg123.I.1")?.closest("[hidden]")
      ).toBeNull();
      document
        .querySelector<HTMLButtonElement>(".section-edit-cancel")!
        .click();
    });

    test("auto-closes unmodified editor on outside click, but retains dirty editor with toast", () => {
      clickOn('a[href="#n20077.1"]');
      document
        .querySelector<HTMLButtonElement>(
          '.section-action-menu [data-action="edit"]'
        )!
        .click();

      expect(document.querySelector(".section-edit-box")).not.toBeNull();

      // Unmodified outside click auto-closes
      document.body.click();
      expect(document.querySelector(".section-edit-box")).toBeNull();

      // Re-open and modify
      clickOn('a[href="#n20077.1"]');
      document
        .querySelector<HTMLButtonElement>(
          '.section-action-menu [data-action="edit"]'
        )!
        .click();
      const textarea = document.querySelector<HTMLTextAreaElement>(
        ".section-edit-input"
      )!;
      textarea.value = "Lit., to hold, aliquid";

      // Outside click while dirty keeps editor open and shows toast
      document.body.click();
      expect(document.querySelector(".section-edit-box")).not.toBeNull();
      expect(showToast).toHaveBeenCalledWith(
        "Submit or cancel your current edit first"
      );

      // Clicking another section's anchor while dirty also keeps current editor open
      (showToast as jest.Mock).mockClear();
      clickOn('a[href="#n20077.2"]');
      expect(document.querySelectorAll(".section-edit-box")).toHaveLength(1);
      expect(document.querySelector(".section-action-menu")).toBeNull();
      expect(showToast).toHaveBeenCalledWith(
        "Submit or cancel your current edit first"
      );

      // Pressing Escape inside the editor cancels even when dirty
      textarea.focus();
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
      );
      expect(document.querySelector(".section-edit-box")).toBeNull();
    });

    describe("Escape focus context", () => {
      function openEditor(dirty: boolean): HTMLTextAreaElement {
        clickOn('a[href="#n20077.1"]');
        document
          .querySelector<HTMLButtonElement>(
            '.section-action-menu [data-action="edit"]'
          )!
          .click();
        const textarea = document.querySelector<HTMLTextAreaElement>(
          ".section-edit-input"
        )!;
        if (dirty) textarea.value = "Lit., to hold, aliquid";
        return textarea;
      }

      function escapeOn(target: EventTarget): KeyboardEvent {
        const e = new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        });
        target.dispatchEvent(e);
        return e;
      }

      const box = () => document.querySelector(".section-edit-box");

      test.each([
        ["clean", false],
        ["dirty", true],
      ])("a %s editor ignores Escape from an external input", (_, dirty) => {
        document.body.insertAdjacentHTML("beforeend", `<input id="search">`);
        openEditor(dirty);
        const search = document.getElementById("search")!;
        search.focus();
        const e = escapeOn(search);
        expect(box()).not.toBeNull();
        expect(e.defaultPrevented).toBe(false);
        expect(showToast).not.toHaveBeenCalledWith(
          "Submit or cancel your current edit first"
        );
      });

      test("Escape from <body> closes a clean editor", () => {
        openEditor(false);
        (document.activeElement as HTMLElement | null)?.blur();
        escapeOn(document.body);
        expect(box()).toBeNull();
      });

      test("Escape from <body> keeps a dirty editor and shows a toast", () => {
        openEditor(true);
        (document.activeElement as HTMLElement | null)?.blur();
        escapeOn(document.body);
        expect(box()).not.toBeNull();
        expect(showToast).toHaveBeenCalledWith(
          "Submit or cancel your current edit first"
        );
      });

      test("Escape on a focused .lsHover closes only the abbr popover", () => {
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div id="abbr-popover"></div><span class="lsHover" tabindex="0" title="Cicero">Cic.</span>`
        );
        openEditor(true);
        const unbindAbbr = setupAbbrPopover(document, window);
        const abbr = document.querySelector<HTMLElement>(".lsHover")!;
        const popover = document.getElementById("abbr-popover")!;
        abbr.focus();
        abbr.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
          })
        );
        expect(popover.style.display).toBe("block");
        escapeOn(abbr);
        expect(popover.style.display).toBe("none");
        expect(box()).not.toBeNull();
        unbindAbbr();
      });
    });

    test("submits editedText with userEdit tag to /api/report and restores DOM", async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      clickOn('a[href="#n20077.1"]');
      document
        .querySelector<HTMLButtonElement>(
          '.section-action-menu [data-action="edit"]'
        )!
        .click();

      const textarea = document.querySelector<HTMLTextAreaElement>(
        ".section-edit-input"
      )!;
      textarea.value = "Lit., to hold, aliquid";

      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          bubbles: true,
        })
      );
      await flush();

      expect(fetchMock).toHaveBeenCalledWith("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editedText: {
            original: "Lit., to have, aliquid",
            edited: "Lit., to hold, aliquid",
            sectionId: "n20077.1",
          },
          tags: ["userEdit"],
          url: `${ORIGIN}/dicts/id/n20077#n20077.1`,
        }),
      });
      expect(document.querySelector(".section-edit-box")).toBeNull();
      expect(showToast).toHaveBeenCalledWith(
        "✓ Correction submitted! Thank you."
      );
    });
  });
});
