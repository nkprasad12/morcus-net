/**
 * `<morcus-corpus-suggestions>`: autocomplete for the corpus query input.
 *
 * The server renders the host and an empty listbox (`data-js-only`), with the
 * corpus authors in `data-authors`. This element fills in the options for the
 * text before the caret, using the shared grammar, and splices a chosen one
 * in at the caret. Lemma completions come from per-letter shards fetched on
 * demand ({@link LemmaShardCache}).
 *
 * Kept splittable: only `corpus_entry.client.ts` imports this
 * module, it reaches `<morcus-corpus-view>` only through the DOM they share
 * (the input and the form's submit event), and it has no side effects beyond
 * `registerElement`.
 */

import {
  BaseElement,
  ComboboxController,
  html,
  joinHtml,
  KeyedFetchCache,
  raw,
  registerElement,
  setHtml,
  type SafeHtml,
  withBuildVersion,
} from "@/web/v2/core/index.client";
import {
  INFLECTION_CATEGORIES,
  SPECIAL_KEYWORDS,
  errorsForToken,
  findNextOptions,
  invalidInflectionOption,
  isInflectionValue,
  parseProximity,
  resolveKeyword,
  tokenizeInput,
  type NonSpaceToken,
  type QueryToken,
} from "@/web/v2/corpus/corpus_syntax.common";

// // // // // // // //
// Suggestion rows   //
// // // // // // // //

/** A completion the user can choose. */
interface CorpusCompletion {
  /** Inserted at the caret. Ends with a space when it completes a token. */
  readonly option: string;
  /** Text already typed, shown before `option` for context. */
  readonly prefix?: string;
  readonly help?: string;
  /**
   * Replaces all the text before the caret instead of inserting `option`,
   * e.g. to add the open paren an `and` needs.
   */
  readonly replacement?: string;
}

/** A row that explains, or reports an error. It can't be chosen. */
interface CorpusStatus {
  readonly status: "info" | "error";
  readonly message: string;
  /** Stands in for what to type, e.g. `word` for "match exact word". */
  readonly placeholder?: string;
}

export type CorpusSuggestion = CorpusCompletion | CorpusStatus;

export interface SuggestionSources {
  /** The corpus authors. `undefined` if unknown, which skips author checks. */
  readonly authors?: readonly string[];
  /**
   * Up to {@link MAX_LEMMA_ROWS} lemmata starting with `prefix`: `undefined`
   * while they load, `null` if they couldn't be loaded.
   */
  readonly lemmata?: (prefix: string) => readonly string[] | null | undefined;
}

export const MAX_LEMMA_ROWS = 50;
/** Keyword and inflection-value rows after a bare `@…` (V1's limit). */
const MAX_KEYWORD_ROWS = 20;

function infoRow(message: string, placeholder?: string): CorpusStatus {
  return { status: "info", message, placeholder };
}

function errorRow(message: string): CorpusStatus {
  return { status: "error", message };
}

function isCompletion(
  row: CorpusSuggestion | undefined
): row is CorpusCompletion {
  return row !== undefined && !("status" in row);
}

const TILDE_HELP: readonly CorpusCompletion[] = [
  { prefix: "~", option: " ", help: "within 5 words of" },
  { prefix: "~", option: "> ", help: "within 5 words before" },
  { prefix: "~", option: "3 ", help: "within 3 words of" },
  { prefix: "~", option: "10 ", help: "within 10 words of" },
  { prefix: "~", option: "15 ", help: "within 15 words of" },
];
const WORD_HELP = infoRow("match exact word", "word");
const NEXT_WORD_HELP = infoRow("followed by exact word", "word");
const SPECIAL_HELP: CorpusCompletion = {
  option: "@",
  help: "match lemma or inflection",
};
const NEXT_SPECIAL_HELP: CorpusCompletion = {
  option: "@",
  help: "followed by lemma or inflection",
};
const PROXIMITY_HELP: CorpusCompletion = { option: "~", help: "around" };
const AUTHOR_HELP: CorpusCompletion = { option: "#", help: "search in author" };
const CLOSE_PAREN_HELP: CorpusCompletion = {
  option: ") ",
  help: "done filtering word",
};
const LOGIC_HELP = {
  and: "(restrict further)",
  or: "(relax restriction)",
} as const;

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Every inflection value, sorted by long form for prefix search. */
const INFLECTION_VALUES = [...INFLECTION_CATEGORIES]
  .flatMap(([category, values]) =>
    [...values].map(([long, short]) => ({ long, short, category }))
  )
  .sort((a, b) => compareCodeUnits(a.long, b.long));

/**
 * Up to `max` items of `sorted` whose key starts with `prefix`. `sorted` must
 * be in code-unit order of `key`.
 */
function findByPrefix<T>(
  sorted: readonly T[],
  prefix: string,
  max: number,
  key: (item: T) => string
): T[] {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (key(sorted[mid]) < prefix) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const found: T[] = [];
  for (let i = lo; i < sorted.length && found.length < max; i++) {
    if (!key(sorted[i]).startsWith(prefix)) break;
    found.push(sorted[i]);
  }
  return found;
}

/** Index of the last non-space token at or before `from`. */
function lastWordIndex(
  tokens: readonly QueryToken[],
  from: number
): number | undefined {
  for (let i = from; i >= 0; i--) {
    if (tokens[i][2] !== "space") return i;
  }
  return undefined;
}

/**
 * The rows for `input`, the query text before the caret. Ports V1's
 * `optionsForInput` (`pages/corpus/corpus_autocomplete.tsx`).
 */
export function corpusSuggestions(
  input: string,
  sources: SuggestionSources = {}
): CorpusSuggestion[] {
  const tokens = tokenizeInput(input);
  const words = tokens.filter((t) => t[2] !== "space").map((t) => t[0]);
  const last = tokens[tokens.length - 1];
  // After a space or a paren, the caret starts a new token.
  if (last === undefined || ["space", "(", ")"].includes(last[2])) {
    return newTokenSuggestions(input, tokens, words, sources.authors);
  }
  const [current, start] = last;
  const before = input.slice(0, start);
  const previous = words[words.length - 2];
  if (current.startsWith("#")) {
    return authorSuggestions(current, words, before, sources.authors);
  }
  if (current.startsWith("@")) {
    return current.includes(":")
      ? filterValueSuggestions(current, previous, sources.lemmata)
      : keywordSuggestions(current, before);
  }
  if (current.startsWith("~")) {
    return proximitySuggestions(current);
  }
  return [infoRow(`the word \`${current}\``), ...logicOps(previous, current)];
}

/** After a space or paren: report errors so far, else what may come next. */
function newTokenSuggestions(
  input: string,
  tokens: readonly QueryToken[],
  words: readonly string[],
  authors: readonly string[] | undefined
): CorpusSuggestion[] {
  const next = findNextOptions([...tokens]);
  if (typeof next === "string") {
    return [errorRow(next)];
  }
  const errors = words.flatMap((word) => errorsForToken(word, authors));
  if (errors.length > 0) {
    return errors.map(errorRow);
  }
  return newTokenHelp(input, tokens, next);
}

function newTokenHelp(
  input: string,
  tokens: readonly QueryToken[],
  options: readonly NonSpaceToken[]
): CorpusSuggestion[] {
  const lastWord = lastWordIndex(tokens, tokens.length - 1);
  const lastType = lastWord === undefined ? undefined : tokens[lastWord][2];
  const inSpan = lastType === ")" || lastType === "wordFilter";
  // `a and b or c` is an error, so only the first operator on a term can be
  // either one. That's the one that opens the term's parenthesis.
  const penult =
    lastWord === undefined ? undefined : lastWordIndex(tokens, lastWord - 1);
  const openParenAt =
    lastWord !== undefined &&
    options.includes("logic:and") &&
    options.includes("logic:or") &&
    (penult === undefined || tokens[penult][2] !== "(")
      ? tokens[lastWord][1]
      : undefined;
  const afterSpace = tokens[tokens.length - 1]?.[2] === "space";

  const rows: CorpusSuggestion[] = [];
  for (const option of options) {
    switch (option) {
      case "wordFilter":
        rows.push(
          inSpan ? NEXT_WORD_HELP : WORD_HELP,
          inSpan ? NEXT_SPECIAL_HELP : SPECIAL_HELP
        );
        break;
      case "proximity":
        rows.push(PROXIMITY_HELP);
        break;
      case "logic:and":
      case "logic:or": {
        const op = option === "logic:and" ? "and" : "or";
        const text = afterSpace ? `${op} ` : ` ${op} `;
        const replacement =
          openParenAt === undefined
            ? undefined
            : `${input.slice(0, openParenAt)}(${input.slice(
                openParenAt
              )}${text}`;
        rows.push({ option: text, help: LOGIC_HELP[op], replacement });
        break;
      }
      case "workFilter":
        rows.push(AUTHOR_HELP);
        break;
      case "(":
        // Added along with `and` / `or` instead.
        break;
      case ")":
        rows.push(CLOSE_PAREN_HELP);
        break;
    }
  }
  return rows;
}

function authorSuggestions(
  current: string,
  words: readonly string[],
  before: string,
  authors: readonly string[] | undefined
): CorpusSuggestion[] {
  if (words.some((word) => !word.startsWith("#"))) {
    return [errorRow("#author filters must be at start")];
  }
  if (words.length > 1) {
    return [errorRow("only one #author filter allowed")];
  }
  if (authors === undefined) {
    return [infoRow("the author list is unavailable")];
  }
  const typed = current.slice(1);
  const rows = authors
    .filter(
      (author) =>
        // A name with a space can't be one token, so it would only produce an
        // invalid query.
        !author.includes(" ") &&
        author.toLowerCase().startsWith(typed.toLowerCase())
    )
    .map(
      (author): CorpusCompletion => ({
        prefix: `#${author.slice(0, typed.length)}`,
        option: `${author.slice(typed.length)} `,
        // The engine matches author names case-sensitively.
        replacement: `${before}#${author} `,
      })
    );
  return rows.length > 0
    ? rows
    : [errorRow(`no author matches \`${current}\``)];
}

/** `@…` before the colon: keywords, plus inflection values by name. */
function keywordSuggestions(
  current: string,
  before: string
): CorpusSuggestion[] {
  const typed = current.slice(1);
  if (typed === "") {
    return SPECIAL_KEYWORDS.map((keyword) => ({
      prefix: "@",
      option: `${keyword}:`,
      help: `filter by ${keyword}`,
    }));
  }
  const rows: CorpusSuggestion[] = SPECIAL_KEYWORDS.filter((keyword) =>
    keyword.startsWith(typed)
  ).map((keyword) => ({
    prefix: current,
    option: `${keyword.slice(typed.length)}:`,
    help: `filter by ${keyword}`,
  }));
  const values = findByPrefix(
    INFLECTION_VALUES,
    typed,
    MAX_KEYWORD_ROWS - rows.length,
    (value) => value.long
  );
  for (const { long, short, category } of values) {
    rows.push({
      prefix: "@",
      option: `${category[0]}:${long} `,
      help: category,
      // Shown in full, written in the short form (as in V1).
      replacement: `${before}@${category[0]}:${short} `,
    });
  }
  return rows.length > 0 ? rows : [errorRow(`invalid keyword @${typed}`)];
}

/** `@keyword:value`. */
function filterValueSuggestions(
  current: string,
  previous: string | undefined,
  lemmata: SuggestionSources["lemmata"]
): CorpusSuggestion[] {
  const colon = current.indexOf(":");
  const rawKey = current.slice(1, colon);
  const keyword = resolveKeyword(rawKey);
  const value = current.slice(colon + 1);
  if (keyword === "lemma") {
    return lemmaSuggestions(current, value, lemmata);
  }
  const values =
    keyword === undefined ? undefined : INFLECTION_CATEGORIES.get(keyword);
  if (keyword === undefined || values === undefined) {
    return [errorRow(`invalid keyword @${rawKey}`)];
  }
  const rows = [...values.keys()]
    .filter((form) => form !== value && form.startsWith(value))
    .map((form) => ({
      prefix: current,
      option: `${form.slice(value.length)} `,
    }));
  if (rows.length > 0) {
    return rows;
  }
  // Short forms (`impf`) are as valid as long ones (`errorsForToken`).
  if (isInflectionValue(keyword, value)) {
    return [
      infoRow(`a word with ${value} ${keyword}`),
      ...logicOps(previous, current),
    ];
  }
  return [errorRow(invalidInflectionOption(keyword, value))];
}

function lemmaSuggestions(
  current: string,
  value: string,
  lemmata: SuggestionSources["lemmata"]
): CorpusSuggestion[] {
  if (value === "") {
    return [
      infoRow(
        lemmata === undefined
          ? "an exact lemma"
          : "start typing for completions"
      ),
    ];
  }
  const matches = lemmata?.(value);
  if (matches === undefined || matches === null) {
    return [infoRow(`the lemma \`${value}\``)];
  }
  if (matches.length === 0) {
    return [errorRow(`no lemma matches \`${value}\``)];
  }
  return matches.map((lemma) => ({
    prefix: current,
    option: `${lemma.slice(value.length)} `,
  }));
}

function proximitySuggestions(current: string): CorpusSuggestion[] {
  const parsed = parseProximity(current);
  if (typeof parsed === "string") {
    return [errorRow(parsed)];
  }
  if (current === "~") {
    return [...TILDE_HELP];
  }
  const within = `within ${parsed.distance} words`;
  if (parsed.directed) {
    return [infoRow(`${within} before`)];
  }
  return [
    infoRow(`${within} of`),
    { prefix: current, option: ">", help: `${within} before` },
  ];
}

/**
 * `and` / `or` right after the word being typed. As in V1, only offered when
 * the word before it isn't missing, `#Author`, `~…`, `and` or `or`.
 */
function logicOps(
  previous: string | undefined,
  current: string
): CorpusCompletion[] {
  if (
    previous === undefined ||
    previous === "and" ||
    previous === "or" ||
    previous.startsWith("#") ||
    previous.startsWith("~")
  ) {
    return [];
  }
  return [
    { prefix: current, option: " and ", help: LOGIC_HELP.and },
    { prefix: current, option: " or ", help: LOGIC_HELP.or },
  ];
}

// // // // // // // //
// Lemma shards      //
// // // // // // // //

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * The shard that holds the lemmata starting with `prefix`: its first
 * character, lowercased, so `Caesar` and `caedo` share `c`. The server
 * groups them the same way (`buildLemmaShards`).
 */
function shardKey(prefix: string): string {
  const first = prefix.codePointAt(0);
  return first === undefined ? "" : String.fromCodePoint(first).toLowerCase();
}

/**
 * Lemma completions from per-letter shards
 * (`GET /api/corpus/lemmata/<letter>`, see `corpus_lemmata.server.ts`).
 * Each shard is fetched once and kept for the life of the page.
 */
export class LemmaShardCache {
  readonly #shards = new KeyedFetchCache<readonly string[] | null>({
    fetch: async (key) => {
      try {
        const res = await fetch(
          withBuildVersion(`/api/corpus/lemmata/${encodeURIComponent(key)}`)
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body: unknown = await res.json();
        if (!isStringArray(body)) throw new Error("not a list of lemmata");
        return body;
      } catch (err: unknown) {
        console.warn(`Corpus lemmata for "${key}" unavailable:`, err);
        return null;
      }
    },
  });

  /**
   * Up to `max` lemmata starting with `prefix`, matched as in V1: the first
   * letter as typed, the rest lowercase. `undefined` until the shard for the
   * first letter is loaded, `null` if it couldn't be.
   */
  complete(prefix: string, max: number): readonly string[] | null | undefined {
    if (prefix.length === 0) return [];
    const shard = this.#shards.get(shardKey(prefix));
    if (shard === undefined || shard === null) return shard;
    const normalized = prefix[0] + prefix.slice(1).toLowerCase();
    return findByPrefix(shard, normalized, max, (lemma) => lemma);
  }

  /**
   * Fetches the shard {@link complete} needs for `prefix`, unless it's loaded
   * or loading, so callers share one request. Never rejects: a failure is
   * kept as `null` and not retried.
   *
   * Not abortable: the request is shared, so one caller can't cancel it for
   * the others. Callers that stop caring ignore the result instead.
   */
  load(prefix: string): Promise<readonly string[] | null> {
    const key = shardKey(prefix);
    if (key === "") return Promise.resolve([]);
    return this.#shards.load(key);
  }
}

/** Shared by every `<morcus-corpus-suggestions>` on the page. */
const LEMMA_SHARDS = new LemmaShardCache();

// // // // // // // //
// Element           //
// // // // // // // //

function parseAuthors(json: string | undefined): readonly string[] | undefined {
  if (json === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(json);
    return isStringArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function renderRow(row: CorpusSuggestion): SafeHtml {
  if (isCompletion(row)) {
    const prefix =
      row.prefix === undefined
        ? html``
        : html`<span class="corpus-suggestion-prefix">${row.prefix}</span>`;
    const help =
      row.help === undefined
        ? html``
        : html`<span class="corpus-suggestion-help">${row.help}</span>`;
    return html`<li class="corpus-suggestion">
      <span class="corpus-suggestion-text"
        >${raw(prefix)}<b class="corpus-suggestion-option"
          >${row.option}</b
        ></span
      >${raw(help)}
    </li>`;
  }
  const isError = row.status === "error";
  const text = isError
    ? html`<span aria-hidden="true">❌</span> ${row.message}`
    : row.placeholder === undefined
    ? html`${row.message}`
    : html`<i>${row.placeholder}</i>`;
  const help =
    !isError && row.placeholder !== undefined
      ? html`<span class="corpus-suggestion-help">${row.message}</span>`
      : html``;
  // The ❌ is hidden from screen readers, so say it in the name instead.
  const label = isError ? html`aria-label="Error: ${row.message}"` : html``;
  return html`<li
    class="corpus-suggestion is-status${isError ? " is-error" : ""}"
    ${raw(label)}>
    <span class="corpus-suggestion-text">${raw(text)}</span>${raw(help)}
  </li>`;
}

interface Parts {
  readonly input: HTMLInputElement;
  readonly listbox: HTMLUListElement;
}

/**
 * Autocomplete for the corpus query. Makes its input a
 * combobox over the server-rendered listbox, and creates only the options.
 *
 * Combobox ARIA, keyboard navigation, and focus retention are managed
 * by the core `ComboboxController`.
 */
class MorcusCorpusSuggestions extends BaseElement<"lemmata"> {
  #parts: Parts | null = null;
  #authors: readonly string[] | undefined;
  #combobox: ComboboxController<CorpusSuggestion> | null = null;

  readonly #lemmata = (prefix: string) => {
    const found = LEMMA_SHARDS.complete(prefix, MAX_LEMMA_ROWS);
    if (found === undefined) this.#loadShard(prefix);
    return found;
  };

  protected override onConnect(): void {
    // Looked up by id rather than position, so the host can move.
    const input = this.ownerDocument.getElementById(this.dataset.input ?? "");
    const listbox = this.firstElementChild;
    if (
      !(input instanceof HTMLInputElement) ||
      !(listbox instanceof HTMLUListElement)
    ) {
      throw new Error(
        "<morcus-corpus-suggestions> needs a data-input id and its listbox"
      );
    }
    this.#parts = { input, listbox };
    this.#authors = parseAuthors(this.dataset.authors);

    if (!this.#combobox) {
      this.#combobox = new ComboboxController<CorpusSuggestion>({
        root: this,
        getInput: () => this.#parts?.input ?? null,
        getListbox: () => this.#parts?.listbox ?? null,
        isSelectable: (row) => isCompletion(row),
        renderItems: (rows, box) => {
          setHtml(box, html`${joinHtml(rows.map(renderRow))}`);
        },
        onSelect: (_item, index) => {
          this.#choose(index);
        },
        onRefresh: () => {
          this.#refresh();
        },
        onVisibilityChange: (open) => {
          if (!open) {
            this.scope.cancel("lemmata");
          }
        },
      });
      this.addController(this.#combobox);
    }
  }

  protected override onDisconnect(): void {
    this.#parts = null;
  }

  /** Shows the rows for the text before the caret, while the input has focus. */
  #refresh(): void {
    const parts = this.#parts;
    if (parts === null) return;
    const { input } = parts;
    if (input !== this.ownerDocument.activeElement) {
      this.#combobox?.close();
      return;
    }
    this.scope.cancel("lemmata");
    const caret = input.selectionStart ?? input.value.length;
    const suggestions = corpusSuggestions(input.value.slice(0, caret), {
      authors: this.#authors,
      lemmata: this.#lemmata,
    });
    this.#combobox?.setItems(suggestions);
  }

  /** Fetches the shard for `prefix`, then re-suggests unless superseded. */
  #loadShard(prefix: string): void {
    const signal = this.scope.latest("lemmata");
    void LEMMA_SHARDS.load(prefix).then(() => {
      if (!signal.aborted) this.#refresh();
    });
  }

  /** Splices a completion in at the caret. */
  #choose(index: number): void {
    const parts = this.#parts;
    const items = this.#combobox?.items;
    const row = items?.[index];
    if (parts === null || !row || !isCompletion(row)) return;
    const { input } = parts;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const text = row.replacement ?? row.option;
    const from = row.replacement === undefined ? start : 0;
    // Swallow the rest of the token under the caret (`#Caes|ar` → `#Caesar `).
    let tokenEnd = end;
    if (start > 0 && !/[\s()]/.test(input.value[start - 1])) {
      while (
        tokenEnd < input.value.length &&
        !/[\s()]/.test(input.value[tokenEnd])
      ) {
        tokenEnd++;
      }
    }
    // A completed token ends with a space; reuse one already after the token.
    const to =
      text.endsWith(" ") && input.value.charAt(tokenEnd) === " "
        ? tokenEnd + 1
        : tokenEnd;
    input.setRangeText(text, from, to);
    // Explicit rather than `setRangeText`'s "end" mode, which jsdom gets wrong.
    input.setSelectionRange(from + text.length, from + text.length);
    this.#refresh();
  }
}

registerElement("morcus-corpus-suggestions", MorcusCorpusSuggestions);

declare module "@/web/v2/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-corpus-suggestions": MorcusCorpusSuggestions;
  }
}
