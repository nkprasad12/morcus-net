import express, { Request } from "express";

export interface WebServerParams {
  app: express.Express;
  macronizer: (input: string) => Promise<string>;
}

export function setupServer(params: WebServerParams): void {
  const app = params.app;

  app.use(express.static("genfiles_static"));
  // TODO: Make the route a constant so that we can access it from the client.
  app.get(
    "/api/macronize/:input",
    async (req: Request<{ input: string }>, res) => {
      res.send(await params.macronizer(req.params.input));
    }
  );
}
