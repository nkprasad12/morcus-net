/**
 * Request telemetry for UI V2: one `ApiCalls` row per routed request, in the
 * same `ApiCallData` schema and Mongo collection V1's RPC wrapper
 * (`adaptHandler` in `server_rpc.ts`) writes, so queries span both UIs.
 *
 * `telemetryMiddleware` is installed once in `createV2Router`, after the static
 * `/assets` handler and before the domain routers, so every route is counted
 * without per-route code. Handlers may add phase marks through
 * `requestTimer(res)`: dict, reader, corpus and macronizer handlers mark
 * `lookupComplete` after their awaited lookup and before rendering, so SSR cost
 * is `sent - lookupComplete`.
 *
 * Row format:
 *
 * - `name`: Express route pattern without the `/v2` mount (`/dicts`,
 *   `/work/:author/:name/:page?`); non-GET routes are prefixed with the
 *   method (`POST /macronizer`).
 * - `status`: final HTTP status.
 * - `latencyMs`: time to hand-off (the `sent` mark); see "Latency" below.
 * - `params`: route and query params as strings, bounded (`collectParams`);
 *   absent on POST.
 * - `inputLength`: request `Content-Length`, POST only.
 * - `outputLength`: uncompressed body bytes.
 * - `extras.ui`: always `"v2"`; distinguishes V2 rows from V1's.
 * - `extras.<mark>`: ms since request start, for `sent`, `end`,
 *   `lookupComplete`, `error`, `closed` and the dictionary phases.
 * - `extras.flushMs`: `end - sent`, i.e. compression and socket flush; absent
 *   when aborted.
 * - `extras.mode`: `"api"` for `/api/*`, else `"partial"` (`?format=partial`
 *   or `X-Requested-With: fetch`), else `"page"`.
 * - `extras.embedded`: `true` in the dictionary iframe. Independent of `mode`,
 *   since an iframe both loads pages and fetches partials.
 * - `extras.fetchMode` / `fetchSite`: raw `Sec-Fetch-Mode` / `Sec-Fetch-Site`.
 *   Deliberately not a derived "No-JS" flag: that heuristic has false
 *   positives (new tabs, JS not loaded yet), so it belongs at query time.
 * - `extras.versioned`: `"current"` / `"stale"` when the URL carries `?v=`.
 *   Not a cache hit rate: immutable hits never reach the server.
 * - `extras.paramsTruncated`: a `params` cap fired. Legitimate requests never
 *   trip it, so it doubles as a scanner flag.
 * - `extras.path`: URL path on 500 rows; see "Errors" below.
 * - `extras.aborted`: the client closed the connection before the response
 *   finished; see "Aborted requests" below.
 *
 * Not logged: unmatched paths, 3xx redirects, HEAD requests (uptime probes),
 * and `/assets` (mounted before the middleware).
 *
 * Design decisions that aren't obvious from the code:
 *
 * - **Latency.** `compression()` runs upstream, so `res.send` only queues the
 *   body into zlib; `finish` fires after gzip and the socket flush, which can
 *   include client backpressure. V1 stamped its latency right after
 *   `res.send`, so `latencyMs` is the `sent` mark for continuity, and the
 *   flush-inclusive time is kept alongside as `extras.end` / `flushMs`.
 * - **Byte counting.** `compression()` strips `Content-Length`, so the body is
 *   counted by wrapping `res.end` / `res.write`. These wrappers are installed
 *   after compression's, so they see the uncompressed body, matching V1.
 * - **Errors.** Each sub-router restores `req.params` on exit, so when an error
 *   is forwarded with `next(err)` to `v2ErrorHandler`, route params are gone
 *   (`req.route` and `req.query` survive). 500 rows record `extras.path`
 *   instead. `/api/completions` answers its own failures with a 200 and an
 *   empty result and only marks `error`.
 * - **Aborted requests.** A fetch superseded via `scope.latest`, a user leaving
 *   mid-load, or a dropped connection fires `close` without `finish`. These are
 *   mostly slow requests, so dropping them would undercount load and flatter
 *   latency. The handler still runs, so the row is written at hand-off with its
 *   real status and marks, plus `aborted`.
 * - **Partial detection** calls `isPartialRequest(req)` without `res`, because
 *   passing `res` sets `Vary: X-Requested-With`, which non-dual-mode routes
 *   must not get.
 */

import type {
  ErrorRequestHandler,
  Request,
  RequestHandler,
  Response,
} from "express";
import type {
  ApiCallData,
  ApiParam,
  TelemetryLogger,
} from "@/web/telemetry/telemetry";
import { Timer } from "@/web/telemetry/timer";
import type { ServerExtras } from "@/web/utils/rpc/server_rpc";
import {
  isEmbeddedRequest,
  isPartialRequest,
} from "@/web/ui/core/server/request_params.server";
import { getBuildVersion } from "@/web/ui/core/server/build_version.server";

/** Phase marks for the current request; a no-op outside the middleware. */
interface RequestTimer {
  /** Records `tag` as milliseconds since the request started. */
  mark(tag: string): void;
  /** Adapts `mark` to the `ServerExtras` the dictionary code accepts. */
  serverExtras(): ServerExtras;
}

const UNCOMPRESSED_LENGTH_LOCALS_KEY = "morcusUncompressedLength";

/**
 * Records the uncompressed byte length of a pre-compressed response, so
 * `ApiCalls.outputLength` stays comparable with responses `compression()`
 * encodes downstream.
 */
export function recordUncompressedLength(res: Response, bytes: number): void {
  res.locals[UNCOMPRESSED_LENGTH_LOCALS_KEY] = bytes;
}

class ActiveRequestTimer implements RequestTimer {
  readonly #timer: Timer;

  constructor(timer: Timer) {
    this.#timer = timer;
  }

  mark(tag: string): void {
    this.#timer.event(tag);
  }

  serverExtras(): ServerExtras {
    return { log: (tag) => this.#timer.event(tag) };
  }
}

const NO_OP_TIMER: RequestTimer = {
  mark: () => {},
  serverExtras: () => ({ log: () => {} }),
};

const TIMER_LOCALS_KEY = "morcusRequestTimer";

/**
 * The timer for the request `res` answers. Outside the telemetry middleware
 * (e.g. a sub-router mounted alone in a test) this is a no-op.
 */
export function requestTimer(res: Response): RequestTimer {
  const timer: unknown = res.locals[TIMER_LOCALS_KEY];
  return timer instanceof ActiveRequestTimer ? timer : NO_OP_TIMER;
}

// ---------------------------------------------------------------------------
// `params`: everything, bounded
// ---------------------------------------------------------------------------
// No per-route allow-list: it would drift silently as params are renamed.
// Instead every param is logged, under caps no legitimate request reaches.

const PARAM_KEY_SHAPE = /^[a-zA-Z0-9_]{1,32}$/;
/** Captured elsewhere (`mode`, `embedded`, `versioned`) or transient markers. */
const DENIED_PARAM_KEYS: ReadonlySet<string> = new Set([
  "format",
  "v",
  "embedded",
  "save",
]);
const MAX_PARAM_KEYS = 10;
const MAX_PARAM_VALUE_LENGTH = 128;
const MAX_PARAMS_JSON_LENGTH = 1024;
const MAX_PATH_LENGTH = 128;

/** Truncates to at most `max` characters, ending in `…` when cut. */
function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** A query or path value as a string, or undefined for nested objects. */
function flattenParamValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      if (typeof item !== "string") return undefined;
      parts.push(item);
    }
    return parts.join(",");
  }
  return undefined;
}

interface LoggedParams {
  params?: ApiParam;
  truncated: boolean;
}

/**
 * Flattens route and query params into the bounded `params` of a row. Route
 * params take precedence over a query key of the same name.
 */
export function collectParams(
  routeParams: Readonly<Record<string, unknown>>,
  query: Readonly<Record<string, unknown>>
): LoggedParams {
  const params: ApiParam = {};
  let count = 0;
  let truncated = false;
  for (const source of [routeParams, query]) {
    for (const [key, rawValue] of Object.entries(source)) {
      if (rawValue === undefined || key in params) continue;
      if (DENIED_PARAM_KEYS.has(key)) continue;
      const value = flattenParamValue(rawValue);
      if (!PARAM_KEY_SHAPE.test(key) || value === undefined) {
        truncated = true;
        continue;
      }
      if (count >= MAX_PARAM_KEYS) {
        truncated = true;
        continue;
      }
      if (value.length > MAX_PARAM_VALUE_LENGTH) truncated = true;
      params[key] = truncate(value, MAX_PARAM_VALUE_LENGTH);
      count += 1;
    }
  }
  // Backstop: drop the last keys until the serialized form fits.
  const keys = Object.keys(params);
  while (
    keys.length > 0 &&
    JSON.stringify(params).length > MAX_PARAMS_JSON_LENGTH
  ) {
    const last = keys.pop();
    if (last !== undefined) delete params[last];
    truncated = true;
  }
  return { params: keys.length > 0 ? params : undefined, truncated };
}

// ---------------------------------------------------------------------------
// Row construction
// ---------------------------------------------------------------------------

/** The matched route pattern, or undefined if no route handled the request. */
function routePattern(req: Request): string | undefined {
  const route: unknown = req.route;
  if (typeof route !== "object" || route === null || !("path" in route)) {
    return undefined;
  }
  return typeof route.path === "string" ? route.path : undefined;
}

/** Uncompressed byte length of a `res.write` / `res.end` chunk. */
function chunkLength(chunk: unknown, encoding: unknown): number {
  if (typeof chunk === "string") {
    return Buffer.byteLength(
      chunk,
      typeof encoding === "string" && Buffer.isEncoding(encoding)
        ? encoding
        : "utf8"
    );
  }
  if (chunk instanceof Uint8Array) return chunk.byteLength;
  return 0;
}

function hasRequestBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

interface ResponseState {
  readonly timer: Timer;
  outputLength: number;
  sentMs?: number;
  /** The client closed the connection before the response finished. */
  aborted: boolean;
  /** A row was written; guards against `finish`, `close` and hand-off racing. */
  logged: boolean;
}

function buildRow(
  req: Request,
  res: Response,
  pattern: string,
  state: ResponseState
): ApiCallData {
  const endMs = state.timer.event("end");
  const sentMs = state.sentMs ?? endMs;
  const method = req.method;
  const extras: Record<string, unknown> = { ui: "v2" };
  Object.assign(extras, state.timer.getEvents());
  if (state.aborted) {
    // Nothing was flushed, so `flushMs` would be meaningless.
    extras.aborted = true;
  } else {
    extras.flushMs = Math.round(100 * (endMs - sentMs)) / 100;
  }

  extras.mode = pattern.startsWith("/api/")
    ? "api"
    : // Without `res`: passing it would add `Vary: X-Requested-With`.
    isPartialRequest(req)
    ? "partial"
    : "page";
  if (isEmbeddedRequest(req)) extras.embedded = true;
  const fetchMode = req.get("Sec-Fetch-Mode");
  if (fetchMode !== undefined) extras.fetchMode = fetchMode;
  const fetchSite = req.get("Sec-Fetch-Site");
  if (fetchSite !== undefined) extras.fetchSite = fetchSite;
  if (req.query.v !== undefined) {
    const buildVersion = getBuildVersion();
    extras.versioned =
      buildVersion !== undefined && req.query.v === buildVersion
        ? "current"
        : "stale";
  }
  if (res.statusCode === 500) {
    // `req.params` is reset when an error leaves a sub-router (see header).
    extras.path = truncate(req.originalUrl.split("?")[0], MAX_PATH_LENGTH);
  }

  const uncompressedOverride: unknown =
    res.locals[UNCOMPRESSED_LENGTH_LOCALS_KEY];
  const row: ApiCallData = {
    name: method === "GET" ? pattern : `${method} ${pattern}`,
    status: res.statusCode,
    latencyMs: sentMs,
    outputLength:
      typeof uncompressedOverride === "number"
        ? uncompressedOverride
        : state.outputLength,
    userAgent: req.get("User-Agent"),
    extras,
  };
  if (hasRequestBody(method)) {
    const contentLength = Number(req.get("Content-Length"));
    if (Number.isFinite(contentLength)) row.inputLength = contentLength;
  } else {
    const { params, truncated } = collectParams(req.params, req.query);
    if (params !== undefined) row.params = params;
    if (truncated) extras.paramsTruncated = true;
  }
  return row;
}

function logRow(telemetry: Promise<TelemetryLogger>, row: ApiCallData): void {
  telemetry
    .then((logger) => logger.logApiCall(row))
    .catch((err: unknown) => console.debug("[v2] telemetry failed:", err));
}

/**
 * Wraps `res.write` / `res.end` to count uncompressed body bytes and stamp
 * `sent` when the handler hands the body off. Installed after `compression()`
 * patched the same methods, so these wrappers see the body before gzip.
 */
function instrumentBody(
  res: Response,
  state: ResponseState,
  onHandOff: () => void
): void {
  res.write = new Proxy(res.write.bind(res), {
    apply(target, thisArg, args: unknown[]): unknown {
      state.outputLength += chunkLength(args[0], args[1]);
      const result: unknown = Reflect.apply(target, thisArg, args);
      return result;
    },
  });
  res.end = new Proxy(res.end.bind(res), {
    apply(target, thisArg, args: unknown[]): unknown {
      if (state.sentMs === undefined) {
        state.outputLength += chunkLength(args[0], args[1]);
        state.sentMs = state.timer.event("sent");
        onHandOff();
      }
      const result: unknown = Reflect.apply(target, thisArg, args);
      return result;
    },
  });
}

/**
 * Emits one `ApiCalls` row per routed request once its response finishes.
 * Requests no route matched, redirects and HEAD requests are not logged. A
 * request the client aborted is logged once its handler hands off the body,
 * with `extras.aborted`.
 * Telemetry failures are swallowed: they must never affect the response.
 */
export function telemetryMiddleware(
  telemetry: Promise<TelemetryLogger>
): RequestHandler {
  return (req, res, next) => {
    try {
      // HEAD is almost always an uptime probe, not usage.
      if (req.method === "HEAD") {
        next();
        return;
      }
      const state: ResponseState = {
        timer: new Timer(),
        outputLength: 0,
        aborted: false,
        logged: false,
      };
      const emit = () => {
        if (state.logged) return;
        state.logged = true;
        try {
          const pattern = routePattern(req);
          if (pattern === undefined) return;
          if (res.statusCode >= 300 && res.statusCode < 400) return;
          logRow(telemetry, buildRow(req, res, pattern, state));
        } catch (err) {
          console.debug("[v2] telemetry failed:", err);
        }
      };
      res.locals[TIMER_LOCALS_KEY] = new ActiveRequestTimer(state.timer);
      // An aborted request still runs its handler to completion; it is logged
      // at hand-off (when the handler's status and marks are known), as V1 did.
      instrumentBody(res, state, () => {
        if (state.aborted) emit();
      });
      res.on("finish", emit);
      res.on("close", () => {
        if (res.writableFinished || state.logged) return;
        state.aborted = true;
        state.timer.event("closed");
        // Closed after hand-off but before the last byte: log now.
        if (state.sentMs !== undefined) emit();
      });
    } catch (err) {
      console.debug("[v2] telemetry failed:", err);
    }
    next();
  };
}

/** The HTTP status an error carries (e.g. body-parser's 400/413), else 500. */
function errorStatus(err: unknown): number {
  if (typeof err === "object" && err !== null) {
    const status =
      "status" in err
        ? err.status
        : "statusCode" in err
        ? err.statusCode
        : undefined;
    if (
      typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 400 &&
      status < 600
    ) {
      return status;
    }
  }
  return 500;
}

/**
 * The last middleware of the V2 router: answers an error a handler forwarded
 * to `next`, and marks it so the telemetry row records the failure.
 */
export const v2ErrorHandler: ErrorRequestHandler = (
  err: unknown,
  req,
  res,
  // Express recognises error middleware by its four parameters.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next
) => {
  const status = errorStatus(err);
  if (status >= 500) {
    console.error(`[v2] ${req.method} ${req.originalUrl}`, err);
  }
  requestTimer(res).mark("error");
  if (!res.headersSent) {
    res
      .status(status)
      .type("text")
      .send(status >= 500 ? "Internal error" : "Bad request");
  } else {
    res.end();
  }
};
