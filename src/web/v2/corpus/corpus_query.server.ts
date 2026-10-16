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
  type CorpusQueryMatch,
  type PageData,
} from "@/common/library/corpus/corpus_common";
import type { CorpusQueryRequest } from "@/common/library/corpus/corpus_common";
import {
  readCorpusParams,
  type CorpusParams,
} from "@/web/v2/corpus/corpus_params.common";
import {
  hasInflectionFilters,
  transformQuery,
  validateQuery,
} from "@/web/v2/corpus/corpus_syntax.common";
import { textHighlightParams } from "@/web/v2/reader/reader_highlight.common";
import { getV2LibrarySummaries } from "@/web/v2/reader/reader_loader.server";

// // // // // // //
// URL contract   //
// // // // // // //

/** The Rust engine rejects longer (transformed) queries. */
export const MAX_ENGINE_QUERY_LENGTH = 100;

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

let cachedAuthors: Promise<readonly string[] | undefined> | null = null;

/**
 * The corpus author list (`#Author` values), or `undefined` if the corpus
 * isn't built.
 */
export function loadCorpusAuthors(): Promise<readonly string[] | undefined> {
  if (cachedAuthors === null) {
    cachedAuthors = readCorpusSuggestionList(CORPUS_AUTHORS_LIST);
  }
  return cachedAuthors;
}

/**
 * Reads one of the corpus suggestion lists in `CORPUS_DIR` (the authors or
 * the lemmata). Each is a gzipped JSON `string[]`.
 * Resolves `undefined`, with a warning, if the file is missing or malformed.
 */
export async function readCorpusSuggestionList(
  fileName: string,
  corpusDir: string = CORPUS_DIR
): Promise<string[] | undefined> {
  try {
    const buffer = await fs.promises.readFile(`${corpusDir}/${fileName}`);
    const parsed: unknown = JSON.parse(
      zlib.gunzipSync(buffer).toString("utf8")
    );
    if (
      Array.isArray(parsed) &&
      parsed.every((a): a is string => typeof a === "string")
    ) {
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

export type CorpusOutcome =
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
      readonly timingMs?: number;
      readonly next?: PageData;
    };

export interface CorpusSearchView {
  readonly params: CorpusParams;
  readonly outcome: CorpusOutcome;
  /** Show the inflection-tagging disclaimer (DESIGN D4). */
  readonly showInflectionDisclaimer: boolean;
  /**
   * The authors `q` was validated against, rendered once for the
   * autocomplete (`data-authors`). `undefined` if the corpus isn't built.
   */
  readonly authors?: readonly string[];
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
  authors: readonly string[] | undefined
): Promise<CorpusSearchView> {
  const showInflectionDisclaimer = hasInflectionFilters(params.q);
  const view = (outcome: CorpusOutcome): CorpusSearchView => ({
    params,
    outcome,
    showInflectionDisclaimer,
    authors,
  });

  if (params.q.length === 0) {
    return view({ kind: "landing" });
  }
  const syntaxError = validateQuery(params.q, authors);
  if (syntaxError !== null) {
    return view({ kind: "error", message: syntaxError });
  }
  const engineQuery = transformQuery(params.q);
  if (engineQuery.length > MAX_ENGINE_QUERY_LENGTH) {
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
