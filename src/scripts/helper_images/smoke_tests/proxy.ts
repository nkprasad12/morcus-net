import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { Agent, request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, sleep, tryRun } from "@/scripts/helper_images/docker";

/** Base nginx image used by the stub upstream in `smokeTestProxy`. */
const STUB_NGINX_IMAGE =
  "nginx:1.30.4-alpine-slim@sha256:77da26c31397bf6694b4bf93275f5b40b0b120ba1b8f114264b603e592c561d6";

/**
 * Explicit subnet for `proxy-test-net` so the smoke test can pin container IPs
 * with `--ip` (Docker only allows `--ip` on user-configured subnets) and force
 * an IP change when recreating `prod`. If this subnet clashes on a runner,
 * pick another private range.
 */
const TEST_SUBNET = "172.29.213.0/24";
const PROD_GEN1_IP = "172.29.213.10";
const PROD_GEN2_IP = "172.29.213.11";
const DEV_IP = "172.29.213.20";

const POLL_INTERVAL_MS = 200;
const POLL_REQUEST_TIMEOUT_MS = 500;
const RERESOLVE_TIMEOUT_MS = 5000;

interface StubFields {
  readonly prefix: string;
  readonly gen: number;
  readonly host: string;
  readonly reqs: number;
}

function parseStubResponse(body: string): StubFields | null {
  const trimmed = body.trim();
  const match = /^(ok-from-\S+)\s+gen=(\d+)\s+host=(\S+)\s+reqs=(\d+)$/.exec(
    trimmed
  );
  if (!match) {
    return null;
  }
  return {
    prefix: match[1],
    gen: Number(match[2]),
    host: match[3],
    reqs: Number(match[4]),
  };
}

function httpsGetInsecure(
  url: string,
  hostHeader: string,
  timeoutMs = 5000
): Promise<{ statusCode: number; body: string }> {
  const agent = new Agent({ rejectUnauthorized: false, keepAlive: false });
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      { agent, headers: { Host: hostHeader }, timeout: timeoutMs },
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

function startStubUpstream(
  tmpDir: string,
  name: "prod" | "dev",
  ip: string,
  gen: number
): void {
  const confPath = join(tmpDir, `stub-${name}-gen${gen}.conf`);
  // Note: `$http_host` is used for `host=` because nginx's `$host` strips the
  // `:5757` port from the incoming `Host` header, whereas `$http_host`
  // preserves the exact header (`prod:5757` / `dev:5757`).
  const conf = [
    "server {",
    "  listen 5757;",
    "  location / {",
    `    return 200 "ok-from-${name} gen=${gen} host=$http_host reqs=$connection_requests\\n";`,
    "  }",
    "}",
    "",
  ].join("\n");
  writeFileSync(confPath, conf);
  run("docker", [
    "run",
    "-d",
    "--name",
    name,
    "--network",
    "proxy-test-net",
    "--ip",
    ip,
    "-v",
    `${confPath}:/etc/nginx/conf.d/default.conf:ro`,
    STUB_NGINX_IMAGE,
  ]);
}

function readLogSafe(path: string): string {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

function failWithLogs(
  message: string,
  errorLogPath: string,
  accessLogPath: string
): never {
  const dockerLogs = tryRun("docker", ["logs", "proxy-test"]) ?? "";
  const errorLog = readLogSafe(errorLogPath);
  const accessLog = readLogSafe(accessLogPath);
  throw new Error(
    [
      message,
      `docker logs:\n${dockerLogs}`,
      `error.log:\n${errorLog}`,
      `access.log:\n${accessLog}`,
    ].join("\n")
  );
}

async function pollUntilBackend(
  hostHeader: string,
  expectedPrefix: string,
  expectedGen: number,
  expectedHost: string
): Promise<{
  elapsedMs: number | null;
  totalMs: number;
  lastAttempt: unknown;
}> {
  const start = Date.now();
  let lastAttempt: unknown = null;
  while (Date.now() - start < RERESOLVE_TIMEOUT_MS) {
    try {
      const res = await httpsGetInsecure(
        "https://127.0.0.1:8443/",
        hostHeader,
        POLL_REQUEST_TIMEOUT_MS
      );
      lastAttempt = res;
      const fields =
        res.statusCode === 200 ? parseStubResponse(res.body) : null;
      if (
        fields !== null &&
        fields.prefix === expectedPrefix &&
        fields.gen === expectedGen &&
        fields.host === expectedHost
      ) {
        return {
          elapsedMs: Date.now() - start,
          totalMs: Date.now() - start,
          lastAttempt,
        };
      }
    } catch (err) {
      lastAttempt = String(err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return { elapsedMs: null, totalMs: Date.now() - start, lastAttempt };
}

/**
 * Starts `morcus-proxy` against a stub `prod` container on an isolated Docker
 * network (with no `dev` container running, which also verifies nginx boots
 * when the optional `staging` profile is disabled) and checks:
 *   1. HTTPS routing to `prod` and preserved `Host` header,
 *   2. Upstream keepalive connection reuse,
 *   3. Fast DNS re-resolution when `prod` is recreated at a new IP,
 *   4. Routing to `dev` once it appears after startup.
 */
export async function smokeTestProxy(imageRef: string): Promise<void> {
  const tmpDir = mkdtempSync(join(tmpdir(), "morcus-proxy-test-"));
  const certPath = join(tmpDir, "cert.pem");
  const keyPath = join(tmpDir, "key.pem");
  const accessLog = join(tmpDir, "access.log");
  const errorLog = join(tmpDir, "error.log");

  // Clean up any leftover containers/network from an interrupted local run.
  tryRun("docker", ["rm", "-f", "proxy-test", "prod", "dev"]);
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

    run("docker", [
      "network",
      "create",
      "--subnet",
      TEST_SUBNET,
      "proxy-test-net",
    ]);
    startStubUpstream(tmpDir, "prod", PROD_GEN1_IP, 1);

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
        if (response.statusCode === 200) {
          break;
        }
      } catch {
        // Retry while containers finish starting.
      }
      await sleep(1000);
    }
    if (
      response === null ||
      response.statusCode !== 200 ||
      !response.body.startsWith("ok-from-prod")
    ) {
      failWithLogs(
        `Proxy smoke test failed initial prod check; got ${JSON.stringify(
          response
        )}.`,
        errorLog,
        accessLog
      );
    }

    // 1. Host header check.
    const firstFields = parseStubResponse(response.body);
    if (firstFields === null || firstFields.host !== "prod:5757") {
      failWithLogs(
        `Expected host=prod:5757 in initial prod response; got ${JSON.stringify(
          response.body
        )}.`,
        errorLog,
        accessLog
      );
    }

    // 2. Keepalive check: send sequential requests on new client connections
    // and verify the proxy reuses an upstream connection (`reqs >= 2`).
    const reqCounts: number[] = [firstFields.reqs];
    for (let i = 0; i < 4; i++) {
      let res: { statusCode: number; body: string };
      try {
        res = await httpsGetInsecure("https://127.0.0.1:8443/", "prod.test");
      } catch (err) {
        failWithLogs(
          `Keepalive probe ${i + 1} threw: ${String(err)}`,
          errorLog,
          accessLog
        );
      }
      const fields =
        res.statusCode === 200 ? parseStubResponse(res.body) : null;
      if (fields === null || fields.prefix !== "ok-from-prod") {
        failWithLogs(
          `Keepalive probe ${i + 1} failed; got ${JSON.stringify(res)}.`,
          errorLog,
          accessLog
        );
      }
      reqCounts.push(fields.reqs);
    }
    if (!reqCounts.some((c) => c >= 2)) {
      failWithLogs(
        `Expected upstream keepalive connection reuse (reqs >= 2), but saw reqs=${JSON.stringify(
          reqCounts
        )}.`,
        errorLog,
        accessLog
      );
    }

    // 3. Re-resolution after recreate at a new IP.
    run("docker", ["rm", "-f", "prod"]);
    startStubUpstream(tmpDir, "prod", PROD_GEN2_IP, 2);
    const prodPoll = await pollUntilBackend(
      "prod.test",
      "ok-from-prod",
      2,
      "prod:5757"
    );
    if (prodPoll.elapsedMs === null) {
      failWithLogs(
        `Proxy did not re-resolve recreated prod (gen=2) within ${RERESOLVE_TIMEOUT_MS}ms (elapsed ${
          prodPoll.totalMs
        }ms); last result: ${JSON.stringify(prodPoll.lastAttempt)}.`,
        errorLog,
        accessLog
      );
    }
    console.log(
      `morcus-proxy re-resolved recreated prod in ${prodPoll.elapsedMs}ms.`
    );

    // 4. `dev` appearing after startup (proxy started with no `dev` container).
    startStubUpstream(tmpDir, "dev", DEV_IP, 1);
    const devPoll = await pollUntilBackend(
      "dev.test",
      "ok-from-dev",
      1,
      "dev:5757"
    );
    if (devPoll.elapsedMs === null) {
      failWithLogs(
        `Proxy did not resolve newly started dev within ${RERESOLVE_TIMEOUT_MS}ms (elapsed ${
          devPoll.totalMs
        }ms); last result: ${JSON.stringify(devPoll.lastAttempt)}.`,
        errorLog,
        accessLog
      );
    }
    console.log(
      `morcus-proxy resolved newly started dev in ${devPoll.elapsedMs}ms.`
    );

    console.log("morcus-proxy smoke test passed.");
  } finally {
    tryRun("docker", ["rm", "-f", "proxy-test", "prod", "dev"]);
    tryRun("docker", ["network", "rm", "proxy-test-net"]);
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
