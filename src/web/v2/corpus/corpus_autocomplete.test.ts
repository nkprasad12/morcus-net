/**
 * @jest-environment jsdom
 */

import "@/web/v2/corpus/corpus_autocomplete.client";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  LemmaShardCache,
  MAX_LEMMA_ROWS,
  corpusSuggestions,
  type CorpusSuggestion,
  type SuggestionSources,
} from "@/web/v2/corpus/corpus_autocomplete.client";
import { CONTEXT_LEN, PAGE_SIZE } from "@/web/v2/corpus/corpus_params.common";
import type { CorpusSearchView } from "@/web/v2/corpus/corpus_query.server";
import { renderCorpusContentHtml } from "@/web/v2/corpus/corpus_view.server";
import { CORPUS_TEST_AUTHORS } from "@/web/v2/testing/fake_corpus_engine";

// // // // // // // // // //
// corpusSuggestions        //
// // // // // // // // // //

/**
 * One line per row: `ℹ`/`❌` for status rows (`<placeholder>` first), else
 * `prefix[option] help => "replacement"`.
 */
function show(rows: readonly CorpusSuggestion[]): string[] {
  return rows.map((row) => {
    if ("status" in row) {
      const icon = row.status === "error" ? "❌" : "ℹ";
      const placeholder =
        row.placeholder === undefined ? "" : `<${row.placeholder}> `;
      return `${icon} ${placeholder}${row.message}`;
    }
    const help = row.help === undefined ? "" : ` ${row.help}`;
    const replacement =
      row.replacement === undefined
        ? ""
        : ` => ${JSON.stringify(row.replacement)}`;
    return `${row.prefix ?? ""}[${row.option}]${help}${replacement}`;
  });
}

function suggest(input: string, sources?: SuggestionSources): string[] {
  return show(
    corpusSuggestions(input, sources ?? { authors: CORPUS_TEST_AUTHORS })
  );
}

describe("corpusSuggestions", () => {
  test("an empty query: what can start one", () => {
    expect(suggest("")).toEqual([
      "[#] search in author",
      "ℹ <word> match exact word",
      "[@] match lemma or inflection",
    ]);
  });

  test("after a word: the next word, the first operator (which adds the paren), proximity", () => {
    expect(suggest("amor ")).toEqual([
      "ℹ <word> followed by exact word",
      "[@] followed by lemma or inflection",
      '[and ] (restrict further) => "(amor and "',
      '[or ] (relax restriction) => "(amor or "',
      "[~] around",
    ]);
  });

  test("inside a parenthesized term: only the same operator, or the close paren", () => {
    expect(suggest("(amor and ")).toEqual([
      "ℹ <word> match exact word",
      "[@] match lemma or inflection",
    ]);
    expect(suggest("(amor and et ")).toEqual([
      "[and ] (restrict further)",
      "[) ] done filtering word",
    ]);
  });

  test("after a close paren: no more operators", () => {
    expect(suggest("(amor and et)")).toEqual([
      "ℹ <word> followed by exact word",
      "[@] followed by lemma or inflection",
      "[~] around",
    ]);
  });

  test("a word being typed, with operators once there's a word before it", () => {
    expect(suggest("amor")).toEqual(["ℹ the word `amor`"]);
    expect(suggest("amor et")).toEqual([
      "ℹ the word `et`",
      "et[ and ] (restrict further)",
      "et[ or ] (relax restriction)",
    ]);
  });

  test("new-token errors from the grammar and from earlier tokens", () => {
    expect(suggest("and ")).toEqual(["❌ `and` not allowed at start"]);
    expect(suggest("#Nobody ")).toEqual(["❌ invalid author #Nobody"]);
    expect(suggest("@case:xyz ")).toEqual([
      "❌ @case:xyz - invalid option `xyz`",
    ]);
    // Without the author list, authors can't be checked.
    expect(suggest("#Nobody ", {})).toEqual([
      "ℹ <word> match exact word",
      "[@] match lemma or inflection",
    ]);
  });

  describe("#author", () => {
    test("completes in the corpus's case, and skips names with spaces", () => {
      expect(suggest("#")).toEqual([
        '#[Caesar ] => "#Caesar "',
        '#[Cicero ] => "#Cicero "',
      ]);
      expect(suggest("#ci")).toEqual(['#Ci[cero ] => "#Cicero "']);
      expect(suggest("#se")).toEqual(["❌ no author matches `#se`"]);
    });

    test("must come first, and only once", () => {
      expect(suggest("amor #c")).toEqual([
        "❌ #author filters must be at start",
      ]);
      expect(suggest("#Caesar #c")).toEqual([
        "❌ only one #author filter allowed",
      ]);
    });

    test("without the author list", () => {
      expect(suggest("#c", {})).toEqual(["ℹ the author list is unavailable"]);
    });
  });

  describe("@keyword", () => {
    test("a bare @ lists every keyword", () => {
      expect(suggest("@")).toEqual([
        "@[lemma:] filter by lemma",
        "@[case:] filter by case",
        "@[tense:] filter by tense",
        "@[voice:] filter by voice",
        "@[person:] filter by person",
        "@[number:] filter by number",
        "@[gender:] filter by gender",
        "@[mood:] filter by mood",
      ]);
    });

    test("keywords, then inflection values by name, written in short form", () => {
      expect(suggest("@p")).toEqual([
        "@p[erson:] filter by person",
        '@[m:participle ] mood => "@m:part "',
        '@[v:passive ] voice => "@v:pass "',
        '@[t:perfect ] tense => "@t:perf "',
        '@[t:pluperfect ] tense => "@t:plup "',
        '@[n:plural ] number => "@n:plur "',
        '@[t:present ] tense => "@t:pres "',
      ]);
      expect(suggest("amor @da")).toEqual([
        '@[c:dative ] case => "amor @c:dat "',
      ]);
    });

    test("an unknown keyword", () => {
      expect(suggest("@zz")).toEqual(["❌ invalid keyword @zz"]);
      expect(suggest("@q:foo")).toEqual(["❌ invalid keyword @q"]);
    });

    test("inflection values", () => {
      expect(suggest("@case:")).toEqual([
        "@case:[nominative ]",
        "@case:[genitive ]",
        "@case:[dative ]",
        "@case:[accusative ]",
        "@case:[ablative ]",
        "@case:[vocative ]",
      ]);
      expect(suggest("@c:dat")).toEqual(["@c:dat[ive ]"]);
      expect(suggest("@case:xyz")).toEqual([
        "❌ @case:xyz - invalid option `xyz`",
      ]);
    });

    test("a complete value, long or short, with operators after a word", () => {
      expect(suggest("@case:dative")).toEqual(["ℹ a word with dative case"]);
      expect(suggest("@t:impf")).toEqual(["ℹ a word with impf tense"]);
      expect(suggest("amor @case:dative")).toEqual([
        "ℹ a word with dative case",
        "@case:dative[ and ] (restrict further)",
        "@case:dative[ or ] (relax restriction)",
      ]);
    });
  });

  describe("@lemma", () => {
    const lemmata = (found: readonly string[] | null | undefined) => ({
      lemmata: () => found,
    });

    test("before the first letter", () => {
      expect(suggest("@lemma:", lemmata([]))).toEqual([
        "ℹ start typing for completions",
      ]);
      expect(suggest("@lemma:", {})).toEqual(["ℹ an exact lemma"]);
    });

    test("completes from the source", () => {
      expect(suggest("@l:cae", lemmata(["caedes", "caedo"]))).toEqual([
        "@l:cae[des ]",
        "@l:cae[do ]",
      ]);
      expect(suggest("@l:xyz", lemmata([]))).toEqual([
        "❌ no lemma matches `xyz`",
      ]);
    });

    test("while loading, or when the shard failed", () => {
      expect(suggest("@l:cae", lemmata(undefined))).toEqual([
        "ℹ the lemma `cae`",
      ]);
      expect(suggest("@l:cae", lemmata(null))).toEqual(["ℹ the lemma `cae`"]);
    });
  });

  describe("~proximity", () => {
    test("a bare ~ offers common distances", () => {
      expect(suggest("~")).toEqual([
        "~[ ] within 5 words of",
        "~[> ] within 5 words before",
        "~[3 ] within 3 words of",
        "~[10 ] within 10 words of",
        "~[15 ] within 15 words of",
      ]);
    });

    test("explains a distance, and offers the directed form", () => {
      expect(suggest("~3")).toEqual([
        "ℹ within 3 words of",
        "~3[>] within 3 words before",
      ]);
      expect(suggest("~3>")).toEqual(["ℹ within 3 words before"]);
    });

    test("errors", () => {
      expect(suggest("~20")).toEqual(["❌ range after ~ must be 1-15"]);
      expect(suggest("~x")).toEqual([
        "❌ invalid `~x`: expected ~, ~N, or ~N>",
      ]);
    });
  });
});

// // // // // // // // // //
// LemmaShardCache          //
// // // // // // // // // //

interface FetchControl {
  readonly mock: jest.Mock;
  /** Settles the `i`th request (default: the first). */
  respond(body: unknown, init?: { ok?: boolean; status?: number }): void;
  fail(error: Error, i?: number): void;
}

/** Replaces `fetch` with requests the test settles by hand. */
function controlFetch(): FetchControl {
  const pending: {
    resolve: (res: Response) => void;
    reject: (err: Error) => void;
  }[] = [];
  const mock = jest.fn(
    () =>
      new Promise<Response>((resolve, reject) => {
        pending.push({ resolve, reject });
      })
  );
  window.fetch = mock;
  return {
    mock,
    respond: (body, { ok = true, status = 200 } = {}) =>
      pending.shift()?.resolve({
        ok,
        status,
        json: () => Promise.resolve(body),
      } as unknown as Response),
    fail: (error) => pending.shift()?.reject(error),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("LemmaShardCache", () => {
  const originalFetch = window.fetch;

  afterEach(() => {
    window.fetch = originalFetch;
    delete document.documentElement.dataset.version;
    jest.restoreAllMocks();
  });

  test("shares one request per letter, then binary-searches the shard", async () => {
    document.documentElement.dataset.version = "abc";
    const fetch = controlFetch();
    const cache = new LemmaShardCache();

    expect(cache.complete("ca", 50)).toBeUndefined();
    const first = cache.load("c");
    const second = cache.load("Cae");
    expect(second).toBe(first);
    expect(fetch.mock.mock.calls).toEqual([["/api/corpus/lemmata/c?v=abc"]]);

    fetch.respond(["Caesar", "Cato", "cado", "caedes", "caedo", "canis"]);
    await first;

    // The first letter as typed, the rest lowercase (as in V1).
    expect(cache.complete("cae", 50)).toEqual(["caedes", "caedo"]);
    expect(cache.complete("cAE", 50)).toEqual(["caedes", "caedo"]);
    expect(cache.complete("Ca", 50)).toEqual(["Caesar", "Cato"]);
    expect(cache.complete("c", 2)).toEqual(["cado", "caedes"]);
    expect(cache.complete("cz", 50)).toEqual([]);
    // Loaded now, so no more requests.
    await cache.load("c");
    expect(fetch.mock).toHaveBeenCalledTimes(1);
  });

  test("without a page build version, the URL has no query", () => {
    const fetch = controlFetch();
    void new LemmaShardCache().load("x");
    expect(fetch.mock).toHaveBeenCalledWith("/api/corpus/lemmata/x");
  });

  test("a failed shard is remembered as unavailable, not retried", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = controlFetch();
    const cache = new LemmaShardCache();

    const load = cache.load("p");
    fetch.respond({ error: "unavailable" }, { ok: false, status: 503 });
    await load;
    expect(cache.complete("pa", 50)).toBeNull();

    await cache.load("p");
    expect(fetch.mock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  test("a network error or a malformed body is unavailable too", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = controlFetch();
    const cache = new LemmaShardCache();

    const network = cache.load("n");
    fetch.fail(new Error("offline"));
    const malformed = cache.load("m");
    fetch.respond({ not: "a list" });
    await Promise.all([network, malformed]);

    expect(cache.complete("na", 50)).toBeNull();
    expect(cache.complete("ma", 50)).toBeNull();
  });
});

// // // // // // // // // //
// <morcus-corpus-suggestions>
// // // // // // // // // //

function landingView(authors: readonly string[] | undefined): CorpusSearchView {
  return {
    params: {
      q: "",
      pageSize: PAGE_SIZE.default,
      contextLen: CONTEXT_LEN.default,
      strictMode: false,
    },
    outcome: { kind: "landing" },
    showInflectionDisclaimer: false,
    authors,
  };
}

interface Mounted {
  readonly input: HTMLInputElement;
  readonly listbox: HTMLUListElement;
  readonly form: HTMLFormElement;
}

/** Renders the real corpus page content and returns its parts. */
function mount(withAuthors: boolean = true): Mounted {
  document.body.innerHTML = renderCorpusContentHtml(
    landingView(withAuthors ? CORPUS_TEST_AUTHORS : undefined)
  );
  // The input lives in <morcus-corpus-view>, which this test doesn't define.
  // Mark it running, as on a live page, so the activation gate in
  // `LifetimeScope.listen` lets Enter / submit through.
  document
    .querySelector("morcus-corpus-view")
    ?.setAttribute("data-upgraded", "");
  const input = document.getElementById("corpus-q");
  const listbox = document.getElementById("corpus-suggestions");
  if (
    !(input instanceof HTMLInputElement) ||
    !(listbox instanceof HTMLUListElement) ||
    input.form === null
  ) {
    throw new Error("unexpected corpus markup");
  }
  return { input, listbox, form: input.form };
}

/** Replaces the input's text as if typed, with the caret at `caret`. */
function type(
  input: HTMLInputElement,
  text: string,
  caret: number = text.length
): void {
  input.value = text;
  input.setSelectionRange(caret, caret);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function press(
  input: HTMLInputElement,
  key: string,
  init: KeyboardEventInit = {}
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  input.dispatchEvent(event);
  return event;
}

/** Each row's text, with its help (if any) after ` | `. */
function rowTexts(listbox: HTMLElement): string[] {
  return Array.from(listbox.children, (li) => {
    const text = li.querySelector(".corpus-suggestion-text")?.textContent;
    const help = li.querySelector(".corpus-suggestion-help")?.textContent;
    return help === undefined ? `${text}` : `${text} | ${help}`;
  });
}

function activeRow(input: HTMLInputElement): string | null {
  const id = input.getAttribute("aria-activedescendant");
  if (id === null) return null;
  const row = document.getElementById(id);
  return row?.querySelector(".corpus-suggestion-text")?.textContent ?? "";
}

describe("<morcus-corpus-suggestions>", () => {
  const originalFetch = window.fetch;

  afterEach(() => {
    window.fetch = originalFetch;
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  test("makes the input a combobox over the server-rendered listbox", () => {
    const { input, listbox } = mount();

    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-controls")).toBe("corpus-suggestions");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(listbox.getAttribute("role")).toBe("listbox");
    expect(listbox.hidden).toBe(true);
    expect(listbox.children).toHaveLength(0);
  });

  test("focus shows what can start a query", () => {
    const { input, listbox } = mount();
    input.focus();

    expect(listbox.hidden).toBe(false);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(rowTexts(listbox)).toEqual([
      "# | search in author",
      "word | match exact word",
      "@ | match lemma or inflection",
    ]);
    const options = Array.from(listbox.children);
    expect(options.map((li) => li.id)).toEqual([
      "corpus-suggestions-0",
      "corpus-suggestions-1",
      "corpus-suggestions-2",
    ]);
    expect(options.map((li) => li.getAttribute("role"))).toEqual([
      "option",
      "option",
      "option",
    ]);
    // The placeholder row explains; it can't be chosen.
    expect(options[1].getAttribute("aria-disabled")).toBe("true");
  });

  test("arrows move the highlight, wrapping at both ends", () => {
    const { input, listbox } = mount();
    input.focus();
    type(input, "#");
    expect(rowTexts(listbox)).toEqual(["#Caesar ", "#Cicero "]);

    const down = press(input, "ArrowDown");
    expect(down.defaultPrevented).toBe(true);
    expect(input.getAttribute("aria-activedescendant")).toBe(
      "corpus-suggestions-0"
    );
    expect(listbox.children[0].getAttribute("aria-selected")).toBe("true");

    press(input, "ArrowDown");
    expect(activeRow(input)).toBe("#Cicero ");
    expect(listbox.children[0].getAttribute("aria-selected")).toBe("false");
    press(input, "ArrowDown");
    expect(activeRow(input)).toBe("#Caesar ");
    press(input, "ArrowUp");
    expect(activeRow(input)).toBe("#Cicero ");
  });

  test("ArrowUp with nothing highlighted starts from the last row", () => {
    const { input } = mount();
    input.focus();
    type(input, "#");
    press(input, "ArrowUp");
    expect(activeRow(input)).toBe("#Cicero ");
  });

  test("Enter chooses the highlighted completion and keeps focus", () => {
    const { input, listbox } = mount();
    input.focus();
    type(input, "#ci");
    press(input, "ArrowDown");
    const enter = press(input, "Enter");

    expect(enter.defaultPrevented).toBe(true);
    expect(input.value).toBe("#Cicero ");
    expect(input.selectionStart).toBe(8);
    expect(document.activeElement).toBe(input);
    // Suggestions follow on for the next token.
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    expect(rowTexts(listbox)).toEqual([
      "word | match exact word",
      "@ | match lemma or inflection",
    ]);
  });

  test("Enter with nothing highlighted closes the list and submits", () => {
    const { input, listbox } = mount();
    input.focus();
    type(input, "amor");
    const enter = press(input, "Enter");

    expect(enter.defaultPrevented).toBe(false);
    expect(listbox.hidden).toBe(true);
    expect(input.value).toBe("amor");
  });

  test("a completion is spliced in at the caret, reusing the space after it", () => {
    const { input } = mount();
    input.focus();
    type(input, "@case:da et", 8);
    press(input, "ArrowDown");
    press(input, "Enter");

    expect(input.value).toBe("@case:dative et");
    expect(input.selectionStart).toBe(13);
  });

  test("a replacement rewrites the text before the caret", () => {
    const { input, listbox } = mount();
    input.focus();
    type(input, "amor @da");
    expect(rowTexts(listbox)).toEqual(["@c:dative  | case"]);
    press(input, "ArrowDown");
    press(input, "Enter");

    expect(input.value).toBe("amor @c:dat ");
  });

  test("Tab chooses the highlighted completion, and otherwise moves on", () => {
    const { input, listbox } = mount();
    input.focus();
    type(input, "#ca");
    const plainTab = press(input, "Tab");
    expect(plainTab.defaultPrevented).toBe(false);
    expect(listbox.hidden).toBe(true);

    type(input, "#ca");
    press(input, "ArrowDown");
    expect(press(input, "Tab", { shiftKey: true }).defaultPrevented).toBe(
      false
    );

    type(input, "#ca");
    press(input, "ArrowDown");
    const tab = press(input, "Tab");
    expect(tab.defaultPrevented).toBe(true);
    expect(input.value).toBe("#Caesar ");
  });

  test("Escape closes the list until the next edit", () => {
    const { input, listbox } = mount();
    input.focus();
    const escape = press(input, "Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(listbox.hidden).toBe(true);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    // Closed already: leave Escape to whatever else wants it.
    expect(press(input, "Escape").defaultPrevented).toBe(false);

    type(input, "a");
    expect(listbox.hidden).toBe(false);
  });

  test("errors are status rows: reachable, labelled, never chosen", () => {
    const { input, listbox } = mount();
    input.focus();
    type(input, "#Nobody ");

    const [row] = Array.from(listbox.children);
    expect(rowTexts(listbox)).toEqual(["❌ invalid author #Nobody"]);
    expect(row.classList.contains("is-error")).toBe(true);
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row.getAttribute("aria-label")).toBe(
      "Error: invalid author #Nobody"
    );

    press(input, "ArrowDown");
    expect(input.getAttribute("aria-activedescendant")).toBe(row.id);
    const enter = press(input, "Enter");
    expect(enter.defaultPrevented).toBe(true);
    expect(input.value).toBe("#Nobody ");
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  });

  test("clicking a row chooses it without taking focus from the input", () => {
    const { input, listbox } = mount();
    input.focus();
    type(input, "#");

    const option = listbox.children[1].querySelector("b");
    const rightClick = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    option?.dispatchEvent(rightClick);
    expect(rightClick.defaultPrevented).toBe(true);
    expect(input.value).toBe("#");

    const click = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    option?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(input.value).toBe("#Cicero ");
    expect(document.activeElement).toBe(input);
  });

  test("blur and submit close the list", () => {
    const { input, listbox, form } = mount();
    input.focus();
    expect(listbox.hidden).toBe(false);
    input.blur();
    expect(listbox.hidden).toBe(true);

    input.focus();
    expect(listbox.hidden).toBe(false);
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(listbox.hidden).toBe(true);
  });

  test("ignores keys with modifiers and during composition", () => {
    const { input } = mount();
    input.focus();
    expect(press(input, "ArrowDown", { ctrlKey: true }).defaultPrevented).toBe(
      false
    );
    expect(
      press(input, "ArrowDown", { isComposing: true }).defaultPrevented
    ).toBe(false);
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  });

  test("follows the caret while open, but stays closed after Escape", () => {
    const { input, listbox } = mount();
    input.focus();
    type(input, "amor et");
    expect(rowTexts(listbox)[0]).toBe("the word `et`");

    input.setSelectionRange(4, 4);
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft" }));
    expect(rowTexts(listbox)).toEqual(["the word `amor`"]);

    press(input, "Escape");
    input.setSelectionRange(7, 7);
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "End" }));
    expect(listbox.hidden).toBe(true);
  });

  test("without data-authors, author completion says the list is unavailable", () => {
    const { input, listbox } = mount(false);
    expect(
      document
        .querySelector("morcus-corpus-suggestions")
        ?.hasAttribute("data-authors")
    ).toBe(false);
    input.focus();
    type(input, "#c");
    expect(rowTexts(listbox)).toEqual(["the author list is unavailable"]);
  });

  test("adopts text typed before it upgraded", () => {
    // Everything but the host goes live first, as if its definition loaded
    // late while the user was already typing.
    const template = document.createElement("template");
    template.innerHTML = renderCorpusContentHtml(
      landingView(CORPUS_TEST_AUTHORS)
    );
    const host = template.content.querySelector("morcus-corpus-suggestions");
    const slot = document.createComment("host");
    host?.replaceWith(slot);
    document.body.append(template.content);
    const input = document.getElementById("corpus-q");
    if (!(input instanceof HTMLInputElement) || host === null) {
      throw new Error("unexpected corpus markup");
    }
    input.focus();
    input.value = "#ci";

    slot.replaceWith(host);

    const listbox = document.getElementById("corpus-suggestions");
    expect(input.value).toBe("#ci");
    expect(listbox?.hidden).toBe(false);
    expect(rowTexts(listbox!)).toEqual(["#Cicero "]);
  });

  test("removing the host leaves a plain input", () => {
    const { input, listbox } = mount();
    input.focus();
    press(input, "ArrowDown");
    expect(input.hasAttribute("aria-activedescendant")).toBe(true);

    document.querySelector("morcus-corpus-suggestions")?.remove();

    expect(listbox.hidden).toBe(true);
    for (const name of [
      "role",
      "aria-autocomplete",
      "aria-controls",
      "aria-expanded",
      "aria-activedescendant",
    ]) {
      expect(input.hasAttribute(name)).toBe(false);
    }
    // Its key handling went with it.
    expect(press(input, "ArrowDown").defaultPrevented).toBe(false);
  });

  describe("lemmata", () => {
    // The shard cache lives as long as the module, so each test uses its own
    // first letter.

    // As `renderPageShell` stamps it in production.
    beforeEach(() => {
      document.documentElement.dataset.version = "v1";
    });
    afterEach(() => {
      delete document.documentElement.dataset.version;
    });

    test("fetch the letter's shard once, then complete from it", async () => {
      const fetch = controlFetch();
      const { input, listbox } = mount();
      input.focus();

      type(input, "@l:c");
      expect(rowTexts(listbox)).toEqual(["the lemma `c`"]);
      type(input, "@l:ca");
      expect(fetch.mock.mock.calls).toEqual([["/api/corpus/lemmata/c?v=v1"]]);

      fetch.respond(["Caesar", "cado", "caedo", "canis"]);
      await settle();
      expect(rowTexts(listbox)).toEqual(["@l:cado ", "@l:caedo ", "@l:canis "]);

      press(input, "ArrowDown");
      press(input, "Enter");
      expect(input.value).toBe("@l:cado ");
      expect(fetch.mock).toHaveBeenCalledTimes(1);
    });

    test("a longer first prefix still fetches just the letter, once", async () => {
      const fetch = controlFetch();
      const { input, listbox } = mount();
      input.focus();

      type(input, "@lemma:mar");
      fetch.respond(["magnus", "mare", "maritus", "mors"]);
      await settle();

      expect(fetch.mock.mock.calls).toEqual([["/api/corpus/lemmata/m?v=v1"]]);
      expect(rowTexts(listbox)).toEqual(["@lemma:mare ", "@lemma:maritus "]);
    });

    test(`shows at most ${MAX_LEMMA_ROWS} completions`, async () => {
      const fetch = controlFetch();
      const { input, listbox } = mount();
      input.focus();

      type(input, "@l:b");
      fetch.respond(
        Array.from({ length: 60 }, (_, i) => `b${String(i).padStart(2, "0")}`)
      );
      await settle();
      expect(listbox.children).toHaveLength(MAX_LEMMA_ROWS);
    });

    test("an unavailable shard falls back to plain help, without retrying", async () => {
      jest.spyOn(console, "warn").mockImplementation(() => {});
      const fetch = controlFetch();
      const { input, listbox } = mount();
      input.focus();

      type(input, "@l:d");
      fetch.respond({ error: "unavailable" }, { ok: false, status: 503 });
      await settle();
      type(input, "@l:de");

      expect(rowTexts(listbox)).toEqual(["the lemma `de`"]);
      expect(fetch.mock).toHaveBeenCalledTimes(1);
    });

    test("a response for an abandoned prefix doesn't reopen the list", async () => {
      const fetch = controlFetch();
      const { input, listbox } = mount();
      input.focus();

      type(input, "@l:e");
      press(input, "Escape");
      fetch.respond(["ego", "et"]);
      await settle();
      expect(listbox.hidden).toBe(true);
    });
  });
});

// // // // // // // // // //
// Guardrails               //
// // // // // // // // // //

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [full]
      : [];
  });
}

describe("split guardrails", () => {
  test("only corpus_entry.client.ts imports the autocomplete", () => {
    const v2Dir = path.resolve(__dirname, "..");
    const importers = sourceFiles(v2Dir)
      .filter((file) =>
        fs
          .readFileSync(file, "utf8")
          .includes('"@/web/v2/corpus/corpus_autocomplete.client"')
      )
      .map((file) => path.relative(v2Dir, file));
    expect(importers).toEqual([path.join("corpus", "corpus_entry.client.ts")]);
  });
});
