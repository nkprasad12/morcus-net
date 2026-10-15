/* istanbul ignore file */

import compression from "compression";
import http from "http";
import express from "express";
import path from "path";
import { buildMorceusHelper } from "@/morceus/projects/gui/morceus-helper.esbuild";
import { inLsButNotMorceus } from "@/morceus/debug";
import { LS_BUT_NOT_MORCEUS_PATH } from "@/morceus/projects/gui/morceus_helper_apis";

function setupServer(app: express.Express, buildDir: string): void {
  app.use(compression());
  app.get(LS_BUT_NOT_MORCEUS_PATH, (_req, res) => {
    res.json(inLsButNotMorceus());
  });
  app.use(express.static(buildDir));
  app.use("/*", (_req, res) => {
    // Force users to always fetch the index from the server so that they
    // always get the latest Javascript bundles.
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.join(buildDir, "index.html"));
  });
}

async function startServer() {
  await buildMorceusHelper();
  const app = express();
  const server = http.createServer(app);
  setupServer(app, path.join(process.cwd(), "build/devtools/morceus-helper"));
  const host = "localhost";
  const port = 57575;
  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve(server);
      console.log(`Running on http://${host}:${port}/`);
    });
  });
}

void startServer();
