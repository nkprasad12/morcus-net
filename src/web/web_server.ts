import compression from "compression";
import express from "express";
import type { ServerResponse } from "http";
import onHeaders from "on-headers";
import path from "path";
import fs from "fs/promises";
import zlib from "zlib";
import { PWA_WEBMANIFEST } from "@/web/server/pwa_utils";
import {
  DYNAMIC_BROTLI_QUALITY,
  getV2BuildDir,
} from "@/bundler/client_build_contract";
import { IMMUTABLE_CACHE_CONTROL } from "@/web/ui/core/server/build_version.server";

export { DYNAMIC_BROTLI_QUALITY };

const SECONDS_IN_DAY = 24 * 3600;
const MS_PER_SECOND = 1000;

// Brand images (`/favicon.ico`, `/public/logo*.png`) are unchanging; cache for
// the HTTP spec maximum of 1 year (`express.static` / `sendFile` take ms).
const IMAGE_MAX_AGE_MS = 365 * SECONDS_IN_DAY * MS_PER_SECOND;

// Unversioned metadata (`/robots.txt`, `/.well-known/assetlinks.json`) caches
// for 7 days so updates propagate within a week.
const METADATA_MAX_AGE_MS = 7 * SECONDS_IN_DAY * MS_PER_SECOND;

const PWA_WEBMANIFEST_JSON = JSON.stringify(PWA_WEBMANIFEST);

interface Encoding {
  encoding: string;
  extension: string;
}

const PRE_COMPRESSED_ENCODINGS: Encoding[] = [
  { encoding: "br", extension: "br" },
  { encoding: "gzip", extension: "gz" },
];

/**
 * Marks a response served from a build-time sibling, so tests (and anyone
 * debugging) can tell it apart from on-the-fly `compression()` output.
 */
export const PRECOMPRESSED_HEADER = "X-MorcusNet-PreCompressed";

const PRE_COMPRESSED_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".js": "application/javascript; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
};

/**
 * UI V2's content-hashed assets (`<name>.<hash>.<js|css>`). This leaves out
 * `critical.*` (inlined into `<head>`, never fetched) and `manifest.json`.
 */
const isV2HashedAsset = (name: string) =>
  /^[\w-]+\.[\w-]+\.(?:js|css)$/.test(name);

async function isFile(file: string): Promise<boolean> {
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}

/**
 * Serves the `.br` / `.gz` siblings `client.rsbuild.ts` writes next to UI V2's
 * hashed assets, when the client accepts
 * that encoding. Mounted on `/assets`, ahead of the V2 router's static handler.
 * Anything else falls through to the static handler, and `compression()`
 * encodes it on the fly. `compression()` leaves these responses alone because
 * they already carry a `Content-Encoding`.
 */
function preCompressedMiddleware(getSourceDir: () => string): express.Handler {
  const serve = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const name = req.path.slice(1);
    if (
      (req.method !== "GET" && req.method !== "HEAD") ||
      !isV2HashedAsset(name)
    ) {
      next();
      return;
    }
    // Server preference order, not the client's: browsers list `gzip` before
    // `br` but take either, and brotli is ~12% smaller on our bundles.
    // `acceptsEncodings` honours `q=0`.
    for (const { encoding, extension } of PRE_COMPRESSED_ENCODINGS) {
      if (req.acceptsEncodings(encoding) !== encoding) continue;
      // Checked per request rather than cached, so a rebuild under a running
      // server is picked up.
      const file = path.join(getSourceDir(), `${name}.${extension}`);
      if (!(await isFile(file))) continue;
      res.setHeader("Content-Encoding", encoding);
      res.setHeader("Vary", "Accept-Encoding");
      // `no-transform` keeps proxies from recompressing at a lower level.
      res.setHeader(
        "Cache-Control",
        `${IMMUTABLE_CACHE_CONTROL}, no-transform`
      );
      res.setHeader(
        "Content-Type",
        PRE_COMPRESSED_CONTENT_TYPES[path.extname(name)]
      );
      res.setHeader(PRECOMPRESSED_HEADER, "1");
      res.sendFile(file, (err) => {
        if (err && !res.headersSent) next(err);
      });
      return;
    }
    next();
  };
  return (req, res, next) => {
    serve(req, res, next).catch(next);
  };
}

/**
 * `compression()` >= 1.8 accepts `brotli` options, but `@types/compression`
 * 1.7 doesn't declare them yet.
 */
type CompressionOptionsWithBrotli = compression.CompressionOptions & {
  brotli?: zlib.BrotliOptions;
};

const COMPRESSION_OPTIONS: CompressionOptionsWithBrotli = {
  brotli: {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: DYNAMIC_BROTLI_QUALITY },
  },
};

/**
 * Marks every response that already carries a `Content-Encoding` as
 * `no-transform`: on-the-fly `compression()` output (mostly SSR HTML) and
 * responses that encode themselves (e.g. `sendPrecompressedJson`). A proxy or
 * CDN in front then forwards our encoding instead of decoding and re-encoding
 * it (often at a lower level, e.g. to inject or rewrite markup). Responses we
 * didn't encode are left alone, so a proxy may still compress or optimise them;
 * that includes images, which `compression()` never encodes.
 *
 * Proxies typically ask the origin for `br` whatever the browser sent, then
 * decode for clients that can't take it. With `no-transform` those clients
 * get identity instead of the proxy's gzip; every current browser accepts
 * `br`, so that only affects long-unsupported ones.
 *
 * Must be mounted *before* `compression()`: `compression()` skips responses
 * that are already `no-transform`, and `on-headers` (which `compression()`
 * also uses) fires listeners in reverse order of registration, so this one
 * sees the `Content-Encoding` that `compression()` just chose.
 */
function noTransformEncodedResponses(): express.Handler {
  return (_req, res, next) => {
    onHeaders(res, function markNoTransform(this: ServerResponse) {
      if (this.getHeader("Content-Encoding") === undefined) {
        return;
      }
      const cacheControl = this.getHeader("Cache-Control");
      if (cacheControl === undefined) {
        this.setHeader("Cache-Control", "no-transform");
      } else if (!/(?:^|,)\s*no-transform\s*(?:,|$)/.test(`${cacheControl}`)) {
        this.setHeader("Cache-Control", `${cacheControl}, no-transform`);
      }
    });
    next();
  };
}

export interface WebServerParams {
  webApp: express.Express;
  v2Router: express.Router;
}

export function setupServer(params: WebServerParams): void {
  const app = params.webApp;
  // Ahead of the V2 router's own `/assets` static handler.
  app.use("/assets", preCompressedMiddleware(getV2BuildDir));
  // Order matters; see `noTransformEncodedResponses`.
  app.use(noTransformEncodedResponses());
  app.use(compression(COMPRESSION_OPTIONS));
  app.get("/serviceworker.js", (_, res) => {
    // Never cached, so a later change here reaches browsers on their next visit.
    res.sendFile(path.resolve("public", "cleanup_service_worker.js"), {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Content-Type": "application/javascript",
      },
    });
  });
  // Browsers request `/favicon.ico` on their own, so pages don't need a
  // `<link rel="icon">`.
  app.get("/favicon.ico", (_, res) => {
    res.sendFile(path.resolve("public", "favicon.ico"), {
      maxAge: IMAGE_MAX_AGE_MS,
    });
  });
  app.get("/robots.txt", (_, res) => {
    res.sendFile(path.resolve("public", "robots.txt"), {
      maxAge: METADATA_MAX_AGE_MS,
    });
  });
  app.use("/public/pwa.webmanifest", (_, res) => {
    res.type("application/manifest+json").send(PWA_WEBMANIFEST_JSON);
    return;
  });
  app.use("/public", express.static("public", { maxAge: IMAGE_MAX_AGE_MS }));
  app.use(
    "/.well-known",
    express.static("public", { maxAge: METADATA_MAX_AGE_MS })
  );
  app.use("/", params.v2Router);
}
