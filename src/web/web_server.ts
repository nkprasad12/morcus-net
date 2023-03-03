import express, { Request } from "express";
import http from "http";

const host = "localhost";
const port = 8000;

function log(message: string) {
  console.log(`[Web Server] ${message}`);
}

export interface WebServerParams {
  server: http.Server;
  app: express.Express;
  macronizer: (input: string) => Promise<string>;
}

export function startServer(params: WebServerParams): void {
  const app = params.app;
  const server = params.server;

  app.use(express.static("genfiles_static"));
  // TODO: Make the route a constant so that we can access it from the client.
  app.get(
    "/api/macronize/:input",
    async (req: Request<{ input: string }>, res) => {
      res.send(await params.macronizer(req.params.input));
    }
  );

  server.listen(port, host, () => {
    log(`Server is running on http://${host}:${port}`);
  });
}
