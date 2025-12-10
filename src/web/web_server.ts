import compression from "compression";
import express, { Response } from "express";
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

const DAYS_IN_YEAR = 365;
const HOURS_IN_DAY = 24;
const SECONDS_IN_HOUR = 3600;

const MAX_AGE = 10 * DAYS_IN_YEAR * HOURS_IN_DAY * SECONDS_IN_HOUR;
const CLIENT_BUNDLE_SUFFIX = ".client-bundle.js";
const CLIENT_BUNDLE_CACHE_CONTROL = `public, max-age=${MAX_AGE}, immutable`;
// Add no-transform to prevent proxies from uncompressing and then recompressing
// the Javascript bundles at a lower compression level.
const PRE_COMPRESSED_CACHE_CONTROL = `${CLIENT_BUNDLE_CACHE_CONTROL}, no-transform`;
const SET_HEADERS = (res: Response, path: string) => {
  // Force users to always fetch the index from the server so that they
  // always get the latest Javascript bundles.
  if (path.endsWith("index.html")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  }
  if (path.endsWith(CLIENT_BUNDLE_SUFFIX)) {
    res.setHeader("Cache-Control", CLIENT_BUNDLE_CACHE_CONTROL);
  }
};

const STATIC_OPTIONS = {
  maxAge: MAX_AGE,
  setHeaders: SET_HEADERS,
};

interface Encoding {
  encoding: string;
  extension: string;
}

const PRE_COMPRESSED_ENCODINGS: Encoding[] = [
  { encoding: "br", extension: "br" },
  { encoding: "gzip", extension: "gz" },
];

function preCompressedMiddleware(sourceDir: string): express.Handler {
  let sourceDirFiles: Set<string> | undefined = undefined;
  return async (req, res, next) => {
    const acceptEncoding = req.header("accept-encoding");
    if (
      acceptEncoding === undefined ||
      !req.path.endsWith(CLIENT_BUNDLE_SUFFIX)
    ) {
      next();
      return;
    }
    if (sourceDirFiles === undefined) {
      sourceDirFiles = new Set(await fs.readdir(sourceDir).catch(() => []));
    }
    for (const { encoding, extension } of PRE_COMPRESSED_ENCODINGS) {
      const fileName = path.basename(`${req.path}.${extension}`);
      if (!acceptEncoding.includes(encoding) || !sourceDirFiles.has(fileName)) {
        continue;
      }
      res.setHeader("Content-Encoding", encoding);
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("Cache-Control", PRE_COMPRESSED_CACHE_CONTROL);
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("X-MorcusNet-PreCompressed", "1");
      res.sendFile(path.join(sourceDir, fileName));
      return;
    }
    next();
  };
}

export interface WebServerParams {
  webApp: express.Express;
  routes: RouteDefinition<any, Data, RouteDefinitionType>[];
  telemetry: Promise<TelemetryLogger>;
  buildDir: string;
}

export function setupServer(params: WebServerParams): void {
  const app = params.webApp;
  app.use(bodyParser.text());
  app.use(preCompressedMiddleware(params.buildDir));
  app.use(compression());
  app.use("/offlineData/:resourceName", (req, res) => {
    res.header("Content-Type", "application/octet-stream");
    const resourceName: string = req.params["resourceName"];
    console.debug(`/offlineData/${resourceName}`);
    res.sendFile(
      path.resolve(
        path.join("build/offlineData", `${resourceName}.json.gz.chunked`)
      )
    );
    return;
  });
  app.use("/public/pwa.webmanifest", (_, res) => {
    res.send(PWA_WEBMANIFEST);
    return;
  });
  app.use("/public", express.static("public", STATIC_OPTIONS));
  app.use("/.well-known", express.static("public", STATIC_OPTIONS));
  app.use(express.static(params.buildDir, STATIC_OPTIONS));

  app.use("/*", (req, res, next) => {
    if (!req.baseUrl.startsWith("/api/")) {
      // Force users to always fetch the index from the server so that they
      // always get the latest Javascript bundles.
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(params.buildDir, "index.html"));
      return;
    }
    next();
  });

  params.routes.forEach((r) => addApi(params, r));
}
