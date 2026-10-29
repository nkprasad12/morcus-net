/* istanbul ignore file */

import express from "express";
import http from "http";

import { setupServer, WebServerParams } from "@/web/web_server";
import { envVar } from "@/common/env_vars";
import { LewisAndShort } from "@/common/lewis_and_short/ls_dict";
import { MongoLogger } from "@/web/telemetry/mongo_logger";
import { TelemetryLogger } from "@/web/telemetry/telemetry";
import { SmithAndHall } from "@/common/smith_and_hall/sh_dict";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { readFileSync } from "fs";
import { createV2Router } from "@/web/ui/app_router.server";
import {
  sqliteBacking,
  warmLookupPages,
} from "@/common/dictionaries/sqlite_backing";
import type { StoredDictBacking } from "@/common/dictionaries/stored_dict_interface";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { MorceusCruncher } from "@/morceus/crunch";
import { CruncherOptions } from "@/morceus/cruncher_types";
import { NumeralDict } from "@/common/dictionaries/numeral/numeral_dict";
import { RiddleArnoldDict } from "@/common/dictionaries/riddle_arnold/riddle_arnold_dict";
import { GaffiotDict } from "@/common/gaffiot/gaf_dict";
import type { InflectionProvider } from "@/common/dictionaries/latin_dict_fetching";
import { getFormattedMemoryUsage, lruMemoize } from "@/common/misc_utils";
import { GeorgesDict } from "@/common/dictionaries/georges/georges_dict";
import { macronizerEngineFromEnv } from "@/web/ui/macronizer/macronizer_engine.server";
import { PozoDict } from "@/common/dictionaries/pozo/pozo_dict";
import { GesnerDict } from "@/common/dictionaries/gesner/gesner_dict";
import { ForcelliniDict } from "@/common/dictionaries/forcellini/forcellini_dict";
import { rustCorpusApiHandler } from "@/common/library/corpus/corpus_rust";
import { openCompletionsDb } from "@/web/ui/dict/search/completions_db.server";
import { openStaticPagesDb } from "@/web/ui/core/server/static_pages.server";
import { Warmup, type Lazy } from "@/web/server/warmup";

function randInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** A dictionary backing that opens its database on first use. */
function lazyBacking(
  backing: Lazy<StoredDictBacking<"Sync">>
): StoredDictBacking<"Sync"> {
  return {
    allEntryNames: () => backing.get().allEntryNames(),
    matchesForCleanName: (name) => backing.get().matchesForCleanName(name),
    entriesForIds: (ids) => backing.get().entriesForIds(ids),
    entryNamesByPrefix: (prefix) => backing.get().entryNamesByPrefix(prefix),
    entryNamesBySuffix: (suffix) => backing.get().entryNamesBySuffix(suffix),
    lowMemory: false,
  };
}

function log(message: string) {
  console.log(`[start_server] ${message}`);
}

function logMemoryUsage(telemetry: TelemetryLogger): Promise<void> {
  return telemetry.logServerHealth(getFormattedMemoryUsage());
}

/** Telemetry is best-effort: a failed write is logged, never fatal. */
function logTelemetryError(err: unknown): void {
  console.error("[start_server] Telemetry error:", err);
}

function startMorcusServer(): Promise<http.Server> {
  const startTime = performance.now();
  log("Attempting to start server");
  process.env.COMMIT_ID = readFileSync("build/morcusnet.commit.txt")
    .toString()
    .trim();

  const app = express();
  const server = http.createServer(app);

  // Nothing expensive happens before `server.listen`: each resource below is
  // created on first use, or by `warmup` once the server is listening, in the
  // order registered here.
  const warmup = new Warmup();
  const dictFiles: Array<[name: string, pathVar: string]> = [];
  const dictBacking = (name: string, pathVar: string) => {
    dictFiles.push([name, pathVar]);
    return lazyBacking(warmup.lazy(name, () => sqliteBacking(envVar(pathVar))));
  };

  // `morceus` is declared below so that it warms after the databases.
  const inflections: InflectionProvider = (word) => morceus.get()(word);

  const fusedDict = new FusedDictionary([
    LewisAndShort.create(
      dictBacking("LewisAndShort", "LS_PROCESSED_PATH"),
      inflections
    ),
    new SmithAndHall(dictBacking("SmithAndHall", "SH_PROCESSED_PATH")),
    new RiddleArnoldDict(dictBacking("RiddleArnold", "RA_PROCESSED_PATH")),
    new GaffiotDict(
      dictBacking("Gaffiot", "GAFFIOT_PROCESSED_PATH"),
      inflections
    ),
    new GeorgesDict(dictBacking("Georges", "GEORGES_PROCESSED_PATH")),
    new GesnerDict(dictBacking("Gesner", "GESNER_PROCESSED_PATH"), inflections),
    new ForcelliniDict(
      dictBacking("Forcellini", "FORC_PROCESSED_PATH"),
      inflections
    ),
    new PozoDict(dictBacking("Pozo", "POZO_PROCESSED_PATH")),
    new NumeralDict(),
  ]);
  const completions = warmup.lazy("completions.db", () => openCompletionsDb());
  // Opened after `COMMIT_ID` is set above: the store is only used if it was
  // built for this server's build version and bundle.
  const staticPages = warmup.lazy("pages.db", () => openStaticPagesDb());
  // Morceus and the corpus come last: they're the slow ones.
  const morceus = warmup.lazy("Morpheus tables", () => {
    const cruncher = MorceusCruncher.make(MorceusTables.CACHED.get());
    // Each lookup fans out to every Latin dictionary, and they all ask for the
    // analyses of the same word, so share the result instead of re-running
    // Morceus for each one.
    return lruMemoize((word) => cruncher(word, CruncherOptions.DEFAULT), 32);
  });
  const corpusHandler = rustCorpusApiHandler();
  warmup.add(corpusHandler.initialize);
  // Optional, so last: pull the pages dictionary lookups use into the OS page
  // cache (~260 ms for all of them, one dictionary per turn), so the first
  // lookups after a cold start wait less on disk.
  for (const [name, pathVar] of dictFiles) {
    warmup.add(() => warmLookupPages(envVar(pathVar)), `${name} lookup pages`);
  }

  const consoleTelemetry = process.env.CONSOLE_TELEMETRY === "yes";
  const mongodbUri = process.env.MONGODB_URI;
  const mongodbUriEmpty = mongodbUri === undefined || mongodbUri.length === 0;
  if (mongodbUriEmpty && consoleTelemetry) {
    log("No `MONGODB_URI` environment variable set. Logging to console.");
  } else if (mongodbUriEmpty) {
    log("No `MONGODB_URI` environment variable set. Telemetry disabled.");
  } else if (consoleTelemetry) {
    log("`MONGODB_URI` set but logging to console due to `CONSOLE_TELEMETRY`.");
  }
  const telemetry: Promise<TelemetryLogger> =
    !mongodbUriEmpty && !consoleTelemetry
      ? MongoLogger.create(mongodbUri, envVar("DB_SOURCE")).catch(
          (err: unknown) => {
            logTelemetryError(err);
            return TelemetryLogger.NoOp;
          }
        )
      : consoleTelemetry
      ? Promise.resolve(TelemetryLogger.ConsoleLogger)
      : Promise.resolve(TelemetryLogger.NoOp);
  if (!process.env.GITHUB_TOKEN) {
    log(
      "No `GITHUB_TOKEN` environment variable set. Logging issues to console."
    );
  }
  const params: WebServerParams = {
    webApp: app,
    v2Router: createV2Router(fusedDict, {
      telemetry,
      corpus: corpusHandler,
      macronizer: macronizerEngineFromEnv(),
      completions: { get: (key) => completions.get()?.get(key) },
      staticPages: { get: (key) => staticPages.get()?.get(key) },
    }),
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
      warmup.start();
      const memoryLogId = setInterval(() => {
        telemetry.then(logMemoryUsage).catch(logTelemetryError);
      }, 1000 * 60 * randInRange(14.75, 15.25));
      server.on("close", () => {
        log("Cleaning up resources.");
        warmup.stop();
        clearInterval(memoryLogId);
        telemetry.then((t) => t.teardown()).catch(logTelemetryError);
      });
      resolve(server);
      const address = server.address();
      const realPort =
        typeof address === "string" || address === null ? port : address.port;
      const listenMs = (performance.now() - startTime).toFixed(2);
      log(
        `Running on http://${host}:${realPort}/ (listening in ${listenMs} ms)`
      );
    });
  });
}

if (process.env.MAIN === "start") {
  // A startup failure should crash the process.
  void startMorcusServer().then((server) => {
    log("Server started! Press Ctrl+C to exit.");
    const cleanup = (signal: string) => {
      log(`${signal} received, closing server.`);
      const forceCloseId = setTimeout(() => {
        server.getConnections((_, numConnections) => {
          log(`${numConnections} open connection(s) after 500 ms.`);
          if (numConnections > 0) {
            log("Forcibly closing open connections in 1500 ms.");
            setTimeout(() => server.closeAllConnections(), 1500);
          }
        });
      }, 500);
      // If the server is closed, clear any forceClose logic.
      server.close(() => clearTimeout(forceCloseId));
    };
    process.on("SIGTERM", () => cleanup("SIGTERM"));
    process.on("SIGINT", () => cleanup("SIGINT"));
  });
}
