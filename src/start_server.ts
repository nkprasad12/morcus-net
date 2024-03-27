/* istanbul ignore file */

import * as dotenv from "dotenv";
import express from "express";
import http from "http";

import { setupServer, WebServerParams } from "@/web/web_server";
import { envVar } from "@/common/env_vars";
import { LewisAndShort } from "@/common/lewis_and_short/ls_dict";
import path from "path";
import { GitHub } from "@/web/utils/github";
import { MongoLogger } from "@/web/telemetry/mongo_logger";
import { TelemetryLogger } from "@/web/telemetry/telemetry";
import {
  CompletionsFusedApi,
  DictsFusedApi,
  GetWork,
  ListLibraryWorks,
  ReportApi,
  ScrapeUrlApi,
} from "@/web/api_routes";
import { RouteDefinition } from "@/web/utils/rpc/server_rpc";
import { DictInfo, Dictionary } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { SmithAndHall } from "@/common/smith_and_hall/sh_dict";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import {
  retrieveWorkStringified,
  retrieveWorksList,
} from "@/common/library/library_lookup";
import { readFileSync } from "fs";
import { scrapeUrlText } from "@/web/scraping/scraper";

function randInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function delayedInit(provider: () => Dictionary, info: DictInfo): Dictionary {
  let delegate: Dictionary | null = null;
  const cachedProvider = () => {
    if (delegate === null) {
      delegate = provider();
    }
    return delegate;
  };
  // Allow some fuzz here so that when we start up dev and prod instances at the same time, we are
  // not initializing all databases across all instances at the exact same time.
  setTimeout(() => cachedProvider(), randInRange(25, 150));
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

export function startMorcusServer(): Promise<http.Server> {
  process.env.COMMIT_ID = readFileSync("build/morcusnet.commit.txt").toString();

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

  const consoleTelemetry = process.env.CONSOLE_TELEMETRY === "yes";
  const mongodbUri = process.env.MONGODB_URI;
  const mongodbUriEmpty = mongodbUri === undefined || mongodbUri.length === 0;
  if (mongodbUriEmpty && !consoleTelemetry) {
    log("No `MONGODB_URI` environment variable set. Logging to console.");
  }
  if (!mongodbUriEmpty && consoleTelemetry) {
    log("`MONGODB_URI` set but logging to console due to `CONSOLE_TELEMETRY`.");
  }
  const telemetry =
    !mongodbUriEmpty && !consoleTelemetry
      ? MongoLogger.create(mongodbUri, envVar("DB_SOURCE"))
      : Promise.resolve(TelemetryLogger.NoOp);
  const githubToken = process.env.GITHUB_TOKEN;
  const githubTokenEmpty =
    githubToken === undefined || githubToken.length === 0;
  if (githubTokenEmpty) {
    log(
      "No `GITHUB_TOKEN` environment variable set. Logging issues to console."
    );
  }
  const buildDir = path.join(process.cwd(), "build", "client");
  const params: WebServerParams = {
    webApp: app,
    routes: [
      RouteDefinition.create(ReportApi, (request) =>
        githubTokenEmpty
          ? Promise.resolve(log(GitHub.createIssueBody(request)))
          : GitHub.reportIssue(request, githubToken)
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
      RouteDefinition.create(ListLibraryWorks, (_unused) =>
        retrieveWorksList()
      ),
      RouteDefinition.create(ScrapeUrlApi, scrapeUrlText),
    ],
    telemetry: telemetry,
    buildDir,
  };

  setupServer(params);

  const host = "localhost";
  const portVar = envVar("PORT", "unsafe");
  if (portVar === undefined) {
    log("No `PORT` environment variable set. Using any open port.");
  }
  const port = portVar === undefined ? 0 : parseInt(portVar);
  return new Promise((resolve) => {
    server.listen(port, () => {
      const memoryLogId = setInterval(
        () => telemetry.then(logMemoryUsage),
        120 * randInRange(14.75, 15.25)
      );
      server.on("close", () => {
        log("Cleaning up resources.");
        clearInterval(memoryLogId);
        telemetry.then((t) => t.teardown());
      });
      resolve(server);
      const address = server.address();
      const realPort =
        typeof address === "string" || address === null ? port : address.port;
      log(`Running on http://${host}:${realPort}/`);
    });
  });
}

if (process.env.MAIN === "start") {
  dotenv.config();
  startMorcusServer().then((server) => {
    log("Server started! Press Ctrl+C to exit.");
    const cleanup = (signal: string) => {
      log(`${signal} received, closing server.`);
      server.close();
    };
    process.on("SIGTERM", () => cleanup("SIGTERM"));
    process.on("SIGINT", () => cleanup("SIGINT"));
  });
}
