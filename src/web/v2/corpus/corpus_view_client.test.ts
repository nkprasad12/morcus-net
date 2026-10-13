/**
 * @jest-environment jsdom
 */

import "@/web/v2/corpus/corpus_view.client";
import type { CorpusQueryResult } from "@/common/library/corpus/corpus_common";
import type { CorpusQueryRequest } from "@/web/api_routes";
import {
  parseCorpusParams,
  runCorpusSearch,
} from "@/web/v2/corpus/corpus_query.server";
import {
  renderCorpusContentHtml,
  renderCorpusPartialHtml,
} from "@/web/v2/corpus/corpus_view.server";
import {
  CORPUS_TEST_AUTHORS,
  fakeCorpusEngine,
  fakeResult,
} from "@/web/v2/testing/fake_corpus_engine";

jest.mock("@/web/v2/reader/reader_loader.server", () =>
  jest.requireActual("@/web/v2/testing/mock_reader_loader")
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
    await mount("/v2/corpus");
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

    const expected =
      "/v2/corpus?q=omnis&contextLen=20&pageSize=50&strictMode=1";
    expect(submit.defaultPrevented).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expected, expect.anything());
    expect(currentPath()).toBe(expected);
    expect(window.history.length).toBe(historyLength + 1);
    expect(document.title).toBe("Corpus: omnis - Morcus Latin Tools");
    expect(document.querySelector(".corpus-result")).not.toBeNull();
    expect(document.querySelector(".inflect-chip.is-on")?.textContent).toBe(
      "Strict"
    );
    expect(settings?.open).toBe(false);
    expect(input("q").value).toBe("omnis");
  });

  test("resubmitting the same query doesn't add a history entry", async () => {
    await mount("/v2/corpus?q=omnis&contextLen=20&pageSize=50");
    serveSlots();
    const historyLength = window.history.length;

    document
      .querySelector("form.corpus-form")
      ?.dispatchEvent(new Event("submit", { cancelable: true }));
    await settle();

    expect(window.history.length).toBe(historyLength);
  });

  test("the Next link swaps in the next page and scrolls to the results", async () => {
    await mount("/v2/corpus?q=omnis&contextLen=20&pageSize=50");
    const fetchMock = serveSlots();
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };

    const next = document.querySelector<HTMLAnchorElement>(".corpus-next");
    next?.focus();
    const event = click(next);
    await settle();

    const expected =
      "/v2/corpus?q=omnis&contextLen=20&pageSize=50&cursor=1-50-0";
    expect(event.defaultPrevented).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expected, expect.anything());
    expect(currentPath()).toBe(expected);
    // Focus follows the link into the new pager (`data-focus-key`).
    expect(document.activeElement?.getAttribute("data-focus-key")).toBe(
      "corpus-next"
    );
    expect(document.activeElement).not.toBe(next);
    expect(scrolled.map((el) => el.getAttribute("data-slot"))).toEqual([
      "results",
    ]);
  });

  test("a newer navigation supersedes an older one", async () => {
    await mount("/v2/corpus");
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
    expect(currentPath()).toBe("/v2/corpus?q=second&contextLen=20&pageSize=50");
  });

  test("modified clicks are left to the browser", async () => {
    await mount("/v2/corpus?q=omnis&contextLen=20&pageSize=50");
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
    await mount("/v2/corpus?q=omnis&contextLen=7&pageSize=50");
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
    expect(document.title).toBe(`Corpus: ${exampleQuery} - Morcus Latin Tools`);
  });

  test("back/forward re-swaps and resyncs the form", async () => {
    await mount("/v2/corpus?q=omnis&contextLen=20&pageSize=50");
    const fetchMock = serveSlots();

    const target = "/v2/corpus?q=amoris&contextLen=5&pageSize=10&strictMode=1";
    window.history.pushState(null, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle();

    expect(fetchMock).toHaveBeenCalledWith(target, expect.anything());
    expect(input("q").value).toBe("amoris");
    expect(input("contextLen").value).toBe("5");
    expect(input("pageSize").value).toBe("10");
    expect(input("strictMode").checked).toBe(true);
    expect(document.title).toBe("Corpus: amoris - Morcus Latin Tools");
    expect(currentPath()).toBe(target);
  });

  test("the title reads q the way the server does, trimmed", async () => {
    await mount("/v2/corpus?q=omnis&contextLen=20&pageSize=50");
    serveSlots();

    window.history.pushState(null, "", "/v2/corpus?q=++amoris+");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle();
    expect(document.title).toBe("Corpus: amoris - Morcus Latin Tools");

    window.history.pushState(null, "", "/v2/corpus?q=+++");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle();
    expect(document.title).toBe("Corpus Query - Morcus Latin Tools");
  });
});
