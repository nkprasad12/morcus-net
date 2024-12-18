/* istanbul ignore file */

import compression from "compression";
import http from "http";
import express from "express";
import bodyParser from "body-parser";
import path from "path";
import {
  Data,
  RouteDefinition,
  RouteDefinitionType,
  addApi,
} from "@/web/utils/rpc/server_rpc";
import { TelemetryLogger } from "@/web/telemetry/telemetry";
import { buildMorceusHelper } from "@/morceus/projects/gui/morceus-helper.esbuild";
import { inLsButNotMorceus } from "@/morceus/debug";
import { IsLsButNotMorceus } from "@/morceus/projects/gui/morceus_helper_apis";

interface WebServerParams {
  webApp: express.Express;
  routes: RouteDefinition<any, Data, RouteDefinitionType>[];
  buildDir: string;
}

function setupServer(params: WebServerParams): void {
  const app = params.webApp;
  app.use(bodyParser.text());
  app.use(compression());
  app.use(express.static(params.buildDir));

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

  params.routes.forEach((r) =>
    addApi(
      {
        webApp: params.webApp,
        telemetry: Promise.resolve(TelemetryLogger.NoOp),
      },
      r
    )
  );
}

async function startServer() {
  await buildMorceusHelper();
  const app = express();
  const server = http.createServer(app);
  setupServer({
    webApp: app,
    routes: [
      RouteDefinition.create(IsLsButNotMorceus, async () =>
        inLsButNotMorceus()
      ),
    ],
    buildDir: path.join(process.cwd(), "build/devtools/morceus-helper"),
  });
  const host = "localhost";
  const port = 57575;
  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve(server);
      console.log(`Running on http://${host}:${port}/`);
    });
  });
}

startServer();
