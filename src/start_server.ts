/* istanbul ignore file */

import express from "express";
import http from "http";

import { setupServer, WebServerParams } from "@/web/web_server";
import { envVar } from "@/common/env_vars";
import { LewisAndShort } from "@/common/lewis_and_short/ls_dict";
import { MongoLogger } from "@/web/telemetry/mongo_logger";
import { TelemetryLogger } from "@/web/telemetry/telemetry";
import { DictInfo, Dictionary } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { SmithAndHall } from "@/common/smith_and_hall/sh_dict";
import { FusedDictionary } from "@/common/dictionaries/fused_dictionary";
import { readFileSync } from "fs";
import { createV2Router } from "@/web/ui/app_router.server";
import { sqliteBacking } from "@/common/dictionaries/sqlite_backing";
import { MorceusTables } from "@/morceus/cruncher_tables";
import { timed } from "@/common/timing/timed_invocation";
import { MorceusCruncher } from "@/morceus/crunch";
import { CruncherOptions } from "@/morceus/cruncher_types";
import { NumeralDict } from "@/common/dictionaries/numeral/numeral_dict";
import { RiddleArnoldDict } from "@/common/dictionaries/riddle_arnold/riddle_arnold_dict";
import { GaffiotDict } from "@/common/gaffiot/gaf_dict";
import type { InflectionProvider } from "@/common/dictionaries/latin_dict_fetching";
import {
  getFormattedMemoryUsage,
  lruMemoize,
  singletonOf,
} from "@/common/misc_utils";
import { GeorgesDict } from "@/common/dictionaries/georges/georges_dict";
import { assertEqual } from "@/common/assert";
import { macronizerEngineFromEnv } from "@/web/ui/macronizer/macronizer_engine.server";
import { PozoDict } from "@/common/dictionaries/pozo/pozo_dict";
import { GesnerDict } from "@/common/dictionaries/gesner/gesner_dict";
import { ForcelliniDict } from "@/common/dictionaries/forcellini/forcellini_dict";
import { rustCorpusApiHandler } from "@/common/library/corpus/corpus_rust";
import { openCompletionsDb } from "@/web/ui/dict/search/completions_db.server";

function randInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function delayedInit(provider: () => Dictionary, info: DictInfo): Dictionary {
  let delegate: Dictionary | null = null;
  const cachedProvider = () => {
    if (delegate === null) {
      delegate = provider();
      assertEqual(delegate.info, info, "Bad configuration");
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

function logMemoryUsage(telemetry: TelemetryLogger): Promise<void> {
  return telemetry.logServerHealth(getFormattedMemoryUsage());
}

/** Telemetry is best-effort: a failed write is logged, never fatal. */
function logTelemetryError(err: unknown): void {
  console.error("[start_server] Telemetry error:", err);
}

const INFLECTION_PROVIDER = singletonOf<InflectionProvider>(() => {
  const tables = timed(
    () => MorceusTables.CACHED.get(),
    "Create Morpheus tables"
  );
  const cruncher = MorceusCruncher.make(tables);
  // Each lookup fans out to every Latin dictionary, and they all ask for the
  // analyses of the same word, so share the result instead of re-running
  // Morceus for each one.
  return lruMemoize((word) => cruncher(word, CruncherOptions.DEFAULT), 32);
});

function startMorcusServer(): Promise<http.Server> {
  log("Attempting to start server");
  process.env.COMMIT_ID = readFileSync("build/morcusnet.commit.txt")
    .toString()
    .trim();

  const app = express();
  const server = http.createServer(app);

  const lewisAndShort = delayedInit(() => {
    return LewisAndShort.create(
      sqliteBacking(envVar("LS_PROCESSED_PATH")),
      INFLECTION_PROVIDER.get()
    );
  }, LatinDict.LewisAndShort);
  const smithAndHall = delayedInit(() => {
    const start = performance.now();
    const result = new SmithAndHall(sqliteBacking(envVar("SH_PROCESSED_PATH")));
    const elapsed = (performance.now() - start).toFixed(3);
    console.debug(`SmithAndHall init: ${elapsed} ms`);
    return result;
  }, LatinDict.SmithAndHall);
  const gaffiot = delayedInit(() => {
    const start = performance.now();
    const result = new GaffiotDict(
      sqliteBacking(envVar("GAFFIOT_PROCESSED_PATH")),
      INFLECTION_PROVIDER.get()
    );
    const elapsed = (performance.now() - start).toFixed(3);
    console.debug(`Gaffiot init: ${elapsed} ms`);
    return result;
  }, LatinDict.Gaffiot);
  const georges = delayedInit(() => {
    const start = performance.now();
    const result = new GeorgesDict(
      sqliteBacking(envVar("GEORGES_PROCESSED_PATH"))
    );
    const elapsed = (performance.now() - start).toFixed(3);
    console.debug(`Georges init: ${elapsed} ms`);
    return result;
  }, LatinDict.Georges);
  const pozo = delayedInit(() => {
    const start = performance.now();
    const result = new PozoDict(sqliteBacking(envVar("POZO_PROCESSED_PATH")));
    const elapsed = (performance.now() - start).toFixed(3);
    console.debug(`Pozo init: ${elapsed} ms`);
    return result;
  }, LatinDict.Pozo);
  const gesner = delayedInit(() => {
    const start = performance.now();
    const result = new GesnerDict(
      sqliteBacking(envVar("GESNER_PROCESSED_PATH")),
      INFLECTION_PROVIDER.get()
    );
    const elapsed = (performance.now() - start).toFixed(3);
    console.debug(`Gesner init: ${elapsed} ms`);
    return result;
  }, LatinDict.Gesner);
  const forcellini = delayedInit(() => {
    const start = performance.now();
    const result = new ForcelliniDict(
      sqliteBacking(envVar("FORC_PROCESSED_PATH")),
      INFLECTION_PROVIDER.get()
    );
    const elapsed = (performance.now() - start).toFixed(3);
    console.debug(`Forcellini init: ${elapsed} ms`);
    return result;
  }, LatinDict.Forcellini);
  const numeralDict = new NumeralDict();
  const riddleArnold = delayedInit(() => {
    const start = performance.now();
    const result = new RiddleArnoldDict(
      sqliteBacking(envVar("RA_PROCESSED_PATH"))
    );
    const elapsed = (performance.now() - start).toFixed(3);
    console.debug(`RiddleArnold init: ${elapsed} ms`);
    return result;
  }, LatinDict.RiddleArnold);
  const fusedDict = new FusedDictionary([
    lewisAndShort,
    smithAndHall,
    riddleArnold,
    gaffiot,
    georges,
    gesner,
    forcellini,
    pozo,
    numeralDict,
  ]);
  const corpusHandler = rustCorpusApiHandler();
  setTimeout(corpusHandler.initialize, randInRange(250, 500));

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
      completions: openCompletionsDb(),
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
      const memoryLogId = setInterval(() => {
        telemetry.then(logMemoryUsage).catch(logTelemetryError);
      }, 1000 * 60 * randInRange(14.75, 15.25));
      server.on("close", () => {
        log("Cleaning up resources.");
        clearInterval(memoryLogId);
        telemetry.then((t) => t.teardown()).catch(logTelemetryError);
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
