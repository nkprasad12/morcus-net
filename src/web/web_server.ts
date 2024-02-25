import { TelemetryLogger } from "@/web/telemetry/telemetry";
import {
  Data,
  RouteDefinition,
  RouteDefinitionType,
  addApi,
} from "@/web/utils/rpc/server_rpc";
import type { FastifyInstance } from "fastify";
import fastifyStatic, { type SetHeadersResponse } from "@fastify/static";
import fastifyCompress from "@fastify/compress";

const MAX_AGE = 100 * 365 * 24 * 3600 * 100;

export interface WebServerParams {
  webApp: FastifyInstance;
  routes: RouteDefinition<any, Data, RouteDefinitionType>[];
  telemetry: Promise<TelemetryLogger>;
  buildDir: string;
  publicDir: string;
}

export async function setupServer(params: WebServerParams) {
  const app = params.webApp;
  await app.register(fastifyCompress);
  const staticOptions = {
    maxAge: MAX_AGE,
    setHeaders: (res: SetHeadersResponse, path: string) => {
      // Force users to always fetch the index from the server so that they
      // always get the latest Javascript bundles.
      if (path.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
      if (path.endsWith(".client-bundle.js")) {
        res.setHeader("Cache-Control", `public, max-age=${MAX_AGE}, immutable`);
      }
    },
  };
  await app.register(fastifyStatic, {
    root: [params.buildDir, params.publicDir],
    prefix: "/public",
    setHeaders: staticOptions.setHeaders,
    maxAge: staticOptions.maxAge,
  });
  await app.register(fastifyStatic, {
    root: params.publicDir,
    prefix: "/.well-known",
    setHeaders: staticOptions.setHeaders,
    maxAge: staticOptions.maxAge,
    decorateReply: false,
  });

  // Make sure this is before the wildcard match!
  params.routes.forEach((r) => addApi(params, r));
  app.get("/*", (_req, res) => {
    // Force users to always fetch the index from the server so that they
    // always get the latest Javascript bundles.
    res.header("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile("index.html");
  });
}
