import compression from "compression";
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs/promises";
import { TelemetryLogger } from "@/web/telemetry/telemetry";
import {
  Data,
  RouteDefinition,
  RouteDefinitionType,
  addApi,
} from "@/web/utils/rpc/server_rpc";
import { PWA_WEBMANIFEST } from "@/web/server/pwa_utils";
import { getV2BuildDir } from "@/bundler/v2_build_contract";
import { IMMUTABLE_CACHE_CONTROL } from "@/web/v2/core/server/build_version.server";

const DAYS_IN_YEAR = 365;
const HOURS_IN_DAY = 24;
const SECONDS_IN_HOUR = 3600;

const MAX_AGE = 10 * DAYS_IN_YEAR * HOURS_IN_DAY * SECONDS_IN_HOUR;

const STATIC_OPTIONS = { maxAge: MAX_AGE };

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
 * Serves the `.br` / `.gz` siblings `v2.rsbuild.ts` writes next to UI V2's
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

export interface WebServerParams {
  webApp: express.Express;
  routes: RouteDefinition<any, Data, RouteDefinitionType>[];
  telemetry: Promise<TelemetryLogger>;
  v2Router: express.Router;
}

export function setupServer(params: WebServerParams): void {
  const app = params.webApp;
  app.use(bodyParser.text());
  // Ahead of the V2 router's own `/assets` static handler.
  app.use("/assets", preCompressedMiddleware(getV2BuildDir));
  app.use(compression());
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
    res.sendFile(path.resolve("public", "favicon.ico"), { maxAge: MAX_AGE });
  });
  app.get("/robots.txt", (_, res) => {
    res.sendFile(path.resolve("public", "robots.txt"), { maxAge: MAX_AGE });
  });
  app.use("/public/pwa.webmanifest", (_, res) => {
    res.type("application/manifest+json").send(PWA_WEBMANIFEST);
    return;
  });
  app.use("/public", express.static("public", STATIC_OPTIONS));
  app.use("/.well-known", express.static("public", STATIC_OPTIONS));
  app.use("/", params.v2Router);

  params.routes.forEach((r) => addApi(params, r));
}
