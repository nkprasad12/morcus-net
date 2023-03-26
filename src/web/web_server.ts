import compression from "compression";
import express, { Request } from "express";
import { lsCall, macronizeCall } from "@/web/api_routes";
import path from "path";
import bodyParser from "body-parser";

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
  app.use(bodyParser.text());
  app.use(compression());
  const staticOptions = {
    maxAge: 100 * 365 * 24 * 3600 * 100,
  };
  app.use("/public", express.static("public", staticOptions));
  app.use(express.static("genfiles_static", staticOptions));

  app.use("/*", (req, res, next) => {
    if (!req.baseUrl.startsWith("/api/")) {
      res.sendFile(path.join(__dirname, "../../genfiles_static", "index.html"));
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

  app.get(lsCall(":entry"), async (req: Request<{ entry: string }>, res) => {
    log(`Got LS request`);
    res.send(await params.lsDict(req.params.entry));
  });
}
