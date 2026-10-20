/**
 * Builds, smoke-tests, pushes, and promotes the helper Docker images that run
 * alongside the main Morcus server in `src/devops/docker-compose.yaml`:
 *   - `morcus-proxy`   (context: `src/devops/reverse_proxy`)
 *   - `morcus-latincy` (context: `src/py/latincy`)
 *
 * Each image is content-addressed by a hash of its source directory's git tree
 * and this script's git blob:
 *   ghcr.io/nkprasad12/<name>:tree-<sha>
 *
 * Usage:
 *   npm run tsnp src/scripts/helper_images.ts -- build-and-test <morcus-proxy|morcus-latincy>
 *   npm run tsnp src/scripts/helper_images.ts -- build-and-push <morcus-proxy|morcus-latincy>
 *   npm run tsnp src/scripts/helper_images.ts -- promote
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, request as httpsRequest } from "node:https";

const REGISTRY_PREFIX = "ghcr.io/nkprasad12";
const SCRIPT_PATH = "src/scripts/helper_images.ts";

/**
 * Digest of the 2026-01-25 `morcus-latincy` image containing spaCy 3.8.11 and
 * the `la_core_web_lg` 3.8.0 model (preserved under `:archive-2026-01-25`).
 */
const LATINCY_ARCHIVE_TAG = "archive-2026-01-25";
const LATINCY_ARCHIVE_DIGEST =
  "sha256:553342482a1924b92e6645d425d4689d7e1d20131d6b12397af40e3a3912818c";

/** Base nginx image used by the stub upstream in `smokeTestProxy`. */
const STUB_NGINX_IMAGE =
  "nginx:1.30.4-alpine-slim@sha256:77da26c31397bf6694b4bf93275f5b40b0b120ba1b8f114264b603e592c561d6";

export const HELPER_IMAGES = {
  "morcus-proxy": { contextDir: "src/devops/reverse_proxy" },
  "morcus-latincy": { contextDir: "src/py/latincy" },
} as const;

export type HelperImageName = keyof typeof HELPER_IMAGES;

export const ALL_HELPER_IMAGE_NAMES: readonly HelperImageName[] = [
  "morcus-proxy",
  "morcus-latincy",
];

export function isHelperImageName(value: string): value is HelperImageName {
  return Object.prototype.hasOwnProperty.call(HELPER_IMAGES, value);
}

/**
 * Computes the 40-char content-addressed tag suffix from the git tree hash of
 * the image's directory and the git blob hash of this script.
 */
export function computeTreeHash(
  dirTreeSha: string,
  scriptBlobSha: string
): string {
  return createHash("sha256")
    .update(`${dirTreeSha.trim()}\n${scriptBlobSha.trim()}\n`)
    .digest("hex")
    .slice(0, 40);
}

/**
 * Validates that a LatinCy JSON response contains the expected lemma at
 * `response[0][1]` (compared case-insensitively).
 */
export function assertLatincyLemma(
  responseText: string,
  expectedLemma: string
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error(`LatinCy returned invalid JSON: ${responseText}`);
  }
  if (
    !Array.isArray(parsed) ||
    !Array.isArray(parsed[0]) ||
    typeof parsed[0][1] !== "string" ||
    parsed[0][1].toLowerCase() !== expectedLemma.toLowerCase()
  ) {
    throw new Error(
      `Expected first token lemma '${expectedLemma}', got: ${responseText}`
    );
  }
}

function run(cmd: string, args: readonly string[]): string {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runInherit(cmd: string, args: readonly string[]): void {
  execFileSync(cmd, args, { stdio: "inherit" });
}

function tryRun(cmd: string, args: readonly string[]): string | null {
  try {
    return run(cmd, args);
  } catch {
    return null;
  }
}

export function treeImageRef(name: HelperImageName, ref = "HEAD"): string {
  const { contextDir } = HELPER_IMAGES[name];
  const dirSha = run("git", ["rev-parse", `${ref}:${contextDir}`]);
  const scriptSha = run("git", ["rev-parse", `${ref}:${SCRIPT_PATH}`]);
  const hash = computeTreeHash(dirSha, scriptSha);
  return `${REGISTRY_PREFIX}/${name}:tree-${hash}`;
}

function imageExistsInRegistry(imageRef: string): boolean {
  return tryRun("docker", ["manifest", "inspect", imageRef]) !== null;
}

/**
 * Ensures `morcus-latincy:archive-2026-01-25` exists in GHCR so the base image
 * referenced by `src/py/latincy/Dockerfile` is never garbage-collected.
 */
function ensureLatincyArchiveTag(): void {
  const repo = `${REGISTRY_PREFIX}/morcus-latincy`;
  const archiveRef = `${repo}:${LATINCY_ARCHIVE_TAG}`;
  if (imageExistsInRegistry(archiveRef)) {
    return;
  }
  console.log(
    `Creating archive tag ${archiveRef} -> ${LATINCY_ARCHIVE_DIGEST}`
  );
  runInherit("docker", [
    "buildx",
    "imagetools",
    "create",
    "-t",
    archiveRef,
    `${repo}@${LATINCY_ARCHIVE_DIGEST}`,
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpsGetInsecure(
  url: string,
  hostHeader: string
): Promise<{ statusCode: number; body: string }> {
  const agent = new Agent({ rejectUnauthorized: false });
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      { agent, headers: { Host: hostHeader }, timeout: 5000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }
    );
    req.on("timeout", () => req.destroy(new Error("HTTPS request timed out")));
    req.on("error", reject);
    req.end();
  });
}

/**
 * Starts `morcus-proxy` against a stub `prod` container on an isolated Docker
 * network (with no `dev` container running, which also verifies nginx boots
 * when the optional `staging` profile is disabled) and checks HTTPS routing.
 */
async function smokeTestProxy(imageRef: string): Promise<void> {
  const tmpDir = mkdtempSync(join(tmpdir(), "morcus-proxy-test-"));
  const certPath = join(tmpDir, "cert.pem");
  const keyPath = join(tmpDir, "key.pem");
  const accessLog = join(tmpDir, "access.log");
  const errorLog = join(tmpDir, "error.log");

  // Clean up any leftover containers/network from an interrupted local run.
  tryRun("docker", ["rm", "-f", "proxy-test", "prod"]);
  tryRun("docker", ["network", "rm", "proxy-test-net"]);

  try {
    run("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-sha256",
      "-days",
      "1",
      "-nodes",
      "-subj",
      "/CN=prod.test",
    ]);
    writeFileSync(accessLog, "");
    writeFileSync(errorLog, "");

    run("docker", ["network", "create", "proxy-test-net"]);
    const stubConf =
      'server { listen 5757; location / { return 200 "ok-from-prod\\n"; } }';
    run("docker", [
      "run",
      "-d",
      "--name",
      "prod",
      "--network",
      "proxy-test-net",
      STUB_NGINX_IMAGE,
      "sh",
      "-c",
      `printf '${stubConf}' > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'`,
    ]);

    run("docker", [
      "run",
      "-d",
      "--name",
      "proxy-test",
      "--network",
      "proxy-test-net",
      "-p",
      "127.0.0.1:8443:443",
      "-e",
      "PROD_HOST_NAMES=prod.test",
      "-e",
      "DEV_HOST_NAMES=dev.test",
      "-e",
      "HTTP_PORT=80",
      "-v",
      `${certPath}:/run/secrets/ssl_cert:ro`,
      "-v",
      `${keyPath}:/run/secrets/ssl_private_key:ro`,
      "-v",
      `${accessLog}:/morcus/access.log:rw`,
      "-v",
      `${errorLog}:/morcus/error.log:rw`,
      imageRef,
    ]);

    let response: { statusCode: number; body: string } | null = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        response = await httpsGetInsecure(
          "https://127.0.0.1:8443/",
          "prod.test"
        );
        break;
      } catch {
        await sleep(1000);
      }
    }
    if (
      response === null ||
      response.statusCode !== 200 ||
      response.body.trim() !== "ok-from-prod"
    ) {
      const logs = tryRun("docker", ["logs", "proxy-test"]) ?? "";
      throw new Error(
        `Proxy smoke test failed; got ${JSON.stringify(
          response
        )}. Logs:\n${logs}`
      );
    }
    console.log("morcus-proxy smoke test passed.");
  } finally {
    tryRun("docker", ["rm", "-f", "proxy-test", "prod"]);
    tryRun("docker", ["network", "rm", "proxy-test-net"]);
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Starts `morcus-latincy` and verifies the sample request from its README
 * returns the expected lemma ("Gallia").
 */
async function smokeTestLatincy(imageRef: string): Promise<void> {
  tryRun("docker", ["rm", "-f", "latincy-test"]);
  try {
    run("docker", [
      "run",
      "-d",
      "--name",
      "latincy-test",
      "-p",
      "127.0.0.1:5758:8000",
      imageRef,
    ]);

    for (let attempt = 0; attempt < 30; attempt++) {
      let res: Response;
      let text: string;
      try {
        res = await fetch("http://127.0.0.1:5758/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            words: ["Gallia", " ", "est"],
            spaces: [false, true, false],
          }),
          signal: AbortSignal.timeout(5000),
        });
        text = await res.text();
      } catch {
        // Server still loading model; retry.
        await sleep(2000);
        continue;
      }

      if (!res.ok) {
        const logs = tryRun("docker", ["logs", "latincy-test"]) ?? "";
        throw new Error(
          `LatinCy returned HTTP ${res.status}: ${text}\nLogs:\n${logs}`
        );
      }
      console.log(`LatinCy response: ${text}`);
      assertLatincyLemma(text, "Gallia");
      console.log("morcus-latincy smoke test passed.");
      return;
    }
    const logs = tryRun("docker", ["logs", "latincy-test"]) ?? "";
    throw new Error(`morcus-latincy failed to respond within 60s:\n${logs}`);
  } finally {
    tryRun("docker", ["rm", "-f", "latincy-test"]);
  }
}

async function buildHelperImage(
  name: HelperImageName,
  shouldPush: boolean
): Promise<void> {
  if (shouldPush && name === "morcus-latincy") {
    ensureLatincyArchiveTag();
  }

  const tag = treeImageRef(name);
  if (imageExistsInRegistry(tag)) {
    console.log(`${tag} already exists in registry; nothing to build.`);
    return;
  }

  const { contextDir } = HELPER_IMAGES[name];
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const repo = process.env.GITHUB_REPOSITORY || "nkprasad12/morcus-net";
  const revision = run("git", ["rev-parse", "HEAD"]);
  const created = new Date().toISOString();

  console.log(`Building ${tag} from ${contextDir}...`);
  runInherit("docker", [
    "build",
    contextDir,
    "--tag",
    tag,
    "--label",
    `org.opencontainers.image.source=${serverUrl}/${repo}`,
    "--label",
    `org.opencontainers.image.revision=${revision}`,
    "--label",
    `org.opencontainers.image.created=${created}`,
  ]);

  if (name === "morcus-proxy") {
    await smokeTestProxy(tag);
  } else {
    await smokeTestLatincy(tag);
  }

  if (!shouldPush) {
    console.log(
      `Smoke test passed for ${tag} (PR mode; skipping registry push).`
    );
    return;
  }

  console.log(`Pushing ${tag}...`);
  runInherit("docker", ["push", tag]);
}

function inspectDigest(imageRef: string): string | null {
  return tryRun("docker", [
    "buildx",
    "imagetools",
    "inspect",
    imageRef,
    "--format",
    "{{json .Manifest.Digest}}",
  ]);
}

async function waitForCandidateDigest(candidate: string): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const digest = inspectDigest(candidate);
    if (digest) {
      return digest;
    }
    console.log(`Waiting for ${candidate} to appear in registry...`);
    await sleep(10000);
  }
  throw new Error(
    `Candidate image ${candidate} not found in registry after 2 minutes.`
  );
}

async function promoteAll(): Promise<void> {
  for (const name of ALL_HELPER_IMAGE_NAMES) {
    const repo = `${REGISTRY_PREFIX}/${name}`;
    const candidate = treeImageRef(name);
    const latest = `${repo}:latest`;
    const previous = `${repo}:previous`;

    const candidateDigest = await waitForCandidateDigest(candidate);
    const latestDigest = inspectDigest(latest);
    if (candidateDigest === latestDigest) {
      console.log(
        `${latest} is already at ${candidate} (${candidateDigest}); skipping.`
      );
      continue;
    }
    if (latestDigest) {
      console.log(`Backing up ${latest} -> ${previous}`);
      runInherit("docker", [
        "buildx",
        "imagetools",
        "create",
        "-t",
        previous,
        latest,
      ]);
    }
    console.log(`Promoting ${candidate} -> ${latest}`);
    runInherit("docker", [
      "buildx",
      "imagetools",
      "create",
      "-t",
      latest,
      candidate,
    ]);
  }
}

async function main(): Promise<void> {
  const [, , command, arg] = process.argv;
  if (command === "build-and-test" || command === "build-and-push") {
    if (!arg || !isHelperImageName(arg)) {
      throw new Error(
        `Usage: helper_images.ts ${command} <${ALL_HELPER_IMAGE_NAMES.join(
          "|"
        )}>`
      );
    }
    await buildHelperImage(arg, command === "build-and-push");
  } else if (command === "promote") {
    await promoteAll();
  } else {
    throw new Error(
      "Usage: helper_images.ts {build-and-test|build-and-push} <morcus-proxy|morcus-latincy> | promote"
    );
  }
}

/* istanbul ignore next */
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
