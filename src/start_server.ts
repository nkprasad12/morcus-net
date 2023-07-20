/* istanbul ignore file */

// To run the server with node on javascript directly, uncomment this line:
//```
// require("module-alias/register");
//```
// and install `module-alias`. Then, add
// "_moduleAliases": {
//   "@": "build"
// },
//  to the `package.json`. This current fucks with the jest config.
// Then, `npx tsc -p tsconfig.json` to build js, and
// `node build/start_server.js` to start the server.
// Based on local testing, this saves ~30-40 MB memory.

import * as dotenv from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";

import { setupServer, WebServerParams } from "@/web/web_server";
import { SocketWorkServer } from "@/web/sockets/socket_worker_server";
import { WorkRequest } from "./web/workers/requests";
import { Workers } from "./web/workers/worker_types";
import { randomInt } from "crypto";
import { checkPresent } from "./common/assert";
import { LewisAndShortSql } from "./common/lewis_and_short/ls";
import path from "path";
import { GitHub } from "./web/utils/github";
import { MongoLogger } from "./web/telemetry/mongo_logger";
import { TelemetryLogger } from "./web/telemetry/telemetry";
import {
  DictsLsApi,
  EntriesByPrefixApi,
  MacronizeApi,
  ReportApi,
} from "./web/api_routes";
import { ApiHandler, RouteAndHandler } from "./web/utils/rpc/server_rpc";
import { ApiRoute } from "./web/utils/rpc/rpc";

dotenv.config();

function createApi<I, O>(
  route: ApiRoute<I, O>,
  handler: ApiHandler<I, O>
): RouteAndHandler<I, O> {
  return { route, handler };
}

function log(message: string) {
  console.log(`[start_server] ${message}`);
}

function bytesToMb(input: number): number {
  const inMb = input / (1024 * 1024);
  return Math.round(inMb * 10) / 10;
}

function logMemoryUsage(telemetry: TelemetryLogger): void {
  const usage = process.memoryUsage();
  telemetry.logServerHealth({
    rss: bytesToMb(usage.rss),
    heapTotal: bytesToMb(usage.heapTotal),
    heapUsed: bytesToMb(usage.heapUsed),
    external: bytesToMb(usage.external),
    arrayBuffers: bytesToMb(usage.arrayBuffers),
  });
}

const host = "localhost";
const port = parseInt(
  checkPresent(process.env.PORT, "PORT environment variable")
);

const app = express();
const server = http.createServer(app);

const lewisAndShort = new LewisAndShortSql();
const workServer = new SocketWorkServer(new Server(server));
const telemetry =
  process.env.CONSOLE_TELEMETRY !== "yes"
    ? MongoLogger.create()
    : Promise.resolve(TelemetryLogger.NoOp);

async function callWorker(
  category: Workers.Category,
  input: string
): Promise<string> {
  const request: WorkRequest<string> = {
    category: category,
    id: `${randomInt(1000000)}`,
    content: input,
  };
  const result = await workServer.process(request);
  return result.content;
}

const params: WebServerParams = {
  webApp: app,
  routes: [
    createApi(MacronizeApi, (input) => callWorker(Workers.MACRONIZER, input)),
    createApi(ReportApi, (request) =>
      GitHub.reportIssue(request.reportText, request.commit)
    ),
    createApi(DictsLsApi, async (input) => lewisAndShort.getEntry(input)),
    createApi(EntriesByPrefixApi, async (prefix) =>
      lewisAndShort.getCompletions(prefix)
    ),
  ],
  buildDir: path.join(__dirname, "../genfiles_static"),
  telemetry: telemetry,
};

setupServer(params);

server.listen(port, () => {
  log(`Local server: http://${host}:${port}/`);
  setInterval(() => telemetry.then(logMemoryUsage), 1000 * 5);
});
