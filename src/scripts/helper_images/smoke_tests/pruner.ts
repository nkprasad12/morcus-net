import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { run, sleep, tryRun } from "@/scripts/helper_images/docker";

/** Mongo image used by `smokeTestPruner`. */
const TEST_MONGO_IMAGE = "mongo:8.0";

const NET = "pruner-test-net";
const MONGO_CONTAINER = "pruner-mongo-test";
const S3_CONTAINER = "pruner-s3-test";
const MONGO_URI = `mongodb://${MONGO_CONTAINER}:27017/morcus`;
/** `<host>-<db>` namespace the pruner derives from `MONGO_URI`. */
const NAMESPACE = `${MONGO_CONTAINER}-morcus`;
/** Expired `_id`s (first four bytes are the seconds timestamp). */
const EXPIRED_S3_ID = "600000000000000000000001"; // 2021-01-14, ISO 2021-W02
const EXPIRED_LOCAL_ID = "610000000000000000000001"; // 2021-07-27, ISO 2021-W30
const LOCAL_ARCHIVE_REL = `archives/${NAMESPACE}/ApiCalls/2021/ApiCalls-2021-W30.jsonl.gz`;

/**
 * Host directory that is bind-mounted at `/morcus/logs`. It must be on a
 * disk-backed filesystem: the pruner refuses RAM-backed mounts (`tmpfs`), so
 * a `/tmp` on tmpfs (common on dev machines) can't be used. GitHub runners
 * set `RUNNER_TEMP` on the root disk; locally, set `PRUNER_SMOKE_TMPDIR`.
 */
function hostTmpRoot(): string {
  return process.env.PRUNER_SMOKE_TMPDIR ?? process.env.RUNNER_TEMP ?? tmpdir();
}

interface PrunerRun {
  readonly status: number;
  readonly output: string;
}

/**
 * Runs the pruner image once with `env`, optionally bind-mounting `hostDir`
 * at `/morcus/logs` (as `docker-compose.yaml` does), and returns its exit
 * status and combined output rather than throwing on failure.
 */
function runPruner(
  imageRef: string,
  env: Readonly<Record<string, string>>,
  args: readonly string[],
  hostDir?: string
): PrunerRun {
  const dockerArgs = ["run", "--rm", "--network", NET];
  for (const [k, v] of Object.entries(env)) {
    dockerArgs.push("-e", `${k}=${v}`);
  }
  if (hostDir !== undefined) {
    dockerArgs.push("-v", `${hostDir}:/morcus/logs`);
  }
  dockerArgs.push(imageRef, ...args);
  const res = spawnSync("docker", dockerArgs, { encoding: "utf8" });
  if (res.error) {
    throw res.error;
  }
  return {
    status: res.status ?? -1,
    output: `${res.stdout}${res.stderr}`,
  };
}

/**
 * Runs a shell command as root inside the pruner image with `hostDir`
 * mounted at `/x`. Used to set up (and clean up) host directory ownership
 * without needing `sudo` on the host.
 */
function asRoot(imageRef: string, hostDir: string, shellCommand: string): void {
  run("docker", [
    "run",
    "--rm",
    "--user",
    "0",
    "--entrypoint",
    "sh",
    "-v",
    `${hostDir}:/x`,
    imageRef,
    "-c",
    shellCommand,
  ]);
}

function check(condition: boolean, message: string, output?: string): void {
  if (!condition) {
    throw new Error(
      output === undefined ? message : `${message}\n--- output ---\n${output}`
    );
  }
}

function mongoEval(script: string): string {
  return run("docker", [
    "exec",
    MONGO_CONTAINER,
    "mongosh",
    "--quiet",
    "mongodb://127.0.0.1:27017/morcus",
    "--eval",
    script,
  ]);
}

/** Names of all `ApiCalls` documents, oldest `_id` first. */
function apiCallNames(): string[] {
  const raw = mongoEval(
    "JSON.stringify(db.ApiCalls.find({}, { _id: 0, name: 1 }).sort({ _id: 1 }).toArray().map((d) => d.name))"
  );
  const parsed: unknown = JSON.parse(raw.trim());
  if (
    !Array.isArray(parsed) ||
    !parsed.every((x): x is string => typeof x === "string")
  ) {
    throw new Error(`Unexpected mongosh output: ${raw}`);
  }
  return parsed;
}

function expectNames(expected: string[], context: string): void {
  const actual = apiCallNames();
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${context}: expected ApiCalls ${JSON.stringify(
      expected
    )} but found ${JSON.stringify(actual)}`
  );
}

/**
 * Smoke-tests `morcus-pruner`:
 * 1. Exits `0` immediately when `MONGODB_URI` is unset.
 * 2. **S3/R2 backup**: against a throwaway `mongo:8.0` and an S3 HTTP stub
 *    on an isolated Docker network, `--once` with an S3 `PRUNE_BACKUP_URI`
 *    archives an expired (>100d) week to the stub (auto-created
 *    `morcus-telemetry` bucket, `<host>-<db>` namespace) and deletes it from
 *    Mongo, leaving a recent document intact.
 * 3. **Local backup (the default)**, with a host directory bind-mounted at
 *    `/morcus/logs` as in `docker-compose.yaml`:
 *    - an unprepared (root-owned) directory: `--once` exits non-zero with the
 *      `sudo install -d -o 1000 -g 1000` hint and deletes nothing;
 *      `--dry-run` reports the destination as not ready, still lists the
 *      week, exits non-zero, and deletes nothing;
 *    - a `PRUNE_BACKUP_URI` on the container's own filesystem is rejected as
 *      not on a mounted volume;
 *    - after `install -d -o 1000 -g 1000 archives`: `--dry-run` exits 0 and
 *      writes nothing; `--once` archives the expired week to
 *      `archives/<namespace>/ApiCalls/2021/…W30.jsonl.gz` (one line, the
 *      expected `_id`) and deletes it; a second `--once` prunes nothing and
 *      leaves the archive byte-identical.
 */
export async function smokeTestPruner(imageRef: string): Promise<void> {
  // 1. Disabled mode when MONGODB_URI is empty
  const disabledOut = run("docker", [
    "run",
    "--rm",
    "-e",
    "MONGODB_URI=",
    imageRef,
  ]);
  check(
    disabledOut.includes("No MONGODB_URI set"),
    `Expected disabled message when MONGODB_URI is empty; got: ${disabledOut}`
  );

  tryRun("docker", ["rm", "-f", MONGO_CONTAINER, S3_CONTAINER]);
  tryRun("docker", ["network", "rm", NET]);
  let hostDir: string | undefined;

  try {
    run("docker", ["network", "create", NET]);
    run("docker", [
      "run",
      "-d",
      "--name",
      MONGO_CONTAINER,
      "--network",
      NET,
      TEST_MONGO_IMAGE,
    ]);

    const s3StubScript = `
      const http = require("node:http");
      const buckets = new Set();
      const objects = new Map();
      http.createServer((req, res) => {
        if (req.url === "/_summary") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            buckets: [...buckets],
            keys: [...objects.keys()],
          }));
          return;
        }
        if (!(req.headers.authorization || "").startsWith("AWS4-HMAC-SHA256 ")) {
          res.statusCode = 403;
          res.end("Missing SigV4");
          return;
        }
        const p = (req.url || "/").replace(/^\\/+/, "");
        const idx = p.indexOf("/");
        const bucket = idx === -1 ? p : p.slice(0, idx);
        const key = idx === -1 ? "" : p.slice(idx + 1);
        if (!key) {
          if (req.method === "HEAD") {
            res.statusCode = buckets.has(bucket) ? 200 : 404;
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
        const id = bucket + "/" + key;
        if (req.method === "HEAD") {
          const found = objects.get(id);
          if (!found) { res.statusCode = 404; res.end(); return; }
          for (const [k, v] of Object.entries(found.headers)) {
            if (k.startsWith("x-amz-meta-")) res.setHeader(k, v);
          }
          res.setHeader("Content-Length", String(found.body.length));
          res.statusCode = 200;
          res.end();
          return;
        }
        if (req.method === "PUT") {
          if (req.headers["if-none-match"] === "*" && objects.has(id)) {
            res.statusCode = 412;
            res.end();
            return;
          }
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => {
            objects.set(id, { body: Buffer.concat(chunks), headers: req.headers });
            res.statusCode = 200;
            res.end();
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      }).listen(9000, "0.0.0.0");
    `;

    run("docker", [
      "run",
      "-d",
      "--name",
      S3_CONTAINER,
      "--network",
      NET,
      "-p",
      "127.0.0.1:9009:9000",
      "--entrypoint",
      "node",
      imageRef,
      "-e",
      s3StubScript,
    ]);

    // Wait for Mongo to accept connections and seed 1 expired + 1 recent doc.
    let seeded = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const out = tryRun("docker", [
        "exec",
        MONGO_CONTAINER,
        "mongosh",
        "--quiet",
        "mongodb://127.0.0.1:27017/morcus",
        "--eval",
        `db.ApiCalls.insertMany([{ _id: ObjectId("${EXPIRED_S3_ID}"), name: "/dicts-expired" }, { _id: new ObjectId(), name: "/dicts-recent" }]); print("SEEDED_OK");`,
      ]);
      if (out && out.includes("SEEDED_OK")) {
        seeded = true;
        break;
      }
      await sleep(1000);
    }
    check(seeded, `Timed out waiting for ${MONGO_CONTAINER} to start.`);

    // 2. S3/R2 backup
    const s3Run = runPruner(
      imageRef,
      {
        MONGODB_URI: MONGO_URI,
        PRUNE_BACKUP_URI: `http://testKey:testSecret@${S3_CONTAINER}:9000`,
      },
      ["--once"]
    );
    console.log(s3Run.output);
    check(s3Run.status === 0, "S3 --once pass failed", s3Run.output);
    expectNames(["/dicts-recent"], "After the S3 pass");

    const s3SummaryRes = await fetch("http://127.0.0.1:9009/_summary");
    const s3Summary: unknown = await s3SummaryRes.json();
    const isValidSummary =
      typeof s3Summary === "object" &&
      s3Summary !== null &&
      "buckets" in s3Summary &&
      Array.isArray(s3Summary.buckets) &&
      s3Summary.buckets.includes("morcus-telemetry") &&
      "keys" in s3Summary &&
      Array.isArray(s3Summary.keys) &&
      s3Summary.keys.includes(
        `morcus-telemetry/${NAMESPACE}/ApiCalls/2021/ApiCalls-2021-W02.jsonl.gz`
      );
    check(
      isValidSummary,
      `Unexpected S3 stub state after prune pass: ${JSON.stringify(s3Summary)}`
    );

    // 3. Local backup (the default when PRUNE_BACKUP_URI is unset)
    mongoEval(
      `db.ApiCalls.insertOne({ _id: ObjectId("${EXPIRED_LOCAL_ID}"), name: "/dicts-expired-local" });`
    );
    const seededNames = ["/dicts-expired-local", "/dicts-recent"];
    expectNames(seededNames, "After re-seeding for the local scenarios");

    hostDir = mkdtempSync(join(hostTmpRoot(), "pruner-smoke-"));
    // Unprepared: owned by root and not writable by the container's UID 1000,
    // like a `$LOGS_DIR` whose `archives/` was never created.
    asRoot(imageRef, hostDir, "chown root:root /x && chmod 755 /x");
    const baseEnv = { MONGODB_URI: MONGO_URI };

    // 3a. Unprepared directory, --once: refuses to start, deletes nothing.
    const unprepared = runPruner(imageRef, baseEnv, ["--once"], hostDir);
    check(
      unprepared.status !== 0,
      "Expected --once to fail on an unprepared archive directory",
      unprepared.output
    );
    check(
      unprepared.output.includes("sudo install -d -o 1000 -g 1000"),
      "Expected the unprepared-directory error to include the install hint",
      unprepared.output
    );
    expectNames(seededNames, "After --once on an unprepared directory");

    // 3b. Unprepared directory, --dry-run: reports, still lists the week,
    // exits non-zero, deletes nothing.
    const dryUnprepared = runPruner(imageRef, baseEnv, ["--dry-run"], hostDir);
    check(
      dryUnprepared.status !== 0,
      "Expected --dry-run to exit non-zero when the destination is not ready",
      dryUnprepared.output
    );
    check(
      dryUnprepared.output.includes("backup destination is not ready"),
      "Expected --dry-run to report the destination as not ready",
      dryUnprepared.output
    );
    check(
      dryUnprepared.output.includes(
        "DRY RUN: would archive to " +
          `${NAMESPACE}/ApiCalls/2021/ApiCalls-2021-W30.jsonl.gz and delete ApiCalls 2021-W30 (1 docs`
      ),
      "Expected --dry-run to list the expired week even when not ready",
      dryUnprepared.output
    );
    expectNames(seededNames, "After --dry-run on an unprepared directory");

    // 3c. A path on the container's own filesystem is not a mounted volume.
    const unmounted = runPruner(
      imageRef,
      { ...baseEnv, PRUNE_BACKUP_URI: "/morcus/archives" },
      ["--once"],
      hostDir
    );
    check(
      unmounted.status !== 0 &&
        unmounted.output.includes("not on a persistent mounted volume"),
      "Expected an unmounted PRUNE_BACKUP_URI to be rejected",
      unmounted.output
    );
    expectNames(seededNames, "After --once with an unmounted PRUNE_BACKUP_URI");

    // 3d. Prepared as vm_setup.sh / monitoring.md instruct.
    asRoot(imageRef, hostDir, "install -d -o 1000 -g 1000 /x/archives");
    const archivePath = join(hostDir, LOCAL_ARCHIVE_REL);

    const dryPrepared = runPruner(imageRef, baseEnv, ["--dry-run"], hostDir);
    console.log(dryPrepared.output);
    check(
      dryPrepared.status === 0,
      "Expected --dry-run to exit 0 on a prepared directory",
      dryPrepared.output
    );
    check(
      dryPrepared.output.includes("backup destination is ready") &&
        dryPrepared.output.includes("would prune 1 week(s), 0 error(s)"),
      "Expected --dry-run to report a ready destination and one week",
      dryPrepared.output
    );
    check(
      !existsSync(archivePath),
      `--dry-run must not write archives, but ${archivePath} exists`
    );
    expectNames(seededNames, "After --dry-run on a prepared directory");

    // 3e. The real pass with the default local backup.
    const localRun = runPruner(imageRef, baseEnv, ["--once"], hostDir);
    console.log(localRun.output);
    check(localRun.status === 0, "Local --once pass failed", localRun.output);
    check(
      localRun.output.includes("(default; PRUNE_BACKUP_URI is unset)"),
      "Expected the startup log to say the local backup is the default",
      localRun.output
    );
    expectNames(["/dicts-recent"], "After the local pass");
    check(existsSync(archivePath), `Expected archive at ${archivePath}`);
    const archiveBytes = readFileSync(archivePath);
    const lines = gunzipSync(archiveBytes)
      .toString("utf8")
      .split("\n")
      .filter((l) => l.length > 0);
    check(
      lines.length === 1,
      `Expected exactly one document in ${archivePath}; got ${lines.length}`
    );
    const archived: unknown = JSON.parse(lines[0]);
    check(
      typeof archived === "object" &&
        archived !== null &&
        "_id" in archived &&
        archived._id === EXPIRED_LOCAL_ID &&
        "name" in archived &&
        archived.name === "/dicts-expired-local",
      `Unexpected archived document: ${lines[0]}`
    );

    // 3f. Idempotent: nothing left to prune, archive untouched.
    const again = runPruner(imageRef, baseEnv, ["--once"], hostDir);
    check(
      again.status === 0 &&
        again.output.includes("pruned 0 week(s), 0 error(s)"),
      "Expected a second --once to prune nothing",
      again.output
    );
    expectNames(["/dicts-recent"], "After the second local pass");
    check(
      readFileSync(archivePath).equals(archiveBytes),
      "Expected the archive to be unchanged by the second pass"
    );

    console.log("morcus-pruner smoke test passed.");
  } finally {
    if (hostDir !== undefined) {
      // Archives are owned by UID 1000 and the directory by root.
      tryRun("docker", [
        "run",
        "--rm",
        "--user",
        "0",
        "--entrypoint",
        "sh",
        "-v",
        `${hostDir}:/x`,
        imageRef,
        "-c",
        "rm -rf /x/archives && chmod 777 /x",
      ]);
      rmSync(hostDir, { recursive: true, force: true });
    }
    tryRun("docker", ["rm", "-f", MONGO_CONTAINER, S3_CONTAINER]);
    tryRun("docker", ["network", "rm", NET]);
  }
}
