/**
 * @jest-environment jsdom
 */

import "@/web/ui/corpus/corpus_view.client";
import type { CorpusQueryResult } from "@/common/library/corpus/corpus_common";
import type { CorpusQueryRequest } from "@/common/library/corpus/corpus_common";
import {
  parseCorpusParams,
  runCorpusSearch,
} from "@/web/ui/corpus/corpus_query.server";
import {
  renderCorpusContentHtml,
  renderCorpusPartialHtml,
} from "@/web/ui/corpus/corpus_view.server";
import {
  CORPUS_TEST_AUTHORS,
  fakeCorpusEngine,
  fakeResult,
} from "@/web/ui/testing/fake_corpus_engine";

jest.mock("@/web/ui/reader/reader_loader.server", () =>
  jest.requireActual("@/web/ui/testing/mock_reader_loader")
);

const NEXT = { resultId: 1, resultIndex: 50, candidateIndex: 0 };

/** Every query has a next page, so the pager always renders. */
const engine = fakeCorpusEngine(
  (_req: CorpusQueryRequest): CorpusQueryResult =>
    fakeResult({ resultStats: { estimatedResults: 200 }, nextPage: NEXT })
);

async function serverHtml(
  url: string,
  render: typeof renderCorpusContentHtml
): Promise<string> {
  const search = new URL(url, window.location.origin).searchParams;
  const view = await runCorpusSearch(
    parseCorpusParams(Object.fromEntries(search)),
    engine,
    CORPUS_TEST_AUTHORS
  );
  return render(view);
}

/** Answers every fetch with the real partial for its URL. */
function serveSlots(): jest.Mock {
  const mock = jest.fn().mockImplementation(async (url: string) => {
    const body = await serverHtml(url, renderCorpusPartialHtml);
    return { ok: true, status: 200, text: async () => body };
  });
  window.fetch = mock;
  return mock;
}

async function mount(url: string): Promise<HTMLElement> {
  window.history.replaceState(null, "", url);
  document.body.innerHTML = await serverHtml(url, renderCorpusContentHtml);
  const host = document.body.querySelector<HTMLElement>("morcus-corpus-view");
  if (!host) throw new Error("no host");
  return host;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function input(name: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (!el) throw new Error(`no ${name}`);
  return el;
}

function currentPath(): string {
  return window.location.pathname + window.location.search;
}

function click(el: Element | null, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...init,
  });
  el?.dispatchEvent(event);
  return event;
}

describe("<morcus-corpus-view>", () => {
  const originalFetch = window.fetch;

  afterEach(() => {
    window.fetch = originalFetch;
    document.body.innerHTML = "";
  });

  test("a submit swaps the slots and pushes the URL", async () => {
    await mount("/corpus");
    const fetchMock = serveSlots();
    const settings = document.querySelector<HTMLDetailsElement>(
      "details.corpus-settings"
    );
    if (settings) settings.open = true;
    const historyLength = window.history.length;

    input("q").value = " omnis ";
    input("strictMode").checked = true;
    const submit = new Event("submit", { cancelable: true });
    document.querySelector("form.corpus-form")?.dispatchEvent(submit);
    await settle();

    const expected = "/corpus?q=omnis&contextLen=20&pageSize=50&strictMode=1";
    expect(submit.defaultPrevented).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expected, expect.anything());
    expect(currentPath()).toBe(expected);
    expect(window.history.length).toBe(historyLength + 1);
    expect(document.querySelector(".corpus-result")).not.toBeNull();
    expect(document.querySelector(".inflect-chip.is-on")?.textContent).toBe(
      "Strict"
    );
    expect(settings?.open).toBe(false);
    expect(input("q").value).toBe("omnis");
  });

  test("resubmitting the same query doesn't add a history entry", async () => {
    await mount("/corpus?q=omnis&contextLen=20&pageSize=50");
    serveSlots();
    const historyLength = window.history.length;

    document
      .querySelector("form.corpus-form")
      ?.dispatchEvent(new Event("submit", { cancelable: true }));
    await settle();

    expect(window.history.length).toBe(historyLength);
  });

  test("the Next link swaps in the next page, scrolls instantly to the summary, and moves focus there", async () => {
    await mount("/corpus?q=omnis&contextLen=20&pageSize=50");
    const fetchMock = serveSlots();
    const origScrollTo = window.scrollTo;
    const scrollToSpy = jest.fn();
    window.scrollTo = scrollToSpy;

    try {
      const next = document.querySelector<HTMLAnchorElement>(".corpus-next");
      next?.focus();
      const event = click(next);
      await settle();

      const expected =
        "/corpus?q=omnis&contextLen=20&pageSize=50&cursor=1-50-0";
      expect(event.defaultPrevented).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(expected, expect.anything());
      expect(currentPath()).toBe(expected);
      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: "instant" })
      );
      const summary = document.querySelector<HTMLElement>(".corpus-summary");
      expect(summary?.getAttribute("tabindex")).toBe("-1");
      expect(document.activeElement).toBe(summary);
    } finally {
      window.scrollTo = origScrollTo;
    }
  });

  test("a newer navigation supersedes an older one", async () => {
    await mount("/corpus");
    const pending: Array<() => void> = [];
    window.fetch = jest
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        const body = await serverHtml(url, renderCorpusPartialHtml);
        // Hold every response until the test releases it.
        await new Promise<void>((resolve) => pending.push(resolve));
        if (init?.signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        return { ok: true, status: 200, text: async () => body };
      });
    const form = document.querySelector("form.corpus-form");

    input("q").value = "first";
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await settle();
    input("q").value = "second";
    form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await settle();
    // Release the older request last.
    pending[1]();
    await settle();
    pending[0]();
    await settle();

    expect(document.querySelector(".corpus-query-echo")?.textContent).toBe(
      "second"
    );
    expect(currentPath()).toBe("/corpus?q=second&contextLen=20&pageSize=50");
  });

  test("modified clicks are left to the browser", async () => {
    await mount("/corpus?q=omnis&contextLen=20&pageSize=50");
    const fetchMock = serveSlots();
    // jsdom logs that it can't follow the link natively.
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const event = click(document.querySelector(".corpus-next"), {
      ctrlKey: true,
    });
    await settle();
    consoleError.mockRestore();

    expect(event.defaultPrevented).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a help example link runs the example and fills the form", async () => {
    await mount("/corpus?q=omnis&contextLen=7&pageSize=50");
    serveSlots();

    const example = document.querySelector<HTMLAnchorElement>(
      ".corpus-help a[data-corpus-nav]"
    );
    const exampleQuery = example?.textContent ?? "";
    click(example);
    await settle();

    expect(input("q").value).toBe(exampleQuery);
    // The example link carries no settings, so the defaults apply.
    expect(input("contextLen").value).toBe("20");
  });

  test("back/forward re-swaps and resyncs the form", async () => {
    await mount("/corpus?q=omnis&contextLen=20&pageSize=50");
    const fetchMock = serveSlots();

    const target = "/corpus?q=amoris&contextLen=5&pageSize=10&strictMode=1";
    window.history.pushState(null, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle();

    expect(fetchMock).toHaveBeenCalledWith(target, expect.anything());
    expect(input("q").value).toBe("amoris");
    expect(input("contextLen").value).toBe("5");
    expect(input("pageSize").value).toBe("10");
    expect(input("strictMode").checked).toBe(true);
    expect(currentPath()).toBe(target);
  });

  test("CORP-06: settings popover closes on Escape (focusing summary) and outside pointerdown, and restores uncommitted inputs without mutating tray chips on change", async () => {
    await mount("/corpus?q=omnis&contextLen=20&pageSize=50");
    serveSlots();
    const settings = document.querySelector<HTMLDetailsElement>(
      "details.corpus-settings"
    )!;
    const summary = settings.querySelector<HTMLElement>("summary")!;
    const trayText = () =>
      (
        document.querySelector('[data-slot="settings-summary"]')?.textContent ??
        ""
      )
        .replace(/\s+/g, " ")
        .trim();

    // Open settings and edit inputs without submitting.
    settings.open = true;
    input("contextLen").focus();
    input("contextLen").value = "15";
    input("contextLen").dispatchEvent(new Event("change", { bubbles: true }));
    input("strictMode").checked = true;
    input("strictMode").dispatchEvent(new Event("change", { bubbles: true }));

    // Tray chips must not change before Apply/submit.
    expect(trayText()).toBe("Context 20 • Page size 50 • Inflections Relaxed");

    // Pressing Escape closes settings, focuses summary, and restores uncommitted inputs.
    input("contextLen").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(settings.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    expect(input("contextLen").value).toBe("20");
    expect(input("strictMode").checked).toBe(false);

    // Reopen, edit, and dismiss via outside pointerdown/mousedown.
    settings.open = true;
    input("pageSize").value = "10";
    document.body.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );
    expect(settings.open).toBe(false);
    expect(input("pageSize").value).toBe("50");
    expect(trayText()).toBe("Context 20 • Page size 50 • Inflections Relaxed");
  });

  test("CORP-06: clicking Apply submits a dirty query even when settings numbers were not changed and closes settings", async () => {
    await mount("/corpus?q=omnis&contextLen=20&pageSize=50");
    const fetchMock = serveSlots();
    const settings = document.querySelector<HTMLDetailsElement>(
      "details.corpus-settings"
    )!;
    const applyBtn = settings.querySelector<HTMLButtonElement>(
      ".settings-apply-btn"
    )!;

    input("q").value = "amoris";
    settings.open = true;
    click(applyBtn);
    await settle();

    const expected = "/corpus?q=amoris&contextLen=20&pageSize=50";
    expect(settings.open).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(expected, expect.anything());
    expect(currentPath()).toBe(expected);
    expect(input("q").value).toBe("amoris");
  });

  test("CORP-07: clicking a sample query card in the Syntax Guide closes the enclosing <details> before running the search", async () => {
    await mount("/corpus?q=omnis&contextLen=20&pageSize=50");
    serveSlots();

    const inlineGuide = document.querySelector<HTMLDetailsElement>(
      "details.corpus-syntax-details"
    )!;
    inlineGuide.open = true;
    const mobileSubaccordion = inlineGuide.querySelector<HTMLDetailsElement>(
      "details.guide-subaccordion:last-of-type"
    )!;
    mobileSubaccordion.open = true;

    const card = mobileSubaccordion.querySelector<HTMLAnchorElement>(
      "a.guide-mobile-example[data-corpus-nav]"
    )!;
    click(card);
    expect(mobileSubaccordion.hasAttribute("open")).toBe(false);
    expect(inlineGuide.hasAttribute("open")).toBe(false);
    await settle();

    expect(
      document
        .querySelector("details.corpus-syntax-details")
        ?.hasAttribute("open")
    ).toBe(false);
  });

  test("CORP-08: applying settings on Page 2+ resets cursor/pageStart to page 1, and Browser Back from Page 2 to Page 1 re-fetches Page 1", async () => {
    await mount("/corpus?q=omnis&contextLen=20&pageSize=50");
    const fetchMock = serveSlots();

    // Navigate to Page 2 via Next link.
    click(document.querySelector(".corpus-next"));
    await settle();
    expect(currentPath()).toBe(
      "/corpus?q=omnis&contextLen=20&pageSize=50&cursor=1-50-0"
    );
    expect(
      document.querySelector("ol.corpus-result-list")?.getAttribute("start")
    ).toBe("51");

    // Browser Back to Page 1 (where cursor is absent) re-fetches and renders Page 1.
    window.history.pushState(
      null,
      "",
      "/corpus?q=omnis&contextLen=20&pageSize=50"
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/corpus?q=omnis&contextLen=20&pageSize=50",
      expect.anything()
    );
    expect(
      document.querySelector("ol.corpus-result-list")?.getAttribute("start")
    ).toBe("1");

    // Navigate to Page 2 again, then click Apply in settings: resets to Page 1.
    click(document.querySelector(".corpus-next"));
    await settle();
    expect(
      document.querySelector("ol.corpus-result-list")?.getAttribute("start")
    ).toBe("51");

    input("contextLen").value = "10";
    click(document.querySelector(".settings-apply-btn"));
    await settle();
    expect(currentPath()).toBe("/corpus?q=omnis&contextLen=10&pageSize=50");
    expect(
      document.querySelector("ol.corpus-result-list")?.getAttribute("start")
    ).toBe("1");
  });
});
