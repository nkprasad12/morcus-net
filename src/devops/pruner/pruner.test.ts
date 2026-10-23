import { gunzipSync } from "node:zlib";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Collection, Db, Document, MongoClient, ObjectId } from "mongodb";
import {
  deriveArchiveNamespace,
  getIsoWeek,
  nextIsoWeek,
  runPrunePass,
  validateArchivePrefix,
  weekArchiveKey,
} from "@/devops/pruner/pruner";
import {
  ArchiveInfo,
  ArchiveMeta,
  BackupSink,
  LocalFileBackupSink,
} from "@/devops/pruner/s3_client";

interface FakeDoc extends Document {
  _id: ObjectId | string;
  name: string;
}

interface IdCondition {
  $type?: string;
  $gte?: ObjectId;
  $lt?: ObjectId;
  $lte?: ObjectId;
}

/** BSON sort order: strings sort before ObjectIds. */
function compareIds(a: ObjectId | string, b: ObjectId | string): number {
  const rank = (id: ObjectId | string) => (typeof id === "string" ? 0 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  const ha = typeof a === "string" ? a : a.toHexString();
  const hb = typeof b === "string" ? b : b.toHexString();
  return ha.localeCompare(hb);
}

/**
 * Lightweight in-memory MongoDB `Db` / `Collection` fake supporting the `_id`
 * filters the pruner uses (`$type: "objectId"`, `$gte`, `$lt`, `$lte`),
 * sorting by `{ _id: 1 }`, `deleteMany`, and `db.stats()`.
 */
class FakeMongoDb {
  private readonly cols = new Map<string, FakeDoc[]>();
  public bytesPerDoc = 1024;
  public readonly deleteManyCalls: string[] = [];

  seed(colName: string, docs: FakeDoc[]): void {
    const existing = this.cols.get(colName) ?? [];
    existing.push(...docs);
    existing.sort((a, b) => compareIds(a._id, b._id));
    this.cols.set(colName, existing);
  }

  getDocs(colName: string): FakeDoc[] {
    return [...(this.cols.get(colName) ?? [])];
  }

  names(colName: string): string[] {
    return this.getDocs(colName).map((d) => d.name);
  }

  asDb(): Db {
    return {
      databaseName: "testdb",
      collection: (name: string) => this.asCollection(name),
      stats: async () => {
        let totalDocs = 0;
        for (const docs of this.cols.values()) {
          totalDocs += docs.length;
        }
        return {
          dataSize: totalDocs * this.bytesPerDoc,
          indexSize: 0,
        };
      },
    } as unknown as Db;
  }

  private asCollection(name: string): Collection<Document> {
    const matchFilter = (
      doc: FakeDoc,
      filter: { _id?: IdCondition }
    ): boolean => {
      const cond = filter._id;
      if (!cond) return true;
      const id = doc._id;
      const isObjectId = id instanceof ObjectId;
      if (cond.$type === "objectId" && !isObjectId) return false;
      // Range operators with ObjectId bounds only match ObjectIds.
      const hasRange =
        cond.$gte !== undefined ||
        cond.$lt !== undefined ||
        cond.$lte !== undefined;
      if (hasRange && !isObjectId) return false;
      if (cond.$gte && compareIds(id, cond.$gte) < 0) return false;
      if (cond.$lt && compareIds(id, cond.$lt) >= 0) return false;
      if (cond.$lte && compareIds(id, cond.$lte) > 0) return false;
      return true;
    };

    return {
      find: (filter: { _id?: IdCondition } = {}) => {
        const matched = () =>
          (this.cols.get(name) ?? [])
            .filter((d) => matchFilter(d, filter))
            .sort((a, b) => compareIds(a._id, b._id));

        const cursor = {
          sort: () => cursor,
          limit: (n: number) => ({
            next: async () => matched().slice(0, n)[0] ?? null,
          }),
          [Symbol.asyncIterator]: async function* () {
            for (const doc of matched()) {
              yield doc;
            }
          },
        };
        return cursor;
      },
      deleteMany: async (filter: { _id?: IdCondition }) => {
        this.deleteManyCalls.push(name);
        const list = this.cols.get(name) ?? [];
        const kept = list.filter((d) => !matchFilter(d, filter));
        const deletedCount = list.length - kept.length;
        this.cols.set(name, kept);
        return { acknowledged: true, deletedCount };
      },
    } as unknown as Collection<Document>;
  }
}

/** In-memory `BackupSink` that records archive doc counts by key. */
class MemorySink implements BackupSink {
  readonly archives = new Map<string, number>();
  readonly putKeys: string[] = [];
  onPut: (key: string) => void = () => {};

  async ensureReady(): Promise<void> {}

  async headWeek(key: string): Promise<ArchiveInfo | null> {
    const docCount = this.archives.get(key);
    return docCount === undefined ? null : { docCount };
  }

  async putWeek(key: string, _gz: Buffer, meta: ArchiveMeta): Promise<void> {
    if (this.archives.has(key)) {
      throw new Error(`exists: ${key}`);
    }
    this.putKeys.push(key);
    this.archives.set(key, meta.docCount);
    this.onPut(key);
  }
}

function makeDoc(isoDate: string, name: string): FakeDoc {
  const epochSec = Math.floor(new Date(isoDate).getTime() / 1000);
  return {
    _id: ObjectId.createFromTime(epochSec),
    name,
  };
}

/** Like `makeDoc`, but with a unique non-zero tail so ids at the same second differ. */
function makeDocWithSuffix(
  isoDate: string,
  name: string,
  suffix: number
): FakeDoc {
  const base = makeDoc(isoDate, name)._id as ObjectId;
  const hex =
    base.toHexString().slice(0, 8) + suffix.toString(16).padStart(16, "0");
  return { _id: new ObjectId(hex), name };
}

const NS = "testns";

describe("pruner", () => {
  describe("ISO week helpers", () => {
    it("computes UTC ISO week boundaries accurately across year boundaries", () => {
      // 2025-12-31 is Wednesday of ISO week 2026-W01 (Monday 2025-12-29 .. Monday 2026-01-05)
      const w = getIsoWeek(Date.parse("2025-12-31T15:30:00.000Z"));
      expect(w.year).toBe(2026);
      expect(w.week).toBe(1);
      expect(w.label).toBe("2026-W01");
      expect(new Date(w.startMs).toISOString()).toBe(
        "2025-12-29T00:00:00.000Z"
      );
      expect(new Date(w.endMs).toISOString()).toBe("2026-01-05T00:00:00.000Z");
      expect(getIsoWeek(Date.parse("2025-12-29T00:00:00.000Z")).label).toBe(
        "2026-W01"
      );

      const next = nextIsoWeek(w);
      expect(next.label).toBe("2026-W02");
      expect(weekArchiveKey(NS, "ApiCalls", w)).toBe(
        "testns/ApiCalls/2026/ApiCalls-2026-W01.jsonl.gz"
      );
    });

    it("handles 53-week ISO years", () => {
      const lastDay = getIsoWeek(Date.parse("2026-12-31T12:00:00.000Z"));
      expect(lastDay.label).toBe("2026-W53");
      const newYear = getIsoWeek(Date.parse("2027-01-01T12:00:00.000Z"));
      expect(newYear.label).toBe("2026-W53");
      expect(newYear.year).toBe(2026);
      expect(nextIsoWeek(newYear).label).toBe("2027-W01");
    });
  });

  describe("deriveArchiveNamespace", () => {
    it("uses the SRV host and default db name", () => {
      const client = new MongoClient(
        "mongodb+srv://u:p@Cluster0.ABC.mongodb.net/?retryWrites=true"
      );
      expect(deriveArchiveNamespace(client)).toBe(
        "cluster0.abc.mongodb.net-test"
      );
    });

    it("uses the first host without its port for multi-host URIs", () => {
      const client = new MongoClient(
        "mongodb://h1.example.com:27017,h2.example.com:27018/morcus"
      );
      expect(deriveArchiveNamespace(client)).toBe("h1.example.com-morcus");
    });

    it("sanitizes IPv6 hosts", () => {
      const client = new MongoClient("mongodb://[::1]:27017");
      expect(deriveArchiveNamespace(client)).toBe("__1-test");
    });

    it("prefers a valid PRUNE_ARCHIVE_PREFIX override", () => {
      const client = new MongoClient("mongodb://localhost/morcus");
      expect(deriveArchiveNamespace(client, "  prod-archive ")).toBe(
        "prod-archive"
      );
      expect(deriveArchiveNamespace(client, "")).toBe("localhost-morcus");
    });

    it("rejects unsafe prefixes", () => {
      expect(() => validateArchivePrefix("a/b")).toThrow(
        /PRUNE_ARCHIVE_PREFIX/
      );
      expect(() => validateArchivePrefix("..")).toThrow(/PRUNE_ARCHIVE_PREFIX/);
      expect(() => validateArchivePrefix("has space")).toThrow(
        /PRUNE_ARCHIVE_PREFIX/
      );
      expect(validateArchivePrefix("ok.name_1-2")).toBe("ok.name_1-2");
    });
  });

  describe("runPrunePass", () => {
    const NOW = new Date("2026-10-21T12:00:00.000Z"); // 2026-W43
    // > 100 days before NOW: 2026-06-03 (2026-W23, ~140 days old)
    const OLD_WEEK_DATE = "2026-06-03T10:00:00.000Z";
    // < 100 days before NOW: 2026-09-16 (2026-W38, ~35 days old)
    const RECENT_WEEK_DATE = "2026-09-16T10:00:00.000Z";
    // < 14 days before NOW: 2026-10-14 (2026-W42)
    const LAST_WEEK_DATE = "2026-10-14T10:00:00.000Z";
    // Current week (2026-W43)
    const CURRENT_WEEK_DATE = "2026-10-20T10:00:00.000Z";

    it("prunes >100d weeks without backup in prune-only mode", async () => {
      const fakeDb = new FakeMongoDb();
      fakeDb.seed("ApiCalls", [
        makeDoc(OLD_WEEK_DATE, "/dicts-old-1"),
        makeDoc("2026-06-04T10:00:00.000Z", "/dicts-old-2"),
        makeDoc(RECENT_WEEK_DATE, "/dicts-recent"),
        makeDoc(CURRENT_WEEK_DATE, "/dicts-current"),
      ]);

      const res = await runPrunePass(fakeDb.asDb(), {
        now: NOW,
        retentionDays: 100,
        sink: null,
      });

      expect(res.stoppedEarly).toBe(false);
      expect(res.errors).toEqual([]);
      expect(res.prunedWeeks).toEqual([
        {
          collection: "ApiCalls",
          week: "2026-W23",
          backedUpDocs: 0,
          deletedDocs: 2,
          reason: "age",
        },
      ]);
      expect(fakeDb.names("ApiCalls")).toEqual([
        "/dicts-recent",
        "/dicts-current",
      ]);
    });

    it("jumps straight to the next oldest document instead of walking empty weeks", async () => {
      const fakeDb = new FakeMongoDb();
      fakeDb.seed("ApiCalls", [
        makeDoc("2020-01-08T10:00:00.000Z", "/ancient"),
        makeDoc(OLD_WEEK_DATE, "/old"),
      ]);

      const res = await runPrunePass(fakeDb.asDb(), {
        now: NOW,
        sink: null,
        collections: ["ApiCalls"],
      });

      expect(res.prunedWeeks.map((w) => w.week)).toEqual([
        "2020-W02",
        "2026-W23",
      ]);
      // One delete per non-empty week, not one per week since 2020.
      expect(fakeDb.deleteManyCalls).toHaveLength(2);
    });

    it("ignores documents with non-ObjectId _ids", async () => {
      const fakeDb = new FakeMongoDb();
      fakeDb.seed("ApiCalls", [
        { _id: "manual-string-id", name: "/manual" },
        makeDoc(OLD_WEEK_DATE, "/old"),
        makeDoc(RECENT_WEEK_DATE, "/recent"),
      ]);

      const res = await runPrunePass(fakeDb.asDb(), { now: NOW, sink: null });

      expect(res.errors).toEqual([]);
      expect(fakeDb.names("ApiCalls")).toEqual(["/manual", "/recent"]);
    });

    it("backs up expired weeks to LocalFileBackupSink as valid .jsonl.gz before deleting", async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), "morcus-pruner-test-"));
      try {
        const sink = new LocalFileBackupSink(tmpDir, { requireMount: false });
        const fakeDb = new FakeMongoDb();
        fakeDb.seed("ApiCalls", [
          makeDoc(OLD_WEEK_DATE, "/dicts-old-1"),
          makeDoc("2026-06-04T10:00:00.000Z", "/dicts-old-2"),
          makeDoc(RECENT_WEEK_DATE, "/dicts-recent"),
        ]);

        const res = await runPrunePass(fakeDb.asDb(), {
          now: NOW,
          retentionDays: 100,
          sink,
          namespace: NS,
        });

        expect(res.errors).toEqual([]);
        expect(res.prunedWeeks).toHaveLength(1);
        expect(res.prunedWeeks[0]).toMatchObject({
          collection: "ApiCalls",
          week: "2026-W23",
          backedUpDocs: 2,
          deletedDocs: 2,
          reason: "age",
        });

        const gzPath = join(
          tmpDir,
          "testns/ApiCalls/2026/ApiCalls-2026-W23.jsonl.gz"
        );
        const lines = gunzipSync(await readFile(gzPath))
          .toString("utf8")
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l));
        expect(lines.map((l) => l.name)).toEqual([
          "/dicts-old-1",
          "/dicts-old-2",
        ]);
        expect(fakeDb.names("ApiCalls")).toEqual(["/dicts-recent"]);
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("keeps an existing fuller archive on crash recovery and finishes the delete", async () => {
      const sink = new MemorySink();
      // A previous run archived all 5 docs of W23, then was killed
      // mid-deleteMany with 2 docs remaining in Mongo.
      sink.archives.set("testns/ApiCalls/2026/ApiCalls-2026-W23.jsonl.gz", 5);

      const fakeDb = new FakeMongoDb();
      fakeDb.seed("ApiCalls", [
        makeDoc(OLD_WEEK_DATE, "/dicts-rem-1"),
        makeDoc("2026-06-04T10:00:00.000Z", "/dicts-rem-2"),
      ]);

      const res = await runPrunePass(fakeDb.asDb(), {
        now: NOW,
        sink,
        namespace: NS,
      });

      expect(res.errors).toEqual([]);
      expect(sink.putKeys).toEqual([]);
      expect(res.prunedWeeks[0]?.deletedDocs).toBe(2);
      expect(fakeDb.getDocs("ApiCalls")).toHaveLength(0);
    });

    it("refuses to overwrite or delete when an existing archive has fewer docs, but continues with other collections", async () => {
      const sink = new MemorySink();
      sink.archives.set("testns/ApiCalls/2026/ApiCalls-2026-W23.jsonl.gz", 1);

      const fakeDb = new FakeMongoDb();
      fakeDb.seed("ApiCalls", [
        makeDoc(OLD_WEEK_DATE, "/a1"),
        makeDoc("2026-06-04T10:00:00.000Z", "/a2"),
      ]);
      fakeDb.seed("ServerHealth", [makeDoc(OLD_WEEK_DATE, "/health")]);

      const res = await runPrunePass(fakeDb.asDb(), {
        now: NOW,
        sink,
        namespace: NS,
      });

      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toMatch(/ApiCalls.*fewer docs \(1\).*\(2\)/);
      expect(
        sink.archives.get("testns/ApiCalls/2026/ApiCalls-2026-W23.jsonl.gz")
      ).toBe(1);
      expect(fakeDb.names("ApiCalls")).toEqual(["/a1", "/a2"]);
      // ServerHealth was still pruned.
      expect(fakeDb.getDocs("ServerHealth")).toHaveLength(0);
      expect(sink.putKeys).toEqual([
        "testns/ServerHealth/2026/ServerHealth-2026-W23.jsonl.gz",
      ]);
    });

    it("does not delete from Mongo if the backup upload fails", async () => {
      const failingSink: BackupSink = {
        ensureReady: async () => {},
        headWeek: async () => null,
        putWeek: async () => {
          throw new Error("S3 503 SlowDown");
        },
      };

      const fakeDb = new FakeMongoDb();
      fakeDb.seed("ApiCalls", [makeDoc(OLD_WEEK_DATE, "/dicts-old-1")]);

      const res = await runPrunePass(fakeDb.asDb(), {
        now: NOW,
        sink: failingSink,
      });

      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toMatch(/S3 503 SlowDown/);
      expect(fakeDb.getDocs("ApiCalls")).toHaveLength(1);
    });

    it("skips the pass without deleting anything if the sink is not ready", async () => {
      const sink = new MemorySink();
      sink.ensureReady = async () => {
        throw new Error("EACCES");
      };
      const fakeDb = new FakeMongoDb();
      fakeDb.seed("ApiCalls", [makeDoc(OLD_WEEK_DATE, "/old")]);

      const res = await runPrunePass(fakeDb.asDb(), { now: NOW, sink });

      expect(res.errors).toEqual(["Backup sink is not ready: EACCES"]);
      expect(fakeDb.getDocs("ApiCalls")).toHaveLength(1);
    });

    it("never deletes documents newer than the last exported _id", async () => {
      const fakeDb = new FakeMongoDb();
      fakeDb.seed("ApiCalls", [
        makeDocWithSuffix(OLD_WEEK_DATE, "/exported", 1),
      ]);
      const sink = new MemorySink();
      // Simulate a document landing in the same week between export and
      // delete (e.g. clock skew on the writer).
      sink.onPut = () =>
        fakeDb.seed("ApiCalls", [
          makeDocWithSuffix("2026-06-05T10:00:00.000Z", "/late", 2),
        ]);

      const res = await runPrunePass(fakeDb.asDb(), {
        now: NOW,
        sink,
        namespace: NS,
        collections: ["ApiCalls"],
      });

      expect(res.prunedWeeks[0]).toMatchObject({
        backedUpDocs: 1,
        deletedDocs: 1,
      });
      expect(fakeDb.names("ApiCalls")).toEqual(["/late"]);
      // The leftover is flagged (and its week skipped) instead of looping or
      // overwriting the archive.
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toMatch(
        /2026-W23 failed; skipping that week: week still has documents/
      );
    });

    it("skips a refused week in age-based pruning and still prunes newer expired weeks", async () => {
      const sink = new MemorySink();
      // W21 has 2 docs in Mongo but a 1-doc archive: refused.
      sink.archives.set("testns/ApiCalls/2026/ApiCalls-2026-W21.jsonl.gz", 1);
      const fakeDb = new FakeMongoDb();
      fakeDb.seed("ApiCalls", [
        makeDoc("2026-05-20T10:00:00.000Z", "/w21-a"),
        makeDoc("2026-05-21T10:00:00.000Z", "/w21-b"),
        makeDoc(OLD_WEEK_DATE, "/w23"),
        makeDoc(RECENT_WEEK_DATE, "/recent"),
      ]);

      const res = await runPrunePass(fakeDb.asDb(), {
        now: NOW,
        sink,
        namespace: NS,
        collections: ["ApiCalls"],
      });

      expect(res.errors).toHaveLength(1);
      expect(res.errors[0]).toMatch(/ApiCalls 2026-W21 failed; skipping/);
      expect(res.prunedWeeks.map((w) => w.week)).toEqual(["2026-W23"]);
      expect(fakeDb.names("ApiCalls")).toEqual(["/w21-a", "/w21-b", "/recent"]);
    });

    it("enforces the quota safety valve but never prunes inside the 14-day floor", async () => {
      const fakeDb = new FakeMongoDb();
      fakeDb.bytesPerDoc = 1000;
      fakeDb.seed("ApiCalls", [
        makeDoc(RECENT_WEEK_DATE, "/recent"),
        makeDoc(LAST_WEEK_DATE, "/last-week"),
        makeDoc(CURRENT_WEEK_DATE, "/current"),
      ]);
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

      try {
        const res = await runPrunePass(fakeDb.asDb(), {
          now: NOW,
          maxBytes: 500,
          sink: null,
        });

        expect(res.errors).toEqual([]);
        expect(res.prunedWeeks).toEqual([
          {
            collection: "ApiCalls",
            week: "2026-W38",
            backedUpDocs: 0,
            deletedDocs: 1,
            reason: "quota",
          },
        ]);
        expect(fakeDb.names("ApiCalls")).toEqual(["/last-week", "/current"]);
        expect(warn).toHaveBeenCalledWith(
          expect.stringMatching(/14-day minimum retention floor/)
        );
      } finally {
        warn.mockRestore();
      }
    });

    it("skips a refused ApiCalls week in the quota phase and keeps relieving pressure", async () => {
      const sink = new MemorySink();
      // W38 has 2 docs in Mongo but a 1-doc archive: refused.
      sink.archives.set("testns/ApiCalls/2026/ApiCalls-2026-W38.jsonl.gz", 1);
      const fakeDb = new FakeMongoDb();
      fakeDb.bytesPerDoc = 1000;
      fakeDb.seed("ApiCalls", [
        makeDoc(RECENT_WEEK_DATE, "/w38-a"),
        makeDoc("2026-09-17T10:00:00.000Z", "/w38-b"),
        makeDoc("2026-09-23T10:00:00.000Z", "/w39"),
        makeDoc(CURRENT_WEEK_DATE, "/current"),
      ]);
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const error = jest.spyOn(console, "error").mockImplementation(() => {});

      try {
        const res = await runPrunePass(fakeDb.asDb(), {
          now: NOW,
          maxBytes: 3000,
          sink,
          namespace: NS,
        });

        expect(res.errors).toHaveLength(1);
        expect(res.errors[0]).toMatch(/2026-W38 failed; skipping that week/);
        expect(res.prunedWeeks.map((w) => w.week)).toEqual(["2026-W39"]);
        expect(fakeDb.names("ApiCalls")).toEqual([
          "/w38-a",
          "/w38-b",
          "/current",
        ]);
      } finally {
        warn.mockRestore();
        error.mockRestore();
      }
    });

    it("stops cleanly between weeks when shouldStop() returns true", async () => {
      const fakeDb = new FakeMongoDb();
      fakeDb.seed("ApiCalls", [
        makeDoc("2026-05-20T10:00:00.000Z", "/w21"),
        makeDoc("2026-06-03T10:00:00.000Z", "/w23"),
      ]);

      let calls = 0;
      const res = await runPrunePass(fakeDb.asDb(), {
        now: NOW,
        retentionDays: 100,
        sink: null,
        // Allow the first week (W21) to run, then signal stop before W23.
        shouldStop: () => ++calls > 2,
      });

      expect(res.stoppedEarly).toBe(true);
      expect(res.prunedWeeks).toHaveLength(1);
      expect(res.prunedWeeks[0]?.week).toBe("2026-W21");
      // W23 is untouched and will be handled on the next startup
      expect(fakeDb.names("ApiCalls")).toEqual(["/w23"]);
    });
  });
});
