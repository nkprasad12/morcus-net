import compression from "compression";
import express, { Response } from "express";
import bodyParser from "body-parser";
import path from "path";
import { TelemetryLogger } from "./telemetry/telemetry";
import { ApiHandler, Data, addApi } from "./utils/rpc/server_rpc";
import {
  DictsLsApi,
  EntriesByPrefixApi,
  MacronizeApi,
  ReportApi,
} from "./utils/rpc/routes";
import { ApiRoute } from "./utils/rpc/api_route";
import { XmlNode } from "@/common/lewis_and_short/xml_node";

export interface WebServerParams {
  webApp: express.Express;
  macronizer: ApiHandler<string, string>;
  lsDict: ApiHandler<string, XmlNode[]>;
  entriesByPrefix: ApiHandler<string, string[]>;
  fileIssueReport: ApiHandler<string, any>;
  telemetry: Promise<TelemetryLogger>;
  buildDir: string;
}

export function setupServer(params: WebServerParams): void {
  function handleApi<I, O extends Data>(
    route: ApiRoute<I, O>,
    handler: ApiHandler<I, O>
  ) {
    addApi(params, { route: route, handler: handler });
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

  handleApi(MacronizeApi, params.macronizer);
  handleApi(ReportApi, params.fileIssueReport);
  handleApi(DictsLsApi, params.lsDict);
  handleApi(EntriesByPrefixApi, params.entriesByPrefix);
}
