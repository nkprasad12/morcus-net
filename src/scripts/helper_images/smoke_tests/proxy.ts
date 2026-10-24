import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { Agent, request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, sleep, tryRun } from "@/scripts/helper_images/docker";

/** Base nginx image used by the stub upstream in `smokeTestProxy`. */
const STUB_NGINX_IMAGE =
  "nginx:1.30.4-alpine-slim@sha256:77da26c31397bf6694b4bf93275f5b40b0b120ba1b8f114264b603e592c561d6";

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
export async function smokeTestProxy(imageRef: string): Promise<void> {
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
