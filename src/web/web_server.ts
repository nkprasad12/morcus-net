import express, { Request } from "express";

import { lsCall, macronizeCall } from "@/web/api_routes";

export interface WebServerParams {
  app: express.Express;
  macronizer: (input: string) => Promise<string>;
  lsDict: (entry: string) => Promise<string>;
}

export function setupServer(params: WebServerParams): void {
  const app = params.app;

  app.use(express.static("genfiles_static"));
  // TODO: Make the route a constant so that we can access it from the client.
  app.get(
    macronizeCall(":input"),
    async (req: Request<{ input: string }>, res) => {
      res.send(await params.macronizer(req.params.input));
    }
  );

  app.get(lsCall(":entry"), async (req: Request<{ entry: string }>, res) => {
    res.send(await params.lsDict(req.params.entry));
  });
}
