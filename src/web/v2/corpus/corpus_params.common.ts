/**
 * The `/corpus` URL contract, shared by the server (parsing requests,
 * building pager links) and `<morcus-corpus-view>` (syncing the form after a
 * client-side navigation). See `README.md`, "URL contract".
 */

import type { PageData } from "@/common/library/corpus/corpus_common";

export const CORPUS_PATH = "/corpus";

export const PAGE_SIZE = { default: 50, min: 10, max: 100 } as const;
export const CONTEXT_LEN = { default: 20, min: 1, max: 100 } as const;

export interface CorpusParams {
  readonly q: string;
  readonly pageSize: number;
  readonly contextLen: number;
  readonly strictMode: boolean;
  /** Where the page starts; `undefined` for the first page. */
  readonly cursor?: PageData;
}

function clampInt(
  raw: string | undefined,
  range: { default: number; min: number; max: number }
): number {
  if (raw === undefined || !/^-?\d+$/.test(raw.trim())) {
    return range.default;
  }
  return Math.min(range.max, Math.max(range.min, Number.parseInt(raw, 10)));
}

/** `<resultId>-<resultIndex>-<candidateIndex>`. */
export function encodeCursor(cursor: PageData): string {
  return `${cursor.resultId}-${cursor.resultIndex}-${cursor.candidateIndex}`;
}

/** Parses a cursor; anything malformed means the first page (DESIGN D7). */
export function decodeCursor(raw: string | undefined): PageData | undefined {
  const match = raw === undefined ? null : /^(\d+)-(\d+)-(\d+)$/.exec(raw);
  if (match === null) {
    return undefined;
  }
  return {
    resultId: Number.parseInt(match[1], 10),
    resultIndex: Number.parseInt(match[2], 10),
    candidateIndex: Number.parseInt(match[3], 10),
  };
}

/**
 * Reads the parameters, clamping numbers and defaulting anything missing or
 * malformed. `get` returns the (first) raw value of a URL parameter.
 */
export function readCorpusParams(
  get: (name: string) => string | undefined
): CorpusParams {
  return {
    q: (get("q") ?? "").trim(),
    pageSize: clampInt(get("pageSize") ?? get("ps"), PAGE_SIZE),
    contextLen: clampInt(get("contextLen") ?? get("cl"), CONTEXT_LEN),
    strictMode: (get("strictMode") ?? get("sm")) === "1",
    cursor: decodeCursor(get("cursor") ?? get("cp")),
  };
}

/**
 * The URL for `params`, with the parameters in the same order the form
 * submits them, so a pager link and a form submit produce the same URL shape.
 */
export function corpusUrl(params: CorpusParams): string {
  const search = new URLSearchParams();
  search.set("q", params.q);
  search.set("contextLen", String(params.contextLen));
  search.set("pageSize", String(params.pageSize));
  if (params.strictMode) search.set("strictMode", "1");
  if (params.cursor !== undefined) {
    search.set("cursor", encodeCursor(params.cursor));
  }
  return `${CORPUS_PATH}?${search.toString()}`;
}
