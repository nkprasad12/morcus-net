/**
 * A fake `fetch` for jsdom harnesses that answers V2's client requests with
 * the real server renderers (the same ones the SSR fixtures use), after a
 * fixed latency on the (fake) timer clock. It honours `AbortSignal` the way
 * a browser does, so supersession and teardown behave as on a real page.
 *
 * Unknown URLs get a 404 and are recorded in `unrouted`, so a harness can
 * fail on them instead of silently testing an error path.
 */

import type { CompletionsProvider } from "@/web/v2/dict/dict_completions.server";
import {
  getV2Completions,
  getV2DictChunks,
} from "@/web/v2/dict/dict_completions.server";
import { renderDictResultsHtml } from "@/web/v2/dict/dict_page.server";
import { buildLemmaShards } from "@/web/v2/corpus/corpus_lemmata.server";
import {
  parseCorpusParams,
  runCorpusSearch,
} from "@/web/v2/corpus/corpus_query.server";
import { renderCorpusPartialHtml } from "@/web/v2/corpus/corpus_view.server";
import { CORPUS_TEST_AUTHORS } from "@/web/v2/testing/fake_corpus_engine";
import {
  DICT_AMO_QUERIED,
  DICT_AMO_RESULTS,
  ssrFixtureCorpusEngine,
} from "@/web/v2/testing/ssr_fixtures";

/** Until `fetch()` resolves (headers). */
export const FAKE_FETCH_LATENCY_MS = 20;
/**
 * Until `text()` / `json()` resolve (body). Not abortable: as the comment in
 * `fetchAndSwapPartial` says, not every fetch stack rejects `text()` on
 * abort, so client code must check its signal after reading the body.
 */
export const FAKE_BODY_LATENCY_MS = 20;

export interface FakeNetworkLog {
  /** Every HTML body served (partials), in order. */
  readonly html: string[];
  /** `path?query` of every request no route matched. */
  readonly unrouted: string[];
  /** Responses whose body has been asked for but not delivered yet. */
  pendingBodies: number;
}

const DICT_WORDS = ["amabilis", "amicus", "amo", "amor", "arma", "puella"];

const FAKE_COMPLETIONS: CompletionsProvider = {
  getCompletions: ({ query, dicts }) =>
    Promise.resolve(
      Object.fromEntries(
        dicts.map((dict) => [
          dict,
          DICT_WORDS.filter((w) => w.startsWith(query.toLowerCase())),
        ])
      )
    ),
};

const LEMMA_SHARDS = buildLemmaShards([
  "amo",
  "amor",
  "caedo",
  "Caesar",
  "puella",
]);

interface Routed {
  readonly status: number;
  readonly body: string;
  readonly isHtml?: true;
}

function isHeaderRecord(
  headers: HeadersInit
): headers is Record<string, string> {
  return (
    !Array.isArray(headers) &&
    // jsdom has no `Headers`.
    (typeof Headers === "undefined" || !(headers instanceof Headers))
  );
}

function header(init: RequestInit | undefined, name: string) {
  const headers = init?.headers;
  if (headers === undefined) return undefined;
  if (isHeaderRecord(headers)) return headers[name];
  if (Array.isArray(headers)) {
    return headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
  }
  return headers.get(name) ?? undefined;
}

function isPartial(url: URL, init: RequestInit | undefined) {
  return (
    url.searchParams.get("format") === "partial" ||
    header(init, "X-Requested-With") === "fetch"
  );
}

async function route(
  url: URL,
  init: RequestInit | undefined
): Promise<Routed | undefined> {
  const q = url.searchParams;
  if (url.pathname === "/v2/api/completions") {
    const prefix = q.get("prefix");
    const body = prefix
      ? await getV2DictChunks(FAKE_COMPLETIONS, { rawPrefix: prefix })
      : await getV2Completions(FAKE_COMPLETIONS, {
          rawQuery: q.get("q") ?? "",
          activeDictKeys: DICT_AMO_QUERIED,
        });
    return { status: 200, body: JSON.stringify(body) };
  }
  const lemmata = /^\/v2\/api\/corpus\/lemmata\/([^/])$/.exec(url.pathname);
  if (lemmata) {
    const letter = decodeURIComponent(lemmata[1]).toLowerCase();
    return { status: 200, body: LEMMA_SHARDS.get(letter) ?? "[]" };
  }
  if (url.pathname === "/v2/dicts" && isPartial(url, init)) {
    const query = q.get("q") ?? "";
    const body = renderDictResultsHtml(
      query,
      query === "amo" ? DICT_AMO_RESULTS : undefined,
      { queriedDicts: DICT_AMO_QUERIED }
    );
    return { status: 200, body, isHtml: true };
  }
  if (url.pathname === "/v2/corpus" && isPartial(url, init)) {
    const view = await runCorpusSearch(
      parseCorpusParams(Object.fromEntries(q)),
      ssrFixtureCorpusEngine(),
      CORPUS_TEST_AUTHORS
    );
    return {
      status: 200,
      body: renderCorpusPartialHtml(view).toString(),
      isHtml: true,
    };
  }
  return undefined;
}

/** The part of `Response` V2's client code reads. */
interface FakeResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

function fakeResponse(
  status: number,
  body: string,
  log: FakeNetworkLog
): FakeResponse {
  const read = () => {
    log.pendingBodies++;
    return new Promise<string>((resolve) => {
      setTimeout(() => {
        log.pendingBodies--;
        resolve(body);
      }, FAKE_BODY_LATENCY_MS);
    });
  };
  return {
    ok: status < 400,
    status,
    text: read,
    json: async () => {
      const parsed: unknown = JSON.parse(await read());
      return parsed;
    },
  };
}

function abortError(): Error {
  return Object.assign(new Error("The operation was aborted."), {
    name: "AbortError",
  });
}

function urlOf(input: string | URL | { url: string }): URL {
  const href =
    typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
  return new URL(href, window.location.href);
}

/** Replaces `global.fetch` for the current test. */
export function installFakeNetwork(): FakeNetworkLog {
  const log: FakeNetworkLog = { html: [], unrouted: [], pendingBodies: 0 };
  const fakeFetch = (
    input: string | URL | { url: string },
    init?: RequestInit
  ): Promise<FakeResponse> => {
    const url = urlOf(input);
    const signal = init?.signal ?? undefined;
    return new Promise<FakeResponse>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        route(url, init).then((routed) => {
          if (routed === undefined) {
            log.unrouted.push(url.pathname + url.search);
            resolve(fakeResponse(404, "", log));
            return;
          }
          if (routed.isHtml) log.html.push(routed.body);
          resolve(fakeResponse(routed.status, routed.body, log));
        }, reject);
      }, FAKE_FETCH_LATENCY_MS);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  };
  // `defineProperty`, since `FakeResponse` is only the part of `Response`
  // the client reads.
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: jest.fn(fakeFetch),
  });
  return log;
}
