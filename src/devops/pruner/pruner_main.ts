/* istanbul ignore file */

import { rm, writeFile } from "node:fs/promises";
import { MongoClient, ServerApiVersion } from "mongodb";
import {
  MIN_MAX_MB,
  MIN_RETENTION_DAYS,
  parseIntSetting,
  runPruneLoop,
  StopController,
  WARN_MAX_MB,
  EXIT_ERROR,
  EXIT_OK,
} from "@/devops/pruner/cli";
import {
  DEFAULT_MAX_MB,
  DEFAULT_RETENTION_DAYS,
  deriveArchiveNamespace,
  runPrunePass,
} from "@/devops/pruner/pruner";
import {
  LocalFileBackupSink,
  NO_BACKUP_VALUE,
  parseBackupUri,
  S3BackupSink,
} from "@/devops/pruner/s3_client";

const BASE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const JITTER_MS = 15 * 60 * 1000;
/** Touched after each fully successful pass; read by the Docker HEALTHCHECK. */
const HEALTH_FILE = "/tmp/pruner-healthy";

function log(msg: string): void {
  console.log(`[pruner] ${msg}`);
}

async function main(): Promise<number> {
  const mongodbUri = process.env.MONGODB_URI?.trim() ?? "";
  if (mongodbUri.length === 0) {
    log("No MONGODB_URI set; telemetry pruner exiting.");
    return EXIT_OK;
  }

  // Validate all configuration before touching MongoDB.
  const retentionDays = parseIntSetting(
    "TELEMETRY_RETENTION_DAYS",
    process.env.TELEMETRY_RETENTION_DAYS,
    DEFAULT_RETENTION_DAYS,
    MIN_RETENTION_DAYS
  );
  const maxMb = parseIntSetting(
    "TELEMETRY_MAX_MB",
    process.env.TELEMETRY_MAX_MB,
    DEFAULT_MAX_MB,
    MIN_MAX_MB
  );
  if (maxMb > WARN_MAX_MB) {
    console.warn(
      `[pruner] TELEMETRY_MAX_MB=${maxMb} is close to (or above) the 512 MB M0 limit; the quota safety valve may trigger too late.`
    );
  }
  const maxBytes = maxMb * 1024 * 1024;
  const rawBackupUri = process.env.PRUNE_BACKUP_URI?.trim() ?? "";
  const sink = parseBackupUri(rawBackupUri);
  const dryRun =
    process.argv.includes("--dry-run") || process.env.PRUNE_DRY_RUN === "1";
  const runOnce =
    dryRun ||
    process.argv.includes("--once") ||
    process.env.PRUNE_RUN_ONCE === "1";

  // Constructing the client parses the URI but doesn't connect; the driver
  // connects on the first operation. `strict: false` because `dbStats`
  // (used by the quota safety valve) is not part of Stable API v1. Commands
  // that are in v1 keep v1 semantics.
  const client = new MongoClient(mongodbUri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: true,
    },
  });
  const namespace = deriveArchiveNamespace(
    client,
    process.env.PRUNE_ARCHIVE_PREFIX
  );

  const settings = `retention=${retentionDays}d, max=${maxMb}MB${
    dryRun ? ", DRY RUN: nothing will be written or deleted" : ""
  }`;
  if (sink === null) {
    log(
      `Starting in prune-only mode (PRUNE_BACKUP_URI=${NO_BACKUP_VALUE}; ${settings}); expired weeks are deleted WITHOUT backup.`
    );
  } else if (sink instanceof S3BackupSink) {
    log(
      `Starting with S3/R2 backup to ${sink.endpoint}/${sink.bucket}/${namespace}/ (${settings}).`
    );
  } else if (sink instanceof LocalFileBackupSink) {
    log(
      `Starting with local backup to ${sink.baseDir}/${namespace}/${
        rawBackupUri.length === 0 ? " (default; PRUNE_BACKUP_URI is unset)" : ""
      } (${settings}).`
    );
    // A local destination that isn't mounted or writable is a configuration
    // error, so fail fast before any MongoDB traffic. Remote (S3/R2) problems
    // may be transient; `runPrunePass` checks those every pass and reports
    // them via the health check instead of crash-looping the container.
    // A dry run checks (without writing) inside the pass instead, so it can
    // be run before the archive directory exists.
    if (!dryRun) {
      await sink.ensureReady();
    }
  }

  const stop = new StopController();
  const onSignal = (sig: "SIGTERM" | "SIGINT") => {
    log(`Received ${sig}; will stop after the current week completes.`);
    stop.request(sig);
  };
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));

  try {
    const db = client.db();
    return await runPruneLoop(runOnce, stop, {
      runPass: () =>
        runPrunePass(db, {
          retentionDays,
          maxBytes,
          sink,
          namespace,
          shouldStop: stop.shouldStop,
          dryRun,
        }),
      markHealthy: () =>
        writeFile(HEALTH_FILE, new Date().toISOString()).catch((err) =>
          console.error("[pruner] Failed to write health file:", err)
        ),
      markUnhealthy: () => rm(HEALTH_FILE, { force: true }).catch(() => {}),
      nextSleepMs: () =>
        BASE_INTERVAL_MS + Math.round((Math.random() * 2 - 1) * JITTER_MS),
      log,
    });
  } finally {
    await client.close().catch(() => {});
    log("Closed MongoDB connection.");
  }
}

if (require.main === module) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error("[pruner] Fatal error:", err);
      process.exitCode = EXIT_ERROR;
    }
  );
}
