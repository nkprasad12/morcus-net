import http from "node:http";
import { gzipSync } from "node:zlib";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_S3_BUCKET,
  findMountForPath,
  LocalFileBackupSink,
  parseBackupUri,
  S3BackupSink,
  signS3Request,
} from "@/devops/pruner/s3_client";

const META = {
  docCount: 0,
  weekStart: "2026-01-26T00:00:00.000Z",
  weekEnd: "2026-02-02T00:00:00.000Z",
};

function gzLines(n: number): Buffer {
  const lines = Array.from({ length: n }, (_, i) => `{"i":${i}}\n`).join("");
  return gzipSync(Buffer.from(lines));
}

describe("s3_client", () => {
  describe("parseBackupUri", () => {
    it("returns null when unset or whitespace", () => {
      expect(parseBackupUri(undefined)).toBeNull();
      expect(parseBackupUri("")).toBeNull();
      expect(parseBackupUri("   ")).toBeNull();
    });

    it("parses S3/R2 URI with default bucket morcus-telemetry", () => {
      const sink = parseBackupUri(
        "https://myKeyId:mySecretKey@acct123.r2.cloudflarestorage.com"
      );
      expect(sink).toBeInstanceOf(S3BackupSink);
      const s3 = sink as S3BackupSink;
      expect(s3.endpoint).toBe("https://acct123.r2.cloudflarestorage.com");
      expect(s3.bucket).toBe(DEFAULT_S3_BUCKET);
    });

    it("parses S3/R2 URI with explicit bucket name", () => {
      const sink = parseBackupUri(
        "https://myKeyId:mySecret%2FKey@acct123.r2.cloudflarestorage.com/custom-bucket?region=us-east-1"
      );
      expect(sink).toBeInstanceOf(S3BackupSink);
      const s3 = sink as S3BackupSink;
      expect(s3.bucket).toBe("custom-bucket");
    });

    it("rejects S3/R2 URI missing credentials or with nested bucket path, without echoing secrets", () => {
      expect(() =>
        parseBackupUri("https://acct123.r2.cloudflarestorage.com")
      ).toThrow(/must include credentials/);
      expect(() =>
        parseBackupUri(
          "https://key:supersecret@acct123.r2.cloudflarestorage.com/a/b"
        )
      ).toThrow(/single bucket name/);
      expect(() => parseBackupUri("https://key:%E0%A4%A@host")).toThrow(
        /percent-encoding/
      );
      expect(() => parseBackupUri("ftp://example.com/archive")).toThrow(
        /Unsupported scheme/
      );
      expect(() => parseBackupUri("s3://bucket")).toThrow(/Unsupported scheme/);
      try {
        parseBackupUri("https://key:supersecret@host/a/b");
      } catch (err) {
        expect(String(err)).not.toContain("supersecret");
      }
    });

    it("parses absolute local directory and file:/// URIs into LocalFileBackupSink", () => {
      const local1 = parseBackupUri("/tmp/morcus-archives");
      expect(local1).toBeInstanceOf(LocalFileBackupSink);
      expect((local1 as LocalFileBackupSink).baseDir).toBe(
        "/tmp/morcus-archives"
      );

      const local2 = parseBackupUri("file:///tmp/morcus-archives");
      expect(local2).toBeInstanceOf(LocalFileBackupSink);
      expect((local2 as LocalFileBackupSink).baseDir).toBe(
        "/tmp/morcus-archives"
      );
    });

    it("rejects relative paths, file:// URLs with a host, and /", () => {
      for (const bad of ["none", "false", "backups", "./archives"]) {
        expect(() => parseBackupUri(bad)).toThrow(/must be absolute/);
      }
      expect(() => parseBackupUri("file://backups")).toThrow(/empty host/);
      expect(() => parseBackupUri("file://relative/x")).toThrow(/empty host/);
      expect(() => parseBackupUri("/")).toThrow(/root/);
      expect(() => parseBackupUri("/morcus/..")).toThrow(/root/);
      expect(() => parseBackupUri("file:///")).toThrow(/root/);
    });
  });

  describe("signS3Request", () => {
    it("produces deterministic AWS4-HMAC-SHA256 headers", () => {
      const signed = signS3Request({
        method: "PUT",
        endpoint: "https://acct.r2.cloudflarestorage.com",
        path: "/morcus-telemetry/ApiCalls/2026/ApiCalls-2026-W01.jsonl.gz",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region: "auto",
        body: Buffer.from("hello"),
        extraHeaders: { "x-amz-meta-doc-count": "42" },
        now: new Date("2026-01-15T12:00:00.000Z"),
      });

      expect(signed.url).toBe(
        "https://acct.r2.cloudflarestorage.com/morcus-telemetry/ApiCalls/2026/ApiCalls-2026-W01.jsonl.gz"
      );
      expect(signed.headers["x-amz-date"]).toBe("20260115T120000Z");
      expect(signed.headers["x-amz-meta-doc-count"]).toBe("42");
      expect(signed.headers.Authorization).toMatch(
        /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20260115\/auto\/s3\/aws4_request, SignedHeaders=x-amz-content-sha256;x-amz-date;x-amz-meta-doc-count;host|host;x-amz-content-sha256;x-amz-date;x-amz-meta-doc-count, Signature=[0-9a-f]{64}$/
      );
    });
  });

  describe("findMountForPath", () => {
    const MOUNTINFO = [
      "100 90 0:50 / / rw,relatime master:1 - overlay overlay rw,lowerdir=/x",
      "101 100 0:51 / /proc rw,nosuid - proc proc rw",
      "102 100 8:1 /var/log/morcus /morcus/logs rw,relatime - ext4 /dev/sda1 rw",
      "103 100 8:1 /a\\040b /mnt/with\\040space rw - ext4 /dev/sda1 rw",
      "104 100 0:52 / /dev/shm rw - tmpfs shm rw",
    ].join("\n");

    it("returns the longest containing mount", () => {
      expect(findMountForPath(MOUNTINFO, "/morcus/logs/archives")).toEqual({
        mountPoint: "/morcus/logs",
        fsType: "ext4",
      });
      expect(findMountForPath(MOUNTINFO, "/morcus/logsx")).toEqual({
        mountPoint: "/",
        fsType: "overlay",
      });
      expect(findMountForPath(MOUNTINFO, "/mnt/with space/x")).toEqual({
        mountPoint: "/mnt/with space",
        fsType: "ext4",
      });
      expect(findMountForPath(MOUNTINFO, "/dev/shm/a")?.fsType).toBe("tmpfs");
    });
  });

  describe("LocalFileBackupSink", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await realpath(
        await mkdtemp(join(tmpdir(), "morcus-local-sink-"))
      );
    });

    afterEach(async () => {
      await chmod(tmpDir, 0o755).catch(() => {});
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("stores a single file per week and reads its doc count back by streaming gunzip", async () => {
      const sink = new LocalFileBackupSink(tmpDir, { requireMount: false });
      await sink.ensureReady();

      const key = "ns/ApiCalls/2026/ApiCalls-2026-W05.jsonl.gz";
      expect(await sink.headWeek(key)).toBeNull();

      await sink.putWeek(key, gzLines(123), { ...META, docCount: 123 });

      expect(await sink.headWeek(key)).toEqual({ docCount: 123 });
      expect(await readdir(join(tmpDir, "ns/ApiCalls/2026"))).toEqual([
        "ApiCalls-2026-W05.jsonl.gz",
      ]);
    });

    it("never overwrites an existing archive", async () => {
      const sink = new LocalFileBackupSink(tmpDir, { requireMount: false });
      const key = "ns/ApiCalls/2026/ApiCalls-2026-W05.jsonl.gz";
      await sink.putWeek(key, gzLines(3), { ...META, docCount: 3 });

      await expect(
        sink.putWeek(key, gzLines(5), { ...META, docCount: 5 })
      ).rejects.toThrow(/already exists/);
      expect(await sink.headWeek(key)).toEqual({ docCount: 3 });
      // No temp files left behind.
      expect(await readdir(join(tmpDir, "ns/ApiCalls/2026"))).toEqual([
        "ApiCalls-2026-W05.jsonl.gz",
      ]);
    });

    it("throws (rather than returning null) for corrupt, truncated, or empty archives", async () => {
      const sink = new LocalFileBackupSink(tmpDir, { requireMount: false });
      await mkdir(join(tmpDir, "ns"), { recursive: true });

      await writeFile(join(tmpDir, "ns/corrupt.jsonl.gz"), "not gzip");
      await expect(sink.headWeek("ns/corrupt.jsonl.gz")).rejects.toThrow(
        /unreadable or corrupt/
      );

      const full = gzLines(1000);
      await writeFile(
        join(tmpDir, "ns/truncated.jsonl.gz"),
        full.subarray(0, full.length - 10)
      );
      await expect(sink.headWeek("ns/truncated.jsonl.gz")).rejects.toThrow(
        /unreadable or corrupt/
      );

      await writeFile(join(tmpDir, "ns/empty.jsonl.gz"), gzipSync(""));
      await expect(sink.headWeek("ns/empty.jsonl.gz")).rejects.toThrow(
        /contains no documents/
      );
    });

    it("removes stale temp files on ensureReady", async () => {
      await mkdir(join(tmpDir, "ns/ApiCalls/2026"), { recursive: true });
      const stale = join(tmpDir, "ns/ApiCalls/2026/.tmp-1-2-abc");
      await writeFile(stale, "partial");
      const log = jest.spyOn(console, "log").mockImplementation(() => {});
      try {
        await new LocalFileBackupSink(tmpDir, {
          requireMount: false,
        }).ensureReady();
      } finally {
        log.mockRestore();
      }
      expect(await readdir(join(tmpDir, "ns/ApiCalls/2026"))).toEqual([]);
    });

    it("refuses directories that are not on a persistent mounted volume", async () => {
      const mountInfoPath = join(tmpDir, "mountinfo");
      const archiveDir = join(tmpDir, "archives");

      await writeFile(
        mountInfoPath,
        "1 0 0:1 / / rw - overlay overlay rw\n2 1 0:2 / /proc rw - proc proc rw\n"
      );
      const unmounted = new LocalFileBackupSink(archiveDir, {
        requireMount: true,
        mountInfoPath,
      });
      await expect(unmounted.ensureReady()).rejects.toThrow(
        /not on a persistent mounted volume/
      );

      await writeFile(
        mountInfoPath,
        `1 0 0:1 / / rw - overlay overlay rw\n2 1 8:1 /x ${tmpDir} rw - ext4 /dev/sda1 rw\n`
      );
      const mounted = new LocalFileBackupSink(archiveDir, {
        requireMount: true,
        mountInfoPath,
      });
      await expect(mounted.ensureReady()).resolves.toBeUndefined();

      await writeFile(
        mountInfoPath,
        `1 0 0:1 / / rw - overlay overlay rw\n2 1 0:3 / ${tmpDir} rw - tmpfs tmpfs rw\n`
      );
      await expect(
        new LocalFileBackupSink(archiveDir, {
          requireMount: true,
          mountInfoPath,
        }).ensureReady()
      ).rejects.toThrow(/tmpfs/);

      // A bind mount whose source is overlay (e.g. Docker-in-Docker) is fine.
      await writeFile(
        mountInfoPath,
        `1 0 0:1 / / rw - overlay overlay rw\n2 1 0:4 /x ${tmpDir} rw - overlay overlay rw\n`
      );
      await expect(
        new LocalFileBackupSink(archiveDir, {
          requireMount: true,
          mountInfoPath,
        }).ensureReady()
      ).resolves.toBeUndefined();
    });

    it("skips unreadable subdirectories like lost+found when cleaning temp files", async () => {
      if (process.getuid?.() === 0) {
        return; // root bypasses permission checks
      }
      const lostFound = join(tmpDir, "lost+found");
      await mkdir(lostFound);
      await chmod(lostFound, 0o000);
      await mkdir(join(tmpDir, "ns/ApiCalls/2026"), { recursive: true });
      await writeFile(join(tmpDir, "ns/ApiCalls/2026/.tmp-9-9-x"), "partial");
      const log = jest.spyOn(console, "log").mockImplementation(() => {});
      try {
        await expect(
          new LocalFileBackupSink(tmpDir, { requireMount: false }).ensureReady()
        ).resolves.toBeUndefined();
      } finally {
        log.mockRestore();
        await chmod(lostFound, 0o755);
      }
      expect(await readdir(join(tmpDir, "ns/ApiCalls/2026"))).toEqual([]);
    });

    it("explains how to fix ownership when the directory is not writable", async () => {
      if (process.getuid?.() === 0) {
        return; // root bypasses permission checks
      }
      await chmod(tmpDir, 0o555);
      const sink = new LocalFileBackupSink(join(tmpDir, "archives"), {
        requireMount: false,
      });
      await expect(sink.ensureReady()).rejects.toThrow(
        /EACCES.*sudo install -d -o 1000 -g 1000/
      );
    });

    it("rejects path traversal keys", async () => {
      const sink = new LocalFileBackupSink(tmpDir, { requireMount: false });
      await expect(sink.headWeek("../../etc/passwd")).rejects.toThrow(
        /Invalid archive key path/
      );
    });
  });

  describe("S3BackupSink (against in-process S3 HTTP stub)", () => {
    let server: http.Server;
    let baseUrl: string;
    let bucketHeadStatus: number | null = null;
    const buckets = new Set<string>();
    const objects = new Map<
      string,
      { body: Buffer; headers: http.IncomingHttpHeaders }
    >();
    let logSpy: jest.SpyInstance;

    beforeEach(async () => {
      bucketHeadStatus = null;
      buckets.clear();
      objects.clear();
      logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      server = http.createServer((req, res) => {
        const auth = req.headers.authorization ?? "";
        if (!auth.startsWith("AWS4-HMAC-SHA256 ")) {
          res.statusCode = 403;
          res.end("Missing SigV4 auth");
          return;
        }
        const urlPath = (req.url ?? "/").replace(/^\/+/, "");
        const slashIdx = urlPath.indexOf("/");
        const bucket = slashIdx === -1 ? urlPath : urlPath.slice(0, slashIdx);
        const key = slashIdx === -1 ? "" : urlPath.slice(slashIdx + 1);

        if (key === "") {
          if (req.method === "HEAD") {
            res.statusCode =
              bucketHeadStatus ?? (buckets.has(bucket) ? 200 : 404);
            res.end();
            return;
          }
          if (req.method === "PUT") {
            buckets.add(bucket);
            res.statusCode = 200;
            res.end();
            return;
          }
        }

        const objId = `${bucket}/${key}`;
        if (req.method === "HEAD") {
          const found = objects.get(objId);
          if (!found) {
            res.statusCode = 404;
            res.end();
            return;
          }
          for (const [k, v] of Object.entries(found.headers)) {
            if (k.startsWith("x-amz-meta-") && typeof v === "string") {
              res.setHeader(k, v);
            }
          }
          res.setHeader("Content-Length", String(found.body.length));
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method === "PUT") {
          if (req.headers["if-none-match"] === "*" && objects.has(objId)) {
            res.statusCode = 412;
            res.end("PreconditionFailed");
            return;
          }
          const chunks: Buffer[] = [];
          req.on("data", (c: Buffer) => chunks.push(c));
          req.on("end", () => {
            objects.set(objId, {
              body: Buffer.concat(chunks),
              headers: req.headers,
            });
            res.statusCode = 200;
            res.end();
          });
          return;
        }

        res.statusCode = 405;
        res.end();
      });

      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      });
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      baseUrl = `http://testKey:testSecret@127.0.0.1:${port}`;
    });

    afterEach(async () => {
      logSpy.mockRestore();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("auto-creates default bucket morcus-telemetry on ensureReady and uploads/reads weeks", async () => {
      const sink = parseBackupUri(baseUrl)!;
      expect(buckets.has(DEFAULT_S3_BUCKET)).toBe(false);

      await sink.ensureReady();
      expect(buckets.has(DEFAULT_S3_BUCKET)).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Created bucket 'morcus-telemetry'/)
      );

      // Second ensureReady sees 200 OK on HEAD /morcus-telemetry
      await sink.ensureReady();

      const key = "ns/ApiCalls/2026/ApiCalls-2026-W10.jsonl.gz";
      expect(await sink.headWeek(key)).toBeNull();

      const body = Buffer.from("compressed-payload");
      await sink.putWeek(key, body, { ...META, docCount: 77 });

      expect(await sink.headWeek(key)).toEqual({ docCount: 77 });
      expect(objects.get(`${DEFAULT_S3_BUCKET}/${key}`)?.body).toEqual(body);
    });

    it("never overwrites an existing object", async () => {
      const sink = parseBackupUri(baseUrl)!;
      const key = "ns/ApiCalls/2026/ApiCalls-2026-W10.jsonl.gz";
      await sink.putWeek(key, Buffer.from("first"), { ...META, docCount: 3 });
      await expect(
        sink.putWeek(key, Buffer.from("second"), { ...META, docCount: 5 })
      ).rejects.toThrow(/HTTP 412/);
      expect(await sink.headWeek(key)).toEqual({ docCount: 3 });
    });

    it("refuses to trust objects without a valid doc count", async () => {
      const sink = parseBackupUri(baseUrl)!;
      objects.set(`${DEFAULT_S3_BUCKET}/ns/foreign.jsonl.gz`, {
        body: Buffer.from("x"),
        headers: {},
      });
      await expect(sink.headWeek("ns/foreign.jsonl.gz")).rejects.toThrow(
        /no valid x-amz-meta-doc-count/
      );
    });

    it("continues when HEAD bucket returns 403 (object-scoped token)", async () => {
      bucketHeadStatus = 403;
      const sink = parseBackupUri(baseUrl)!;
      await expect(sink.ensureReady()).resolves.toBeUndefined();
      expect(buckets.size).toBe(0);
    });
  });
});
