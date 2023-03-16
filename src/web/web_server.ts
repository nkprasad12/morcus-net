import compression from "compression";
import express, { Request } from "express";
import { lsCall, macronizeCall } from "@/web/api_routes";
import path from "path";

function log(message: string) {
  console.log(`[web_server] [${Date.now() / 1000}] ${message}`);
}

export interface WebServerParams {
  app: express.Express;
  macronizer: (input: string) => Promise<string>;
  lsDict: (entry: string) => Promise<string>;
}

export function setupServer(params: WebServerParams): void {
  const app = params.app;

  app.use(compression());
  app.use("/public", express.static("public"));
  app.use(express.static("genfiles_static"));

  app.use("/*", (req, res, next) => {
    if (!req.baseUrl.startsWith("/api/")) {
      res.sendFile(path.join(__dirname, "../../genfiles_static", "index.html"));
      return;
    }
    next();
  });

  app.get(
    macronizeCall(":input"),
    async (req: Request<{ input: string }>, res) => {
      log(`Got macronize request`);
      const result = await params.macronizer(req.params.input);
      res.send(result);
    }
  );

  app.get(lsCall(":entry"), async (req: Request<{ entry: string }>, res) => {
    log(`Got LS request`);
    res.send(await params.lsDict(req.params.entry));
  });
}
