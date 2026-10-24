import { createHash, createHmac } from "node:crypto";
import {
  constants as fsConstants,
  createReadStream,
  Dirent,
  existsSync,
} from "node:fs";
import {
  access,
  link,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

export const DEFAULT_S3_BUCKET = "morcus-telemetry";
/**
 * Where archives go when `PRUNE_BACKUP_URI` is blank: `$LOGS_DIR/archives` on
 * the host (see `src/devops/docker-compose.yaml`). The same default applies
 * under `docker run` and in the smoke test, so the three never disagree.
 */
export const DEFAULT_BACKUP_DIR = "/morcus/logs/archives";
/** The only value of `PRUNE_BACKUP_URI` that means "delete without backup". */
export const NO_BACKUP_VALUE = "none";

/** Host command printed when the pruner (UID 1000) can't write locally. */
export const LOCAL_SINK_SETUP_COMMAND =
  'sudo install -d -o 1000 -g 1000 "$LOGS_DIR/archives"';

const TMP_FILE_PREFIX = ".tmp-";
const WRITE_PROBE_NAME = ".write-probe";
/**
 * `.tmp-*` files younger than this are left alone: they may belong to another
 * pruner instance that is still writing (e.g. `docker compose run --rm pruner
 * --once` next to the daemon). A single week never takes anywhere near this
 * long to write.
 */
export const STALE_TMP_FILE_AGE_MS = 60 * 60 * 1000;

function log(msg: string): void {
  console.log(`[pruner] ${msg}`);
}

export interface ArchiveMeta {
  readonly docCount: number;
  /** Hex `_id` of the last (greatest) document in the archive. */
  readonly lastId: string;
  readonly weekStart: string;
  readonly weekEnd: string;
}

/** What a sink can report about an archive that already exists. */
export interface ArchiveInfo {
  readonly docCount: number;
  /**
   * Hex `_id` of the last document in the archive, when the sink can tell
   * (archives written before this field existed have none).
   */
  readonly lastId?: string;
}

export interface BackupSink {
  /**
   * Validates that the destination is usable (bucket exists / directory is
   * persistent and writable). Throws with an actionable message otherwise.
   * May create the destination (default bucket, local directory).
   */
  ensureReady(): Promise<void>;
  /**
   * Like `ensureReady`, but changes nothing: no bucket creation, no
   * `mkdir`, no write probe, no temp-file cleanup. Used by `--dry-run` to
   * report whether the destination is ready without touching it.
   */
  checkReady(): Promise<void>;
  /**
   * Returns the document count (and, if known, last `_id`) of an already-
   * backed-up week if it exists, or `null` if no archive exists for `key`.
   * Throws if an archive exists but is unreadable, empty, or otherwise can't
   * be trusted; callers must treat that as "refuse to overwrite or delete".
   */
  headWeek(key: string): Promise<ArchiveInfo | null>;
  /**
   * Writes a gzipped `.jsonl.gz` week archive. Must never overwrite an
   * existing archive.
   */
  putWeek(key: string, gzData: Buffer, meta: ArchiveMeta): Promise<void>;
}

export interface S3SinkConfig {
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region?: string;
  /**
   * Whether `ensureReady` may create the bucket if it doesn't exist. Only
   * the default bucket (`DEFAULT_S3_BUCKET`) is auto-created: a bucket named
   * explicitly in `PRUNE_BACKUP_URI` must already exist, so a typo can't
   * quietly send archives to a fresh bucket.
   */
  readonly autoCreateBucket?: boolean;
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function encodeUriPath(path: string): string {
  return path
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
      )
    )
    .join("/");
}

export interface SignedS3Request {
  readonly url: string;
  readonly headers: Record<string, string>;
}

/**
 * Generates AWS Signature Version 4 headers for an S3 / Cloudflare R2 HTTP
 * request using Node's built-in `crypto` module.
 */
export function signS3Request(params: {
  method: "HEAD" | "PUT";
  endpoint: string;
  path: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  body?: Buffer;
  extraHeaders?: Readonly<Record<string, string>>;
  now?: Date;
}): SignedS3Request {
  const region = params.region ?? "auto";
  const now = params.now ?? new Date();
  const { amzDate, dateStamp } = formatAmzDate(now);
  const payloadHash = sha256Hex(params.body ?? "");

  const baseUrl = new URL(params.endpoint);
  const canonicalUri = encodeUriPath(
    params.path.startsWith("/") ? params.path : `/${params.path}`
  );
  const requestUrl = `${baseUrl.origin}${canonicalUri}`;

  const rawHeaders: Record<string, string> = {
    host: baseUrl.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (params.extraHeaders) {
    for (const [k, v] of Object.entries(params.extraHeaders)) {
      rawHeaders[k.toLowerCase()] = v.trim();
    }
  }

  const sortedHeaderKeys = Object.keys(rawHeaders).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${rawHeaders[k]}\n`)
    .join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalRequest = [
    params.method,
    canonicalUri,
    "", // query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmacSha256(`AWS4${params.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  const headers: Record<string, string> = {
    ...rawHeaders,
    Authorization: `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  // `fetch` sets the `Host` header automatically from the URL.
  delete headers.host;

  return { url: requestUrl, headers };
}

/**
 * S3 / Cloudflare R2 backup sink using path-style requests
 * (`<endpoint>/<bucket>/<key>`).
 */
export class S3BackupSink implements BackupSink {
  readonly endpoint: string;
  readonly bucket: string;
  readonly autoCreateBucket: boolean;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly region: string;

  constructor(config: S3SinkConfig) {
    this.endpoint = config.endpoint.replace(/\/+$/, "");
    this.bucket = config.bucket;
    this.autoCreateBucket = config.autoCreateBucket ?? false;
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.region = config.region ?? "auto";
  }

  /**
   * HEADs the bucket. Returns `"ok"` if it exists (or the token can't HEAD
   * buckets), `"missing"` on 404, and throws on anything else.
   */
  private async headBucket(): Promise<"ok" | "missing"> {
    const headSigned = signS3Request({
      method: "HEAD",
      endpoint: this.endpoint,
      path: `/${this.bucket}`,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: this.region,
    });
    const headRes = await fetch(headSigned.url, {
      method: "HEAD",
      headers: headSigned.headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (headRes.ok) {
      return "ok";
    }
    if (headRes.status === 403) {
      // Object-scoped tokens (e.g. R2 tokens limited to one bucket) may not
      // be allowed to HEAD the bucket itself. A bad token still fails safely
      // later: `putWeek` throws and nothing is deleted.
      log(
        `HEAD bucket '${this.bucket}' returned 403; assuming an object-scoped token and continuing.`
      );
      return "ok";
    }
    if (headRes.status === 404) {
      return "missing";
    }
    throw new Error(
      `S3 HEAD bucket '${this.bucket}' failed with HTTP ${headRes.status}`
    );
  }

  private missingBucketError(): Error {
    return new Error(
      `S3 bucket '${this.bucket}' does not exist at ${this.endpoint}. Create it, or omit the bucket from PRUNE_BACKUP_URI to use '${DEFAULT_S3_BUCKET}' (created automatically).`
    );
  }

  async checkReady(): Promise<void> {
    if ((await this.headBucket()) === "missing" && !this.autoCreateBucket) {
      throw this.missingBucketError();
    }
  }

  async ensureReady(): Promise<void> {
    if ((await this.headBucket()) === "ok") {
      return;
    }
    if (!this.autoCreateBucket) {
      throw this.missingBucketError();
    }

    const putSigned = signS3Request({
      method: "PUT",
      endpoint: this.endpoint,
      path: `/${this.bucket}`,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: this.region,
    });
    const putRes = await fetch(putSigned.url, {
      method: "PUT",
      headers: putSigned.headers,
      signal: AbortSignal.timeout(15_000),
    });
    // 200 OK or 409 BucketAlreadyOwnedByYou
    if (!putRes.ok && putRes.status !== 409) {
      const errBody = await putRes.text().catch(() => "");
      throw new Error(
        `S3 CreateBucket '${this.bucket}' failed with HTTP ${putRes.status}: ${errBody}`
      );
    }
    log(`Created bucket '${this.bucket}' at ${this.endpoint}.`);
  }

  async headWeek(key: string): Promise<ArchiveInfo | null> {
    const cleanKey = key.replace(/^\/+/, "");
    const signed = signS3Request({
      method: "HEAD",
      endpoint: this.endpoint,
      path: `/${this.bucket}/${cleanKey}`,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: this.region,
    });
    const res = await fetch(signed.url, {
      method: "HEAD",
      headers: signed.headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`S3 HEAD '${cleanKey}' failed with HTTP ${res.status}`);
    }
    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      throw new Error(
        `S3 archive '${cleanKey}' exists but is empty (content-length=${res.headers.get(
          "content-length"
        )}); refusing to trust it.`
      );
    }
    const docCountStr = res.headers.get("x-amz-meta-doc-count") ?? "";
    if (!/^\d+$/.test(docCountStr) || Number(docCountStr) <= 0) {
      throw new Error(
        `S3 archive '${cleanKey}' exists but has no valid x-amz-meta-doc-count ('${docCountStr}'); refusing to trust it.`
      );
    }
    const lastId = res.headers.get("x-amz-meta-last-id");
    return lastId !== null && /^[0-9a-f]{24}$/.test(lastId)
      ? { docCount: Number(docCountStr), lastId }
      : { docCount: Number(docCountStr) };
  }

  async putWeek(key: string, gzData: Buffer, meta: ArchiveMeta): Promise<void> {
    const cleanKey = key.replace(/^\/+/, "");
    const signed = signS3Request({
      method: "PUT",
      endpoint: this.endpoint,
      path: `/${this.bucket}/${cleanKey}`,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: this.region,
      body: gzData,
      extraHeaders: {
        // The object *is* a gzip file, so no `content-encoding`: that would
        // make browsers and `fetch` transparently gunzip a `.jsonl.gz`
        // download. `fetch` sets `content-length` itself.
        "content-type": "application/gzip",
        "x-amz-meta-doc-count": String(meta.docCount),
        "x-amz-meta-last-id": meta.lastId,
        "x-amz-meta-week-start": meta.weekStart,
        "x-amz-meta-week-end": meta.weekEnd,
        // Never overwrite an existing archive (supported by S3 and R2).
        "if-none-match": "*",
      },
    });
    const res = await fetch(signed.url, {
      method: "PUT",
      headers: signed.headers,
      body: new Uint8Array(gzData),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `S3 PUT '${cleanKey}' failed with HTTP ${res.status}: ${errText}`
      );
    }
  }
}

function errorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? String(err.code)
    : undefined;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Filesystem types that live in RAM, so archives on them are lost on reboot
 * even when bind-mounted from the host (e.g. a tmpfs `/tmp`).
 */
const RAM_FS_TYPES = new Set(["tmpfs", "ramfs"]);
/** `<namespace>/<collection>/<year>/` */
const ARCHIVE_DIR_DEPTH = 3;

export interface MountEntry {
  readonly mountPoint: string;
  readonly fsType: string;
}

function unescapeMountPath(raw: string): string {
  return raw.replace(/\\([0-7]{3})/g, (_, oct: string) =>
    String.fromCharCode(parseInt(oct, 8))
  );
}

/**
 * Parses `/proc/self/mountinfo` and returns the mount that `path` lives on
 * (the longest mount point that is a path-prefix of `path`), or `null`.
 */
export function findMountForPath(
  mountInfo: string,
  path: string
): MountEntry | null {
  let best: MountEntry | null = null;
  for (const line of mountInfo.split("\n")) {
    const fields = line.trim().split(" ");
    const sepIdx = fields.indexOf("-");
    if (fields.length < 5 || sepIdx === -1 || sepIdx + 1 >= fields.length) {
      continue;
    }
    const mountPoint = unescapeMountPath(fields[4]);
    const fsType = fields[sepIdx + 1];
    const prefix = mountPoint.endsWith("/") ? mountPoint : `${mountPoint}/`;
    const contains = path === mountPoint || path.startsWith(prefix);
    if (!contains) {
      continue;
    }
    // Later entries with the same mount point shadow earlier ones.
    if (best === null || mountPoint.length >= best.mountPoint.length) {
      best = { mountPoint, fsType };
    }
  }
  return best;
}

async function nearestExistingRealPath(path: string): Promise<string> {
  let current = path;
  const missing: string[] = [];
  for (;;) {
    try {
      const real = await realpath(current);
      return missing.length === 0 ? real : join(real, ...missing.reverse());
    } catch (err) {
      const parent = dirname(current);
      if (errorCode(err) !== "ENOENT" || parent === current) {
        throw err;
      }
      missing.push(basename(current));
      current = parent;
    }
  }
}

async function fsyncDir(dirPath: string): Promise<void> {
  const handle = await open(dirPath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

interface GzipArchiveSummary {
  readonly docCount: number;
  /** The last `\n`-terminated line, or `null` if there were none. */
  readonly lastLine: string | null;
}

/**
 * Counts `\n`-terminated lines in a gzip file and keeps the last complete
 * one, without buffering the file.
 */
async function summarizeGzipLines(path: string): Promise<GzipArchiveSummary> {
  const state: { count: number; lastLine: Buffer | null; pending: Buffer } = {
    count: 0,
    lastLine: null,
    // Bytes after the last newline seen so far (the start of the next line).
    pending: Buffer.alloc(0),
  };
  await pipeline(
    createReadStream(path),
    createGunzip(),
    async (source: AsyncIterable<Buffer>) => {
      for await (const chunk of source) {
        const lastNl = chunk.lastIndexOf(10);
        if (lastNl === -1) {
          state.pending = Buffer.concat([state.pending, chunk]);
          continue;
        }
        for (
          let i = chunk.indexOf(10);
          i !== -1;
          i = chunk.indexOf(10, i + 1)
        ) {
          state.count++;
        }
        const prevNl = chunk.lastIndexOf(10, lastNl - 1);
        state.lastLine =
          prevNl === -1
            ? Buffer.concat([state.pending, chunk.subarray(0, lastNl)])
            : chunk.subarray(prevNl + 1, lastNl);
        state.pending = chunk.subarray(lastNl + 1);
      }
    }
  );
  return {
    docCount: state.count,
    lastLine: state.lastLine === null ? null : state.lastLine.toString("utf8"),
  };
}

/** The hex `_id` of an archived document line, or `undefined` if it has none. */
function parseArchivedId(line: string): string | undefined {
  const doc: unknown = JSON.parse(line);
  if (typeof doc !== "object" || doc === null || !("_id" in doc)) {
    return undefined;
  }
  const id = doc._id;
  return typeof id === "string" && /^[0-9a-f]{24}$/.test(id) ? id : undefined;
}

export interface LocalSinkOptions {
  /**
   * Whether to require that `baseDir` is on a persistent mounted volume.
   * Defaults to `true` when running inside Docker (`/.dockerenv` exists).
   */
  readonly requireMount?: boolean;
  /** Overrides `/proc/self/mountinfo` (for tests). */
  readonly mountInfoPath?: string;
}

/**
 * Local filesystem backup sink that writes exactly one `<dir>/<key>` file per
 * week. The archive's document count is read back from the file itself (by
 * streaming gunzip), so there is no sidecar metadata to keep in sync.
 */
export class LocalFileBackupSink implements BackupSink {
  readonly baseDir: string;
  private readonly requireMount: boolean;
  private readonly mountInfoPath: string;

  constructor(baseDir: string, options: LocalSinkOptions = {}) {
    this.baseDir = resolve(baseDir);
    this.requireMount = options.requireMount ?? existsSync("/.dockerenv");
    this.mountInfoPath = options.mountInfoPath ?? "/proc/self/mountinfo";
  }

  private permissionError(action: string, err: unknown): Error {
    const code = errorCode(err);
    if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
      return new Error(
        `Cannot ${action} local backup directory ${this.baseDir} (${code}). ` +
          `The pruner runs as UID 1000; create the host directory mounted at this path with: ${LOCAL_SINK_SETUP_COMMAND}`
      );
    }
    return new Error(
      `Cannot ${action} local backup directory ${this.baseDir}: ${errorMessage(
        err
      )}`
    );
  }

  private async assertOnPersistentMount(): Promise<void> {
    const realDir = await nearestExistingRealPath(this.baseDir);
    const mountInfo = await readFile(this.mountInfoPath, "utf8");
    const mount = findMountForPath(mountInfo, realDir);
    // The container's own root filesystem (mounted at `/`) is discarded when
    // the container is recreated. Other mounts are bind mounts or volumes;
    // their reported type is the source filesystem's, so an `overlay` there
    // (e.g. Docker-in-Docker) is as persistent as its host, but RAM-backed
    // filesystems never survive a reboot.
    if (
      mount === null ||
      mount.mountPoint === "/" ||
      RAM_FS_TYPES.has(mount.fsType)
    ) {
      throw new Error(
        `PRUNE_BACKUP_URI points at ${this.baseDir}, which is not on a persistent mounted volume ` +
          `(found ${
            mount === null
              ? "no mount"
              : `${mount.fsType} at ${mount.mountPoint}`
          }). ` +
          `Archives written there would be lost when the container is recreated. ` +
          `Use a path under a mounted volume, e.g. /morcus/logs/archives.`
      );
    }
  }

  /**
   * Removes `.tmp-*` files left by hard kills (older than
   * `STALE_TMP_FILE_AGE_MS`, so another running instance's file is left
   * alone). Temp files only ever live next to archives
   * (`<namespace>/<collection>/<year>/`), so this walks at most that deep and
   * skips directories it can't read (e.g. `lost+found` at the root of a
   * dedicated ext4 volume).
   */
  private async removeStaleTmpFiles(
    dir: string = this.baseDir,
    depth: number = 0
  ): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      const code = errorCode(err);
      if (dir !== this.baseDir && (code === "EACCES" || code === "EPERM")) {
        return;
      }
      throw err;
    }
    const staleBefore = Date.now() - STALE_TMP_FILE_AGE_MS;
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < ARCHIVE_DIR_DEPTH) {
          await this.removeStaleTmpFiles(fullPath, depth + 1);
        }
      } else if (entry.name.startsWith(TMP_FILE_PREFIX)) {
        try {
          const tmpStat = await stat(fullPath);
          if (tmpStat.mtimeMs > staleBefore) {
            continue;
          }
          await unlink(fullPath);
          log(`Removed stale temp file ${fullPath}.`);
        } catch (err) {
          log(
            `Could not remove stale temp file ${fullPath}: ${errorMessage(err)}`
          );
        }
      }
    }
  }

  async checkReady(): Promise<void> {
    if (this.requireMount) {
      await this.assertOnPersistentMount();
    }
    // Writable without writing: check the nearest directory that exists.
    let probeDir = this.baseDir;
    while (!existsSync(probeDir) && dirname(probeDir) !== probeDir) {
      probeDir = dirname(probeDir);
    }
    try {
      await access(probeDir, fsConstants.W_OK | fsConstants.X_OK);
    } catch (err) {
      throw this.permissionError(
        probeDir === this.baseDir ? "write to" : "create",
        err
      );
    }
  }

  async ensureReady(): Promise<void> {
    if (this.requireMount) {
      await this.assertOnPersistentMount();
    }
    try {
      await mkdir(this.baseDir, { recursive: true });
    } catch (err) {
      throw this.permissionError("create", err);
    }
    const probe = join(this.baseDir, WRITE_PROBE_NAME);
    try {
      await writeFile(probe, "ok", { flush: true });
      await unlink(probe);
    } catch (err) {
      throw this.permissionError("write to", err);
    }
    await this.removeStaleTmpFiles();
  }

  private resolveSafePath(key: string): string {
    const cleanKey = key.replace(/^\/+/, "");
    const fullPath = resolve(this.baseDir, cleanKey);
    if (!fullPath.startsWith(`${this.baseDir}${sep}`)) {
      throw new Error(`Invalid archive key path: ${key}`);
    }
    return fullPath;
  }

  async headWeek(key: string): Promise<ArchiveInfo | null> {
    const filePath = this.resolveSafePath(key);
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        throw new Error(`Local archive path ${filePath} is not a file.`);
      }
    } catch (err) {
      if (errorCode(err) === "ENOENT") {
        return null;
      }
      throw err;
    }

    let summary: GzipArchiveSummary;
    try {
      summary = await summarizeGzipLines(filePath);
    } catch (err) {
      throw new Error(
        `Local archive ${filePath} is unreadable or corrupt (${errorMessage(
          err
        )}); refusing to overwrite it or delete this week from MongoDB.`
      );
    }
    if (summary.docCount === 0 || summary.lastLine === null) {
      throw new Error(
        `Local archive ${filePath} contains no documents; refusing to overwrite it or delete this week from MongoDB.`
      );
    }
    let lastId: string | undefined;
    try {
      lastId = parseArchivedId(summary.lastLine);
    } catch (err) {
      throw new Error(
        `Local archive ${filePath} ends in an unparseable line (${errorMessage(
          err
        )}); refusing to overwrite it or delete this week from MongoDB.`
      );
    }
    return lastId === undefined
      ? { docCount: summary.docCount }
      : { docCount: summary.docCount, lastId };
  }

  /** Publishes `tmpPath` at `filePath`, failing if `filePath` exists. */
  private async publishNoClobber(
    tmpPath: string,
    filePath: string
  ): Promise<void> {
    try {
      // `link` fails atomically with EEXIST if the target exists.
      await link(tmpPath, filePath);
      return;
    } catch (err) {
      const code = errorCode(err);
      if (code === "EEXIST") {
        throw new Error(
          `Local archive ${filePath} already exists; refusing to overwrite.`
        );
      }
      const noHardLinks =
        code === "EPERM" ||
        code === "ENOTSUP" ||
        code === "EOPNOTSUPP" ||
        code === "ENOSYS";
      if (!noHardLinks) {
        throw err;
      }
    }
    // Filesystem without hard-link support: best-effort no-clobber.
    const exists = await stat(filePath).then(
      () => true,
      (err: unknown) => {
        if (errorCode(err) === "ENOENT") return false;
        throw err;
      }
    );
    if (exists) {
      throw new Error(
        `Local archive ${filePath} already exists; refusing to overwrite.`
      );
    }
    await rename(tmpPath, filePath);
  }

  async putWeek(
    key: string,
    gzData: Buffer,
    _meta?: ArchiveMeta
  ): Promise<void> {
    const filePath = this.resolveSafePath(key);
    const fileDir = dirname(filePath);
    await mkdir(fileDir, { recursive: true });
    const tmpPath = join(
      fileDir,
      `${TMP_FILE_PREFIX}${process.pid}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`
    );
    try {
      await writeFile(tmpPath, gzData, { flush: true });
      await this.publishNoClobber(tmpPath, filePath);
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
    // Make the new directory entries durable (including any directories
    // `mkdir` just created) before the caller deletes from MongoDB.
    for (let dir = fileDir; dir.startsWith(this.baseDir); dir = dirname(dir)) {
      await fsyncDir(dir);
      if (dir === this.baseDir) break;
    }
  }
}

function localSinkFor(
  dirPath: string,
  options: LocalSinkOptions
): LocalFileBackupSink {
  if (resolve(dirPath) === "/") {
    throw new Error(
      "Invalid PRUNE_BACKUP_URI: the filesystem root '/' is not allowed as a backup directory."
    );
  }
  return new LocalFileBackupSink(dirPath, options);
}

/**
 * Parses `PRUNE_BACKUP_URI` into a `BackupSink`, or returns `null` for
 * prune-only mode when `rawUri` is exactly `none`.
 *
 * Supported formats:
 * - Empty / unset: local backup to `DEFAULT_BACKUP_DIR` (the safe default)
 * - `none`: `null` (prune-only mode: expired weeks are deleted WITHOUT backup)
 * - `https://<accessKeyId>:<secretAccessKey>@<host>[:port][/<bucket>][?region=auto]`
 *   (or `http://...` for local S3 endpoints); `<bucket>` defaults to
 *   `morcus-telemetry` when omitted, and only that default bucket is created
 *   automatically. Credentials must be percent-encoded.
 * - `file:///absolute/path` or `/absolute/path`
 *
 * Anything else (relative paths like `off` or `backups`, `file://host/...`,
 * `/`, other schemes) throws, so a typo never silently writes archives to an
 * unexpected place or disables backups.
 */
export function parseBackupUri(
  rawUri?: string,
  localOptions: LocalSinkOptions = {}
): BackupSink | null {
  const trimmed = rawUri?.trim() ?? "";
  if (trimmed.length === 0) {
    return localSinkFor(DEFAULT_BACKUP_DIR, localOptions);
  }
  if (trimmed === NO_BACKUP_VALUE) {
    return null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error(`Invalid PRUNE_BACKUP_URI: malformed URL`);
    }
    let accessKeyId: string;
    let secretAccessKey: string;
    try {
      accessKeyId = decodeURIComponent(parsed.username);
      secretAccessKey = decodeURIComponent(parsed.password);
    } catch {
      throw new Error(
        "Invalid PRUNE_BACKUP_URI: credentials are not valid percent-encoding"
      );
    }
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "Invalid PRUNE_BACKUP_URI: S3/R2 URL must include credentials (https://<access_key_id>:<secret_access_key>@<endpoint>[/<bucket>])"
      );
    }
    const pathBucket = parsed.pathname.replace(/^\/+|\/+$/g, "");
    if (pathBucket.includes("/")) {
      throw new Error(
        `Invalid PRUNE_BACKUP_URI: bucket path '${pathBucket}' must be a single bucket name`
      );
    }
    const explicitBucket = pathBucket.length > 0;
    const region = parsed.searchParams.get("region") ?? "auto";
    return new S3BackupSink({
      endpoint: parsed.origin,
      bucket: explicitBucket ? pathBucket : DEFAULT_S3_BUCKET,
      autoCreateBucket: !explicitBucket,
      accessKeyId,
      secretAccessKey,
      region,
    });
  }

  if (trimmed.startsWith("file://")) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error(`Invalid PRUNE_BACKUP_URI: malformed file:// URL`);
    }
    if (parsed.host !== "") {
      throw new Error(
        `Invalid PRUNE_BACKUP_URI: file:// URLs must have an empty host and an absolute path (file:///morcus/logs/archives); got host '${parsed.host}'.`
      );
    }
    return localSinkFor(decodeURIComponent(parsed.pathname), localOptions);
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    throw new Error(
      `Unsupported scheme in PRUNE_BACKUP_URI. Expected https://, http://, file:///, or an absolute local directory path.`
    );
  }

  if (!trimmed.startsWith("/")) {
    throw new Error(
      `Invalid PRUNE_BACKUP_URI '${trimmed}': local backup paths must be absolute (e.g. ${DEFAULT_BACKUP_DIR}). Leave PRUNE_BACKUP_URI empty for the default local backup, or set it to '${NO_BACKUP_VALUE}' to delete without backup.`
    );
  }
  return localSinkFor(trimmed, localOptions);
}
