import compression from "compression";
import express, { Response } from "express";
import bodyParser from "body-parser";
import path from "path";
import { TelemetryLogger } from "@/web/telemetry/telemetry";
import {
  Data,
  RouteDefinition,
  RouteDefinitionType,
  addApi,
} from "@/web/utils/rpc/server_rpc";
import { PWA_WEBMANIFEST } from "@/web/server/pwa_utils";

const MAX_AGE = 100 * 365 * 24 * 3600 * 100;

export interface WebServerParams {
  webApp: express.Express;
  routes: RouteDefinition<any, Data, RouteDefinitionType>[];
  telemetry: Promise<TelemetryLogger>;
  buildDir: string;
}

export function setupServer(params: WebServerParams): void {
  const app = params.webApp;
  app.use(bodyParser.text());
  app.use(compression());
  const staticOptions = {
    maxAge: MAX_AGE,
    setHeaders: (res: Response, path: string) => {
      // Force users to always fetch the index from the server so that they
      // always get the latest Javascript bundles.
      if (path.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
      if (path.endsWith(".client-bundle.js")) {
        res.setHeader("Cache-Control", `public, max-age=${MAX_AGE}, immutable`);
      }
    },
  };
  app.use("/serviceworker.js", (_, res) => {
    console.debug(`/serviceworker.js`);
    res.sendFile(path.join(params.buildDir, "serviceworker.js"));
    return;
  });
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
  app.use("/public", express.static("public", staticOptions));
  app.use("/.well-known", express.static("public", staticOptions));
  app.use(express.static(params.buildDir, staticOptions));

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
