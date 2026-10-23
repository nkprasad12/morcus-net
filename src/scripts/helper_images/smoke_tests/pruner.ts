import { run, sleep, tryRun } from "@/scripts/helper_images/docker";

/** Mongo image used by `smokeTestPruner`. */
const TEST_MONGO_IMAGE = "mongo:8.0";

/**
 * Smoke-tests `morcus-pruner`:
 * 1. Verifies it exits `0` immediately when `MONGODB_URI` is unset.
 * 2. Starts a throwaway `mongo:8.0` container and an S3 HTTP stub container on
 *    an isolated Docker network, seeds an expired (>100d) and a recent
 *    `ApiCalls` document, runs `<imageRef> --once` with `PRUNE_BACKUP_URI`, and
 *    verifies the expired week was backed up to the S3 stub (with auto-created
 *    `morcus-telemetry` bucket, under the `<host>-<db>` namespace) and deleted
 *    from Mongo while the recent document remains intact.
 *
 * `--once` exits non-zero if any part of the pass failed (including the
 * `dbStats` quota check against a real server), which fails `run(...)`.
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
  if (!disabledOut.includes("No MONGODB_URI set")) {
    throw new Error(
      `Expected disabled message when MONGODB_URI is empty; got: ${disabledOut}`
    );
  }

  tryRun("docker", ["rm", "-f", "pruner-mongo-test", "pruner-s3-test"]);
  tryRun("docker", ["network", "rm", "pruner-test-net"]);

  try {
    run("docker", ["network", "create", "pruner-test-net"]);
    run("docker", [
      "run",
      "-d",
      "--name",
      "pruner-mongo-test",
      "--network",
      "pruner-test-net",
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
      "pruner-s3-test",
      "--network",
      "pruner-test-net",
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
        "pruner-mongo-test",
        "mongosh",
        "--quiet",
        "mongodb://127.0.0.1:27017/morcus",
        "--eval",
        'db.ApiCalls.insertMany([{ _id: ObjectId("600000000000000000000001"), name: "/dicts-expired" }, { _id: new ObjectId(), name: "/dicts-recent" }]); print("SEEDED_OK");',
      ]);
      if (out && out.includes("SEEDED_OK")) {
        seeded = true;
        break;
      }
      await sleep(1000);
    }
    if (!seeded) {
      throw new Error("Timed out waiting for pruner-mongo-test to start.");
    }

    const prunerOut = run("docker", [
      "run",
      "--rm",
      "--network",
      "pruner-test-net",
      "-e",
      "MONGODB_URI=mongodb://pruner-mongo-test:27017/morcus",
      "-e",
      "PRUNE_BACKUP_URI=http://testKey:testSecret@pruner-s3-test:9000",
      imageRef,
      "--once",
    ]);
    console.log(prunerOut);

    const remainingJson = run("docker", [
      "exec",
      "pruner-mongo-test",
      "mongosh",
      "--quiet",
      "mongodb://127.0.0.1:27017/morcus",
      "--eval",
      "JSON.stringify(db.ApiCalls.find({}, { _id: 0, name: 1 }).toArray())",
    ]);
    if (remainingJson.trim() !== '[{"name":"/dicts-recent"}]') {
      throw new Error(
        `Expected only /dicts-recent to remain in Mongo; got: ${remainingJson}`
      );
    }

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
        "morcus-telemetry/pruner-mongo-test-morcus/ApiCalls/2021/ApiCalls-2021-W02.jsonl.gz"
      );
    if (!isValidSummary) {
      throw new Error(
        `Unexpected S3 stub state after prune pass: ${JSON.stringify(
          s3Summary
        )}`
      );
    }
    console.log("morcus-pruner smoke test passed.");
  } finally {
    tryRun("docker", ["rm", "-f", "pruner-mongo-test", "pruner-s3-test"]);
    tryRun("docker", ["network", "rm", "pruner-test-net"]);
  }
}
