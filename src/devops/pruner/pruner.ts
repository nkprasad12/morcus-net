import { createGzip } from "node:zlib";
import {
  Collection,
  Db,
  Document,
  Filter,
  MongoClient,
  ObjectId,
} from "mongodb";
import { BackupSink } from "@/devops/pruner/s3_client";

export const DEFAULT_RETENTION_DAYS = 100;
export const DEFAULT_MAX_MB = 400;
/**
 * Phase 2 (quota) never prunes the current ISO week or the two most recent
 * completed weeks, even if the DB is over `TELEMETRY_MAX_MB`. `db.stats()`
 * can't tell which collection is responsible for the overage, so this floor
 * stops a different collection's growth from wiping recent `ApiCalls` data.
 */
export const MIN_QUOTA_RETENTION_DAYS = 14;
export const TELEMETRY_COLLECTIONS = [
  "ApiCalls",
  "ServerHealth",
  // Legacy: written by the pre-#592 (Preact) client; nothing writes it now,
  // but old deployments still hold documents in it.
  "ClientEvents",
] as const;

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

export interface IsoWeek {
  readonly year: number;
  readonly week: number;
  readonly label: string;
  readonly startMs: number;
  readonly endMs: number;
}

/**
 * Computes the UTC ISO-8601 week (`YYYY-Www`, Monday 00:00:00.000Z to next
 * Monday 00:00:00.000Z) containing `epochMs`.
 */
export function getIsoWeek(epochMs: number): IsoWeek {
  const d = new Date(epochMs);
  // UTC day of week with Monday = 0 .. Sunday = 6
  const dayOfWeek = (d.getUTCDay() + 6) % 7;
  const mondayUtc = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - dayOfWeek
  );
  const nextMondayUtc = mondayUtc + MS_PER_WEEK;

  // ISO week-numbering year is the year of that week's Thursday (Monday + 3 days).
  const thursday = new Date(mondayUtc + 3 * MS_PER_DAY);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = Date.UTC(isoYear, 0, 4);
  const jan4DayOfWeek = (new Date(jan4).getUTCDay() + 6) % 7;
  const week1Monday = jan4 - jan4DayOfWeek * MS_PER_DAY;
  const isoWeek = Math.round((mondayUtc - week1Monday) / MS_PER_WEEK) + 1;
  const label = `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;

  return {
    year: isoYear,
    week: isoWeek,
    label,
    startMs: mondayUtc,
    endMs: nextMondayUtc,
  };
}

export function nextIsoWeek(week: IsoWeek): IsoWeek {
  return getIsoWeek(week.endMs);
}

const NAMESPACE_PATTERN = /^[A-Za-z0-9._-]+$/;

function sanitizeNamespacePart(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
}

/**
 * Validates an explicit `PRUNE_ARCHIVE_PREFIX`. Throws on anything that could
 * escape or nest the archive directory layout.
 */
export function validateArchivePrefix(prefix: string): string {
  if (!NAMESPACE_PATTERN.test(prefix) || prefix === "." || prefix === "..") {
    throw new Error(
      `Invalid PRUNE_ARCHIVE_PREFIX '${prefix}': use only letters, digits, '.', '_' and '-'.`
    );
  }
  return prefix;
}

/**
 * Returns the archive key namespace: `override` if given, otherwise
 * `<clusterHost>-<dbName>` derived from the client's parsed connection string
 * (the SRV host for `mongodb+srv://` URIs, else the first listed host, with
 * the port dropped). Two deployments that both use the default DB name
 * `test` therefore don't collide in a shared bucket or directory.
 */
export function deriveArchiveNamespace(
  client: MongoClient,
  override?: string
): string {
  const trimmed = override?.trim() ?? "";
  if (trimmed.length > 0) {
    return validateArchivePrefix(trimmed);
  }
  const options = client.options;
  const firstHost = options.hosts[0];
  const host =
    options.srvHost ?? firstHost?.host ?? firstHost?.socketPath ?? "unknown";
  return `${sanitizeNamespacePart(host)}-${sanitizeNamespacePart(
    options.dbName
  )}`;
}

export function weekArchiveKey(
  namespace: string,
  collectionName: string,
  week: IsoWeek
): string {
  return `${namespace}/${collectionName}/${week.year}/${collectionName}-${week.label}.jsonl.gz`;
}

function idAtMs(epochMs: number): ObjectId {
  return ObjectId.createFromTime(Math.floor(epochMs / 1000));
}

export function weekIdFilter(week: IsoWeek): {
  _id: { $gte: ObjectId; $lt: ObjectId };
} {
  return { _id: { $gte: idAtMs(week.startMs), $lt: idAtMs(week.endMs) } };
}

async function compressDocsToGzip(cursor: AsyncIterable<Document>): Promise<{
  gzBuffer: Buffer;
  docCount: number;
  lastExportedId: ObjectId | null;
}> {
  const gzip = createGzip();
  const chunks: Buffer[] = [];
  gzip.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    gzip.on("end", () => resolve(Buffer.concat(chunks)));
    gzip.on("error", reject);
  });
  // Waiting for `drain` alone would hang if gzip errored instead; racing
  // against `finished` surfaces the error.
  const drained = () =>
    Promise.race([
      new Promise<void>((resolve) => gzip.once("drain", resolve)),
      finished.then(() => undefined),
    ]);

  let docCount = 0;
  let lastExportedId: ObjectId | null = null;
  for await (const doc of cursor) {
    docCount++;
    if (doc._id instanceof ObjectId) {
      lastExportedId = doc._id;
    }
    const canContinue = gzip.write(`${JSON.stringify(doc)}\n`);
    if (!canContinue) {
      await drained();
    }
  }
  gzip.end();
  const gzBuffer = await finished;
  return { gzBuffer, docCount, lastExportedId };
}

export interface PrunedWeekSummary {
  readonly collection: string;
  readonly week: string;
  readonly backedUpDocs: number;
  readonly deletedDocs: number;
  /** Gzipped archive size; `0` when the week was not exported. */
  readonly gzipBytes: number;
  readonly reason: "age" | "quota";
  /** True if nothing was written or deleted (see `PrunePassOptions.dryRun`). */
  readonly dryRun: boolean;
}

/**
 * Backs up `week` to `sink` (if provided) and then deletes the week's
 * documents from `collection`.
 *
 * With a sink:
 * - An existing archive is never overwritten. If it holds at least as many
 *   docs as Mongo still has for the week, and its last `_id` (when known) is
 *   at least Mongo's last `_id` for the week (a previous run was interrupted
 *   mid-`deleteMany`), it is kept and the delete is finished. If it holds
 *   fewer, ends earlier, or can't be read, this throws and nothing is deleted.
 * - The delete is bounded by the last exported `_id`, so nothing newer than
 *   what was exported is deleted.
 *
 * Invariant this relies on: `_id`s are `ObjectId`s assigned by the driver at
 * insert time, and nothing inserts into or backfills a past week. A count
 * plus last-`_id` check can't detect a document that was added to an old
 * week after it was archived; if that ever becomes possible, the "existing
 * archive is a superset" rule above is no longer safe.
 *
 * With `dryRun`, the week is exported (to measure it) but nothing is uploaded
 * or deleted, and the existing-archive check is skipped.
 */
export async function pruneWeek(
  collection: Collection<Document>,
  collectionName: string,
  namespace: string,
  week: IsoWeek,
  sink: BackupSink | null,
  reason: "age" | "quota",
  dryRun: boolean = false
): Promise<PrunedWeekSummary> {
  const weekFilter = weekIdFilter(week);

  if (sink === null && !dryRun) {
    const deleteRes = await collection.deleteMany(weekFilter);
    return {
      collection: collectionName,
      week: week.label,
      backedUpDocs: 0,
      deletedDocs: deleteRes.deletedCount ?? 0,
      gzipBytes: 0,
      reason,
      dryRun,
    };
  }

  const cursor = collection.find(weekFilter).sort({ _id: 1 });
  const { gzBuffer, docCount, lastExportedId } = await compressDocsToGzip(
    cursor
  );
  if (docCount === 0 || lastExportedId === null) {
    return {
      collection: collectionName,
      week: week.label,
      backedUpDocs: 0,
      deletedDocs: 0,
      gzipBytes: 0,
      reason,
      dryRun,
    };
  }

  const key = weekArchiveKey(namespace, collectionName, week);
  if (dryRun || sink === null) {
    // `sink === null && !dryRun` returned above, so this is the dry run.
    console.log(
      `[pruner] DRY RUN: would ${
        sink === null ? "delete WITHOUT backup" : `archive to ${key} and delete`
      } ${collectionName} ${week.label} (${docCount} docs, ${
        gzBuffer.byteLength
      } gzipped bytes; reason: ${reason}).`
    );
    return {
      collection: collectionName,
      week: week.label,
      backedUpDocs: 0,
      deletedDocs: 0,
      gzipBytes: gzBuffer.byteLength,
      reason,
      dryRun,
    };
  }
  const lastExportedHex = lastExportedId.toHexString();
  const existing = await sink.headWeek(key);
  if (existing !== null && existing.docCount < docCount) {
    throw new Error(
      `Existing archive ${key} has fewer docs (${existing.docCount}) than Mongo (${docCount}); refusing to overwrite or delete.`
    );
  }
  if (
    existing !== null &&
    existing.lastId !== undefined &&
    existing.lastId < lastExportedHex
  ) {
    throw new Error(
      `Existing archive ${key} ends at _id ${existing.lastId}, before Mongo's last _id ${lastExportedHex} for the week; refusing to overwrite or delete.`
    );
  }
  if (existing === null) {
    await sink.putWeek(key, gzBuffer, {
      docCount,
      lastId: lastExportedHex,
      weekStart: new Date(week.startMs).toISOString(),
      weekEnd: new Date(week.endMs).toISOString(),
    });
    const verified = await sink.headWeek(key);
    if (verified === null || verified.docCount !== docCount) {
      throw new Error(
        `Backup verification failed for ${key}: expected docCount=${docCount}, got ${JSON.stringify(
          verified
        )}`
      );
    }
  }

  const deleteRes = await collection.deleteMany({
    _id: { $gte: weekFilter._id.$gte, $lte: lastExportedId },
  });
  const deletedDocs = deleteRes.deletedCount ?? 0;
  if (deletedDocs !== docCount) {
    console.warn(
      `[pruner] Deleted count (${deletedDocs}) differed from backed-up count (${docCount}) for ${key}.`
    );
  }
  return {
    collection: collectionName,
    week: week.label,
    backedUpDocs: docCount,
    deletedDocs,
    gzipBytes: gzBuffer.byteLength,
    reason,
    dryRun,
  };
}

/**
 * Returns the timestamp of the oldest `ObjectId` `_id` in `collection`
 * (optionally only considering `_id >= afterId`), or `null` if none. Non-
 * `ObjectId` ids sort before `ObjectId`s in BSON, so they are filtered out
 * rather than allowed to stall pruning.
 */
async function findOldestTimestampMs(
  collection: Collection<Document>,
  afterId?: ObjectId
): Promise<number | null> {
  const filter: Filter<Document> =
    afterId === undefined
      ? { _id: { $type: "objectId" } }
      : { _id: { $type: "objectId", $gte: afterId } };
  const oldest = await collection
    .find(filter, { projection: { _id: 1 } })
    .sort({ _id: 1 })
    .limit(1)
    .next();
  if (!oldest || !(oldest._id instanceof ObjectId)) {
    return null;
  }
  return oldest._id.getTimestamp().getTime();
}

export interface PrunePassOptions {
  readonly retentionDays?: number;
  readonly maxBytes?: number;
  readonly sink?: BackupSink | null;
  /** Archive key namespace (see `deriveArchiveNamespace`). */
  readonly namespace?: string;
  readonly now?: Date;
  readonly shouldStop?: () => boolean;
  readonly collections?: readonly string[];
  /**
   * Report what the pass would archive and delete (per week: doc count and
   * gzipped size) without writing to the sink or deleting from MongoDB. The
   * sink's readiness is checked read-only (`checkReady`) and reported as an
   * error rather than aborting the report.
   */
  readonly dryRun?: boolean;
}

export interface PrunePassResult {
  readonly prunedWeeks: PrunedWeekSummary[];
  /** Errors that were isolated during the pass. Empty on a healthy pass. */
  readonly errors: string[];
  readonly stoppedEarly: boolean;
  readonly dryRun: boolean;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Executes one full telemetry retention pass:
 * 1. Prunes completed ISO weeks older than `retentionDays` (default 100) across
 *    all telemetry collections (backing them up first if `sink` is set).
 * 2. Checks `db.stats()`; if `dataSize + indexSize > maxBytes` (default 400 MB),
 *    prunes the oldest remaining completed `ApiCalls` weeks until under the
 *    cap, never going past the `MIN_QUOTA_RETENTION_DAYS` floor.
 *
 * Failures are isolated: an error in one collection (e.g. a week refused by
 * the never-overwrite rule) is recorded in `errors` and the pass continues, so
 * a single anomalous week can't block quota enforcement.
 */
export async function runPrunePass(
  db: Db,
  options: PrunePassOptions = {}
): Promise<PrunePassResult> {
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_MB * 1024 * 1024;
  const sink = options.sink ?? null;
  const namespace = options.namespace ?? db.databaseName;
  const now = options.now ?? new Date();
  const shouldStop = options.shouldStop ?? (() => false);
  const collections = options.collections ?? TELEMETRY_COLLECTIONS;
  const dryRun = options.dryRun ?? false;

  const prunedWeeks: PrunedWeekSummary[] = [];
  const errors: string[] = [];
  const recordError = (context: string, err: unknown) => {
    const message = `${context}: ${describeError(err)}`;
    console.error(`[pruner] ${message}`);
    errors.push(message);
  };
  const result = (stoppedEarly: boolean): PrunePassResult => ({
    prunedWeeks,
    errors,
    stoppedEarly,
    dryRun,
  });

  if (sink !== null) {
    if (dryRun) {
      try {
        await sink.checkReady();
        console.log("[pruner] DRY RUN: backup destination is ready.");
      } catch (err) {
        // Keep going: the point of a dry run is the report. The error still
        // makes the run exit non-zero.
        recordError("DRY RUN: backup destination is not ready", err);
      }
    } else {
      try {
        await sink.ensureReady();
      } catch (err) {
        // Without a working sink nothing can be backed up, so nothing can be
        // deleted. Skip the pass rather than failing every week individually.
        recordError("Backup sink is not ready", err);
        return result(false);
      }
    }
  }

  const currentWeek = getIsoWeek(now.getTime());
  const rawCutoffWeek = getIsoWeek(now.getTime() - retentionDays * MS_PER_DAY);
  const ageCutoffMs = Math.min(rawCutoffWeek.startMs, currentWeek.startMs);

  // Phase 1: Age-based pruning across all collections. A week that fails
  // (refused by the never-overwrite rule, unreadable archive, upload error,
  // or leftovers after its delete) is recorded and skipped via `afterId`, so
  // newer expired weeks in the same collection are still pruned. A dry run
  // deletes nothing, so it always advances `afterId`.
  for (const colName of collections) {
    if (shouldStop()) {
      return result(true);
    }
    const collection = db.collection(colName);
    let afterId: ObjectId | undefined = undefined;
    let previousWeekStartMs = -Infinity;
    try {
      while (!shouldStop()) {
        const oldestMs = await findOldestTimestampMs(collection, afterId);
        if (oldestMs === null) {
          break;
        }
        const week = getIsoWeek(oldestMs);
        if (week.endMs > ageCutoffMs) {
          break;
        }
        if (week.startMs <= previousWeekStartMs) {
          recordError(
            `Age-based pruning of ${colName} ${week.label} failed; skipping that week`,
            new Error("week still has documents after pruning")
          );
          afterId = idAtMs(week.endMs);
          continue;
        }
        previousWeekStartMs = week.startMs;
        try {
          const summary = await pruneWeek(
            collection,
            colName,
            namespace,
            week,
            sink,
            "age",
            dryRun
          );
          if (
            summary.deletedDocs > 0 ||
            summary.backedUpDocs > 0 ||
            (dryRun && summary.gzipBytes > 0)
          ) {
            prunedWeeks.push(summary);
          }
        } catch (err) {
          recordError(
            `Age-based pruning of ${colName} ${week.label} failed; skipping that week`,
            err
          );
          afterId = idAtMs(week.endMs);
        }
        if (dryRun) {
          afterId = idAtMs(week.endMs);
        }
      }
    } catch (err) {
      // Failures outside a single week (e.g. the `find` for the oldest doc).
      recordError(`Age-based pruning of ${colName} failed`, err);
    }
  }

  // Phase 2: Storage quota safety valve on ApiCalls
  const minQuotaCutoffMs = getIsoWeek(
    now.getTime() - MIN_QUOTA_RETENTION_DAYS * MS_PER_DAY
  ).startMs;
  const apiCalls = db.collection("ApiCalls");
  let afterId: ObjectId | undefined = undefined;
  try {
    while (!shouldStop()) {
      const stats = await db.stats();
      const usedBytes =
        Number(stats.dataSize ?? 0) + Number(stats.indexSize ?? 0);
      if (usedBytes <= maxBytes) {
        break;
      }
      const oldestMs = await findOldestTimestampMs(apiCalls, afterId);
      if (oldestMs === null) {
        console.warn(
          `[pruner] DB size (${usedBytes} B) exceeds cap (${maxBytes} B), but ApiCalls has no prunable weeks left.`
        );
        break;
      }
      const oldestWeek = getIsoWeek(oldestMs);
      if (oldestWeek.endMs > minQuotaCutoffMs) {
        console.warn(
          `[pruner] DB size (${usedBytes} B) exceeds cap (${maxBytes} B), but ApiCalls has reached the ${MIN_QUOTA_RETENTION_DAYS}-day minimum retention floor; check other collections or databases on the cluster.`
        );
        break;
      }
      if (dryRun) {
        // Nothing is deleted in a dry run, so the size never drops: report
        // the first week quota pruning would take (age-pruned weeks above
        // still count towards `usedBytes` here) and stop.
        console.log(
          `[pruner] DRY RUN: DB size (${usedBytes} B) exceeds cap (${maxBytes} B) before any deletes; quota pruning would start with ApiCalls week ${oldestWeek.label} and continue week by week until under the cap.`
        );
        const summary = await pruneWeek(
          apiCalls,
          "ApiCalls",
          namespace,
          oldestWeek,
          sink,
          "quota",
          true
        );
        if (summary.gzipBytes > 0) {
          prunedWeeks.push(summary);
        }
        break;
      }
      console.warn(
        `[pruner] DB size (${usedBytes} B) exceeds cap (${maxBytes} B); quota-pruning ApiCalls week ${oldestWeek.label}.`
      );
      try {
        const summary = await pruneWeek(
          apiCalls,
          "ApiCalls",
          namespace,
          oldestWeek,
          sink,
          "quota"
        );
        prunedWeeks.push(summary);
        if (summary.deletedDocs === 0) {
          break;
        }
      } catch (err) {
        recordError(
          `Quota pruning of ApiCalls ${oldestWeek.label} failed; skipping that week`,
          err
        );
        afterId = idAtMs(oldestWeek.endMs);
      }
    }
  } catch (err) {
    recordError("Quota check failed", err);
  }

  return result(shouldStop());
}
