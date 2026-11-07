/**
 * Server side of a corpus search: URL parameters, the page cursor, the call
 * into the Rust engine, and the view model the renderers consume.
 *
 * See `README.md`, "URL contract" and "Server".
 */

import fs from "fs";
import zlib from "zlib";
import type { Request } from "express";
import {
  CORPUS_AUTHORS_LIST,
  CORPUS_DIR,
  CorpusQueryResult,
  MAX_QUERY_BODY_LENGTH,
  queryBodyLength,
  type CorpusQueryMatch,
  type PageData,
} from "@/common/library/corpus/corpus_common";
import type { CorpusQueryRequest } from "@/common/library/corpus/corpus_common";
import {
  createLemmaResolver,
  resolveCorpusLemma,
  type LemmaResolution,
  type LemmaResolver,
} from "@/web/ui/corpus/corpus_lemmata.server";
import {
  readCorpusParams,
  type CorpusParams,
} from "@/web/ui/corpus/corpus_params.common";
import {
  LEMMA_FILTER,
  hasInflectionFilters,
  isCorpusAuthorList,
  tokenizeInput,
  transformQuery,
  validateQuery,
  type CorpusAuthorList,
} from "@/web/ui/corpus/corpus_syntax.common";
import { textHighlightParams } from "@/web/ui/reader/reader_highlight.common";
import { getV2LibrarySummaries } from "@/web/ui/reader/reader_loader.server";

// // // // // // //
// URL contract   //
// // // // // // //

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

export function parseCorpusParams(query: Request["query"]): CorpusParams {
  return readCorpusParams((name) => firstString(query[name]));
}

// // // // // // //
// Engine         //
// // // // // // //

/** The slice of `CorpusQueryHandler` (`corpus_rust.ts`) the routes need. */
export interface CorpusEngine {
  runQuery: (request: CorpusQueryRequest) => string;
}

/** The engine couldn't run at all (missing bindings, failed init). */
export class CorpusUnavailableError extends Error {
  override name = "CorpusUnavailableError";
}

let cachedAuthors: Promise<CorpusAuthorList | undefined> | null = null;

/**
 * The corpus author and work map (`#Author` and `#Author/Work` values), or
 * `undefined` if the corpus isn't built.
 */
export function loadCorpusAuthors(): Promise<CorpusAuthorList | undefined> {
  if (cachedAuthors === null) {
    cachedAuthors = readCorpusAuthorsList(CORPUS_AUTHORS_LIST);
  }
  return cachedAuthors;
}

/**
 * Reads the gzipped JSON `CorpusAuthorList` in `CORPUS_DIR`.
 * Resolves `undefined`, with a warning, if the file is missing or malformed.
 */
export async function readCorpusAuthorsList(
  fileName: string = CORPUS_AUTHORS_LIST,
  corpusDir: string = CORPUS_DIR
): Promise<CorpusAuthorList | undefined> {
  try {
    const buffer = await fs.promises.readFile(`${corpusDir}/${fileName}`);
    const parsed: unknown = JSON.parse(
      zlib.gunzipSync(buffer).toString("utf8")
    );
    if (isCorpusAuthorList(parsed)) {
      return parsed;
    }
    console.warn(`Corpus list ${fileName} has an unexpected shape.`);
    return undefined;
  } catch (err: unknown) {
    console.warn(`Corpus list ${fileName} unavailable:`, err);
    return undefined;
  }
}

// // // // // // //
// View model     //
// // // // // // //

export interface CorpusResultView {
  /** e.g. `De Bello Gallico 1.2.3 [Caesar]`. */
  readonly heading: string;
  /** Reader link with `matchText`; `undefined` if the work isn't in V2. */
  readonly href?: string;
  readonly snippet: CorpusQueryMatch["text"];
}

type CorpusOutcome =
  | { readonly kind: "landing" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "results";
      readonly results: readonly CorpusResultView[];
      readonly estimatedTotal: number;
      /** Whether `estimatedTotal` is exact (every result is on this page). */
      readonly isExact: boolean;
      /** 0-based index of the first result on this page. */
      readonly pageStart: number;
      /**
       * The engine's own query time, for telemetry (`corpusEngineMs`). Not
       * shown on the page.
       */
      readonly timingMs?: number;
      readonly next?: PageData;
    };

export interface CorpusSearchView {
  readonly params: CorpusParams;
  readonly outcome: CorpusOutcome;
  /** Show the inflection-tagging disclaimer. */
  readonly showInflectionDisclaimer: boolean;
}

async function readerHrefs(): Promise<Map<string, string>> {
  const summaries = await getV2LibrarySummaries();
  return new Map(
    summaries.map((s) => [s.id, `/work/${s.urlAuthor}/${s.urlName}`])
  );
}

function toResultView(
  match: CorpusQueryMatch,
  readerPaths: ReadonlyMap<string, string>
): CorpusResultView {
  const { workId, workName, author, leaders } = match.metadata;
  const section = leaders[0]?.[0] ?? "";
  const heading = `${workName} ${section} [${author}]`.replace(/\s+/g, " ");
  const readerPath = readerPaths.get(workId);
  if (readerPath === undefined) {
    console.warn(`Corpus result for unknown V2 work: ${workId}`);
    return { heading, snippet: match.text };
  }
  const { matchText } = textHighlightParams(
    leaders.map(([id, start, length]) => ({ id, start, end: start + length }))
  );
  const search = new URLSearchParams({ matchText });
  return {
    heading,
    href: `${readerPath}?${search.toString()}`,
    snippet: match.text,
  };
}

function engineErrorMessage(err: unknown): string {
  const text =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return text.length > 0 ? text : "The query could not be run.";
}

/** The most homographs an "ambiguous lemma" error lists. */
const MAX_LEMMA_OPTIONS = 8;

function memoizeLemmaResolver(resolve: LemmaResolver): LemmaResolver {
  const cache = new Map<string, LemmaResolution | undefined>();
  return (value) => {
    if (!cache.has(value)) {
      cache.set(value, resolve(value));
    }
    return cache.get(value);
  };
}

/**
 * The first `@lemma:` value in `query` that is ambiguous (`@lemma:edo`, with
 * `edo#1` and `edo#2` in the corpus) or not in the corpus at all, as an error
 * message that names the alternatives. `undefined` if every value resolves or
 * the lemma list isn't available.
 */
function findLemmaError(
  query: string,
  resolveLemma: LemmaResolver
): string | undefined {
  for (const [token, , type] of tokenizeInput(query)) {
    if (type !== "wordFilter") continue;
    const match = LEMMA_FILTER.exec(token);
    if (match === null) continue;
    const [, key, value] = match;
    const resolution = resolveLemma(value);
    if (resolution?.kind === "unknown") {
      return `${token} - no lemma \`${value}\` in the corpus`;
    }
    if (resolution?.kind === "ambiguous") {
      const shown = resolution.options
        .slice(0, MAX_LEMMA_OPTIONS)
        .map((option) => `@${key}:${option}`);
      const more = resolution.options.length - shown.length;
      const list =
        more > 0
          ? `${shown.join(", ")}, or ${more} more`
          : shown.length === 2
          ? shown.join(" or ")
          : `${shown.slice(0, -1).join(", ")}, or ${shown[shown.length - 1]}`;
      return `${token} - ambiguous lemma; use ${list}`;
    }
  }
  return undefined;
}

/**
 * Runs the search described by `params` and builds the view model.
 *
 * User errors (bad syntax, a query the engine rejects) come back as an
 * `error` outcome. {@link CorpusUnavailableError} means the engine itself
 * can't run.
 */
export async function runCorpusSearch(
  params: CorpusParams,
  engine: CorpusEngine,
  authors: CorpusAuthorList | undefined,
  lemmata?: LemmaResolver | readonly string[]
): Promise<CorpusSearchView> {
  const showInflectionDisclaimer = hasInflectionFilters(params.q);
  const view = (outcome: CorpusOutcome): CorpusSearchView => ({
    params,
    outcome,
    showInflectionDisclaimer,
  });

  if (params.q.length === 0) {
    return view({ kind: "landing" });
  }
  const syntaxError = validateQuery(params.q, authors);
  if (syntaxError !== null) {
    return view({ kind: "error", message: syntaxError });
  }
  // Bare `#Author` codes can be resolved by the Rust engine even if the
  // suggestions file is missing, but `#Author/Work` codes map to work IDs only
  // through `authors`.
  if (authors === undefined && /(?:^|\s)#[^\s/]+\//.test(params.q)) {
    return view({ kind: "error", message: "the author list is unavailable" });
  }
  const resolveLemma = memoizeLemmaResolver(
    typeof lemmata === "function"
      ? lemmata
      : lemmata !== undefined
      ? createLemmaResolver(lemmata)
      : resolveCorpusLemma
  );
  const lemmaError = findLemmaError(params.q, resolveLemma);
  if (lemmaError !== undefined) {
    return view({ kind: "error", message: lemmaError });
  }
  const canonicalLemma = (value: string) => {
    const resolution = resolveLemma(value);
    return resolution?.kind === "found" ? resolution.lemma : undefined;
  };
  const engineQuery = transformQuery(params.q, { authors, canonicalLemma });
  if (queryBodyLength(engineQuery) > MAX_QUERY_BODY_LENGTH) {
    return view({ kind: "error", message: "The query is too long." });
  }

  let rawResult: string;
  try {
    rawResult = engine.runQuery({
      query: engineQuery,
      pageData: params.cursor,
      pageSize: params.pageSize,
      contextLen: params.contextLen,
      strictMode: params.strictMode,
    });
  } catch (err: unknown) {
    // `RustCorpusQueryEngine` throws a string when the bindings are missing;
    // query errors from the engine are `Error`s.
    if (typeof err === "string" && err.includes("bindings")) {
      throw new CorpusUnavailableError(err);
    }
    return view({ kind: "error", message: engineErrorMessage(err) });
  }

  const parsed: unknown = JSON.parse(rawResult);
  if (!CorpusQueryResult.isMatch(parsed)) {
    throw new Error("Corpus engine returned an unexpected result shape.");
  }
  const readerPaths = await readerHrefs();
  const results = parsed.matches.map((m) => toResultView(m, readerPaths));
  const estimatedTotal = parsed.resultStats.estimatedResults;
  return view({
    kind: "results",
    results,
    estimatedTotal,
    isExact: estimatedTotal === results.length,
    pageStart: params.cursor?.resultIndex ?? 0,
    timingMs: parsed.timing?.reduce((sum, [, ms]) => sum + ms, 0),
    next: parsed.nextPage,
  });
}
