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
import webpack from "webpack";
import webpackDevMiddleware from "webpack-dev-middleware";

import { setupServer, WebServerParams } from "@/web/web_server";
import { SocketWorkServer } from "@/web/sockets/socket_worker_server";
import { WorkRequest } from "@/web/workers/requests";
import { Workers } from "@/web/workers/worker_types";
import { randomInt } from "crypto";
import { checkPresent } from "@/common/assert";
import { LewisAndShort } from "@/common/lewis_and_short/ls";
import path from "path";
import { GitHub } from "@/web/utils/github";
import { MongoLogger } from "@/web/telemetry/mongo_logger";
import { TelemetryLogger } from "@/web/telemetry/telemetry";
import {
  CompletionsFusedApi,
  DictsFusedApi,
  GetWork,
  ListLibraryWorks,
  MacronizeApi,
  ReportApi,
} from "@/web/api_routes";
import { RouteDefinition } from "@/web/utils/rpc/server_rpc";
import { DictInfo, Dictionary } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { SmithAndHall } from "@/common/smith_and_hall/sh_dict";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import {
  retrieveWorkStringified,
  retrieveWorksList,
} from "@/common/library/process_library";

dotenv.config();

function delayedInit(provider: () => Dictionary, info: DictInfo): Dictionary {
  let delegate: Dictionary | null = null;
  const cachedProvider = () => {
    if (delegate === null) {
      delegate = provider();
    }
    return delegate;
  };
  setTimeout(() => cachedProvider(), 50);
  return {
    info: info,
    getEntry: (...args) => cachedProvider().getEntry(...args),
    getEntryById: (...args) => cachedProvider().getEntryById(...args),
    getCompletions: (...args) => cachedProvider().getCompletions(...args),
  };
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

const lewisAndShort = delayedInit(
  () => LewisAndShort.create(),
  LatinDict.LewisAndShort
);
const smithAndHall = delayedInit(() => {
  const start = performance.now();
  const result = new SmithAndHall();
  const elapsed = (performance.now() - start).toFixed(3);
  console.debug(`SmithAndHall init: ${elapsed} ms`);
  return result;
}, LatinDict.SmithAndHall);
const fusedDict = new FusedDictionary([lewisAndShort, smithAndHall]);

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
const buildDir = path.join(__dirname, "../genfiles_static");
if (process.env.NODE_ENV === "dev") {
  const compiler = webpack(
    /* eslint-disable @typescript-eslint/no-var-requires */
    require("../webpack.config")({ transpileOnly: true, production: false })
  );
  app.use(
    webpackDevMiddleware(compiler, {
      publicPath: buildDir,
      writeToDisk: (fileName) => true,
    })
  );
}

const params: WebServerParams = {
  webApp: app,
  routes: [
    RouteDefinition.create(MacronizeApi, (input) =>
      callWorker(Workers.MACRONIZER, input)
    ),
    RouteDefinition.create(ReportApi, (request) =>
      GitHub.reportIssue(request.reportText, request.commit)
    ),
    RouteDefinition.create(DictsFusedApi, (input, extras) =>
      fusedDict.getEntry(input, extras)
    ),
    RouteDefinition.create(CompletionsFusedApi, (input, extras) =>
      fusedDict.getCompletions(input, extras)
    ),
    RouteDefinition.create(
      GetWork,
      (workId) => retrieveWorkStringified(workId),
      true
    ),
    RouteDefinition.create(ListLibraryWorks, (_unused) => retrieveWorksList()),
  ],
  telemetry: telemetry,
  buildDir,
};

setupServer(params);

server.listen(port, () => {
  log(`Local server running! Go to http://${host}:${port}/`);
  log("Press Ctrl+C to exit.");
  setInterval(() => telemetry.then(logMemoryUsage), 1000 * 60 * 15);
});
