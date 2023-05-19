import compression from "compression";
import express, { Request, Response } from "express";
import {
  entriesByPrefix,
  lsCall,
  macronizeCall,
  report,
} from "@/web/api_routes";
import bodyParser from "body-parser";
import path from "path";

function log(message: string) {
  console.debug(`[web_server] [${Date.now() / 1000}] ${message}`);
}

export interface WebServerParams {
  app: express.Express;
  macronizer: (input: string) => Promise<string>;
  lsDict: (entry: string) => Promise<string>;
  entriesByPrefix: (prefix: string) => Promise<string[]>;
  fileIssueReport: (reportText: string) => Promise<void>;
  buildDir: string;
}

export function setupServer(params: WebServerParams): void {
  const app = params.app;
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

  app.post(macronizeCall(), async (req, res) => {
    log(`Got macronize request`);
    if (typeof req.body !== "string") {
      res.send("Invalid request");
      return;
    }
    const result = await params.macronizer(req.body);
    res.send(result);
  });

  app.post(report(), async (req, res) => {
    if (typeof req.body !== "string") {
      res.status(400).send("Invalid request");
      return;
    }
    try {
      await params.fileIssueReport(req.body);
      res.status(200).send();
    } catch (e) {
      log(`Failed to file issue report!\n${e}`);
      res.status(500).send();
    }
  });

  app.get(lsCall(":entry"), async (req: Request<{ entry: string }>, res) => {
    log(`Got LS request`);
    res.send(await params.lsDict(req.params.entry));
  });

  app.get(
    entriesByPrefix(":prefix"),
    async (req: Request<{ prefix: string }>, res) => {
      log(`Got entriesByPrefix request`);
      res.send(JSON.stringify(await params.entriesByPrefix(req.params.prefix)));
    }
  );
}
