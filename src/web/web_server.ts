import compression from "compression";
import express, { Request, Response } from "express";
import { entriesByPrefix, lsCall } from "@/web/api_routes";
import bodyParser from "body-parser";
import path from "path";
import { ApiCallData, TelemetryLogger } from "./telemetry/telemetry";
import { addApi } from "./utils/rpc/server_rpc";
import { MacronizeApi, ReportApi } from "./utils/rpc/routes";

function log(message: string) {
  console.debug(`[web_server] [${Date.now() / 1000}] ${message}`);
}

export interface WebServerParams {
  webApp: express.Express;
  macronizer: (input: string) => Promise<string>;
  lsDict: (entry: string) => Promise<string>;
  entriesByPrefix: (prefix: string) => Promise<string[]>;
  fileIssueReport: (reportText: string) => Promise<void>;
  telemetry: Promise<TelemetryLogger>;
  buildDir: string;
}

export function setupServer(params: WebServerParams): void {
  async function logApi(data: Omit<ApiCallData, "latencyMs">, start: number) {
    const finalData = {
      ...data,
      latencyMs: Math.round(performance.now() - start),
    };
    (await params.telemetry).logApiCall(finalData);
  }

  const app = params.webApp;
  app.use(bodyParser.text());
  app.use(compression());
  const staticOptions = {
    maxAge: 100 * 365 * 24 * 3600 * 100,
    setHeaders: (res: Response, path: string) => {
      // Force users to always fetch the index from the server so that they
      // always get the latest Javascript bundles.
      if (path.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  };
  app.use("/public", express.static("public", staticOptions));
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

  addApi(params, { route: MacronizeApi, handler: params.macronizer });
  addApi(params, { route: ReportApi, handler: params.fileIssueReport });

  app.get(lsCall(":entry"), async (req: Request<{ entry: string }>, res) => {
    const start = performance.now();
    log(`Got LS request`);
    res.send(await params.lsDict(req.params.entry));
    logApi(
      {
        name: "LsQuery",
        status: 200,
        params: { entry: req.params.entry },
      },
      start
    );
  });

  app.get(
    entriesByPrefix(":prefix"),
    async (req: Request<{ prefix: string }>, res) => {
      const start = performance.now();
      log(`Got entriesByPrefix request`);
      res.send(JSON.stringify(await params.entriesByPrefix(req.params.prefix)));
      logApi(
        {
          name: "EntriesByPrefix",
          status: 200,
          params: { prefix: req.params.prefix },
        },
        start
      );
    }
  );
}
