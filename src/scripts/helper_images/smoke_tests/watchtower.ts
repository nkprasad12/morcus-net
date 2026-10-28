import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequestNode } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, sleep, tryRun } from "@/scripts/helper_images/docker";

const REGISTRY_IMAGE =
  "registry:3.1.2@sha256:d4032d4cc323c1731c707931ecada07a53076eac38e3b61ae57533f170f2c6c3";
const STUB_BASE_IMAGE =
  "busybox:1.38.0@sha256:fd7dc98638c8e305f4dc34e979f1c0fdfdcaeb0fbf8fcff77ae834b6da3d7e6e";

const REGISTRY_CONTAINER = "wt-smoke-registry";
const APP_CONTAINER = "wt-smoke-app";
const UNLABELED_CONTAINER = "wt-smoke-unlabeled";
const STATIC_CONTAINER = "wt-smoke-static";
const WATCHTOWER_CONTAINER = "wt-smoke-watchtower";

const APP_STOP_TIMEOUT_S = 3;
const REGISTRY_STARTUP_TIMEOUT_MS = 30_000;
const WATCHTOWER_RUN_TIMEOUT_MS = 120_000;

export interface LogEntry {
  readonly [key: string]: unknown;
}

export interface LogProblemOptions {
  readonly version: string;
  readonly container: string;
  readonly stopTimeoutS: number;
}

interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: Buffer;
}

function httpRequest(
  method: string,
  urlStr: string,
  headers: Record<string, string> = {},
  body?: Buffer | string,
  timeoutMs = 5000
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = httpRequestNode(
      url,
      {
        method,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(
        new Error(`HTTP ${method} ${urlStr} timed out after ${timeoutMs}ms`)
      );
    });
    req.on("error", reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Extracts the pinned upstream version (e.g. `1.23.2`) from the `FROM` line of
 * `src/devops/watchtower/Dockerfile`.
 */
export function pinnedWatchtowerVersion(
  dockerfileContent?: string | Buffer
): string {
  const content =
    dockerfileContent !== undefined
      ? typeof dockerfileContent === "string"
        ? dockerfileContent
        : dockerfileContent.toString("utf8")
      : readFileSync("src/devops/watchtower/Dockerfile", "utf8");
  const match =
    /^FROM ghcr\.io\/nicholas-fedor\/watchtower:(\S+)@sha256:[0-9a-f]{64}\s*$/m.exec(
      content
    );
  if (!match) {
    throw new Error(
      "Could not find a digest-pinned `FROM ghcr.io/nicholas-fedor/watchtower:<version>@sha256:<digest>` line in the Dockerfile"
    );
  }
  return match[1];
}

function isLogEntry(value: unknown): value is LogEntry {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parses raw zerolog JSON output line by line, skipping non-JSON or non-object lines.
 */
export function parseJsonLogs(output: string): readonly LogEntry[] {
  const entries: LogEntry[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (isLogEntry(parsed)) {
          entries.push(parsed);
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  }
  return entries;
}

/**
 * Verifies that the JSON logs from a Watchtower run conform to expected behaviour
 * and contain no errors.
 */
export function findLogProblems(
  entries: readonly LogEntry[],
  options: LogProblemOptions
): string[] {
  const problems: string[] = [];

  for (const entry of entries) {
    const level =
      typeof entry.level === "string" ? entry.level.toLowerCase() : "";
    if (level === "error" || level === "fatal" || level === "panic") {
      problems.push(`Log entry with level ${level}: ${JSON.stringify(entry)}`);
    }
  }

  // Upstream logs "Watchtower <version> using Docker API v<api>".
  const expectedStartup = `Watchtower ${options.version} `;
  const startupEntry = entries.find(
    (e) => typeof e.message === "string" && e.message.startsWith("Watchtower ")
  );
  if (!startupEntry) {
    problems.push('No log entry starting with "Watchtower " found');
  } else if (
    typeof startupEntry.message === "string" &&
    !startupEntry.message.startsWith(expectedStartup)
  ) {
    problems.push(
      `Startup log message does not start with "${expectedStartup}": ${startupEntry.message}`
    );
  }

  const stoppingEntry = entries.find((e) => {
    if (e.message !== "Stopping container") {
      return false;
    }
    const entryContainer =
      typeof e.container === "string" ? e.container.replace(/^\//, "") : "";
    return entryContainer === options.container;
  });
  if (!stoppingEntry) {
    problems.push(
      `No "Stopping container" log entry found for container "${options.container}"`
    );
  } else {
    const expectedTimeout = options.stopTimeoutS * 1000;
    if (stoppingEntry.timeout !== expectedTimeout) {
      problems.push(
        `Stopping container expected timeout ${expectedTimeout}, got ${String(
          stoppingEntry.timeout
        )}`
      );
    }
  }

  const sessionEntry = entries.find(
    (e) => e.message === "Update session completed"
  );
  if (!sessionEntry) {
    problems.push('Missing "Update session completed" log entry');
  } else {
    if (sessionEntry.updated !== 1) {
      problems.push(
        `Update session expected updated === 1, got ${String(
          sessionEntry.updated
        )}`
      );
    }
    if (sessionEntry.failed !== 0) {
      problems.push(
        `Update session expected failed === 0, got ${String(
          sessionEntry.failed
        )}`
      );
    }
  }

  return problems;
}

function cleanUp(): void {
  tryRun("docker", [
    "rm",
    "-f",
    "-v",
    WATCHTOWER_CONTAINER,
    APP_CONTAINER,
    UNLABELED_CONTAINER,
    STATIC_CONTAINER,
    REGISTRY_CONTAINER,
  ]);
  const ids = tryRun("docker", [
    "image",
    "ls",
    "-q",
    "--filter",
    "label=morcus.wt-smoke",
  ]);
  if (ids) {
    const uniqueIds = Array.from(
      new Set(
        ids
          .split(/\s+/)
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      )
    );
    if (uniqueIds.length > 0) {
      tryRun("docker", ["image", "rm", "-f", ...uniqueIds]);
    }
  }
}

interface ContainerState {
  readonly id: string;
  readonly imageId: string;
  readonly running: boolean;
}

function containerState(name: string): ContainerState | null {
  const out = tryRun("docker", [
    "container",
    "inspect",
    "--format",
    "{{.Id}} {{.Image}} {{.State.Running}}",
    name,
  ]);
  if (out === null) {
    return null;
  }
  const [id, imageId, running] = out.trim().split(/\s+/);
  return { id, imageId, running: running === "true" };
}

function readMarker(container: string): string | null {
  const marker = tryRun("docker", ["exec", container, "cat", "/marker"]);
  return marker === null ? null : marker.trim();
}

/**
 * Smoke-tests `morcus-watchtower` with the same settings as the `watchtower`
 * service in `docker-compose.yaml`, against a local registry and three stub
 * containers:
 * - `wt-smoke-app`: labelled, and its tag moves to a new image. It must be
 *   recreated from the new image, with its own 3s stop timeout, and the old
 *   image must be deleted (`WATCHTOWER_CLEANUP`).
 * - `wt-smoke-unlabeled`: not labelled, and its tag also moves. It must be left
 *   alone (`WATCHTOWER_LABEL_ENABLE`).
 * - `wt-smoke-static`: labelled, but its tag doesn't move. It must not be
 *   recreated.
 *
 * New images are published under `:latest` by copying the manifest inside the
 * registry, so the local `:latest` (and the old image's RepoDigests, under the
 * containerd image store) stay on the old image.
 */
export async function smokeTestWatchtower(imageRef: string): Promise<void> {
  const version = pinnedWatchtowerVersion();
  cleanUp();

  const tmpDir = mkdtempSync(join(tmpdir(), "wt-smoke-"));

  try {
    const stubDockerfile = [
      `FROM ${STUB_BASE_IMAGE}`,
      "ARG MARKER",
      'RUN echo "$MARKER" > /marker',
      'CMD ["sh", "-c", "trap \'exit 0\' TERM; while :; do sleep 1; done"]',
      "",
    ].join("\n");
    writeFileSync(join(tmpDir, "Dockerfile"), stubDockerfile);

    run("docker", [
      "run",
      "-d",
      "--name",
      REGISTRY_CONTAINER,
      "-p",
      "127.0.0.1::5000",
      REGISTRY_IMAGE,
    ]);

    const portOutput = run("docker", ["port", REGISTRY_CONTAINER, "5000/tcp"]);
    const firstLine = portOutput.split("\n")[0].trim();
    const portMatch = /:(\d+)$/.exec(firstLine);
    if (!portMatch) {
      throw new Error(
        `Could not parse port from docker port output: ${portOutput}`
      );
    }
    const registryPort = portMatch[1];
    const registryBaseUrl = `http://127.0.0.1:${registryPort}`;
    const registryHost = `127.0.0.1:${registryPort}`;

    const deadline = Date.now() + REGISTRY_STARTUP_TIMEOUT_MS;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const res = await httpRequest("GET", `${registryBaseUrl}/v2/`);
        if (res.status === 200) {
          ready = true;
          break;
        }
      } catch {
        // Retry while registry starts up
      }
      await sleep(250);
    }
    if (!ready) {
      throw new Error(
        `Registry did not become ready within ${
          REGISTRY_STARTUP_TIMEOUT_MS / 1000
        }s at ${registryBaseUrl}/v2/`
      );
    }

    /** Builds a stub image whose /marker is `marker`, and pushes it. */
    function buildAndPush(repo: string, tag: string, marker: string): string {
      const ref = `${registryHost}/${repo}:${tag}`;
      run("docker", [
        "build",
        "--build-arg",
        `MARKER=${marker}`,
        "--label",
        "morcus.wt-smoke=1",
        "-t",
        ref,
        tmpDir,
      ]);
      run("docker", ["push", ref]);
      return run("docker", ["image", "inspect", "--format", "{{.Id}}", ref]);
    }

    /** Points `repo:latest` at `repo:fromTag`, inside the registry only. */
    async function retagInRegistry(
      repo: string,
      fromTag: string
    ): Promise<void> {
      const acceptHeader = [
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.v2+json",
      ].join(", ");
      const manifestRes = await httpRequest(
        "GET",
        `${registryBaseUrl}/v2/${repo}/manifests/${fromTag}`,
        { Accept: acceptHeader }
      );
      if (manifestRes.status !== 200) {
        throw new Error(
          `Failed to fetch ${repo}:${fromTag} manifest from registry: HTTP ${
            manifestRes.status
          } ${manifestRes.body.toString("utf8")}`
        );
      }
      const contentType = manifestRes.headers["content-type"];
      if (!contentType || typeof contentType !== "string") {
        throw new Error(
          "Missing or invalid Content-Type in registry manifest response"
        );
      }
      const putRes = await httpRequest(
        "PUT",
        `${registryBaseUrl}/v2/${repo}/manifests/latest`,
        { "Content-Type": contentType },
        manifestRes.body
      );
      if (putRes.status !== 201) {
        throw new Error(
          `Failed to retag ${repo}:${fromTag} to latest in registry: HTTP ${
            putRes.status
          } ${putRes.body.toString("utf8")}`
        );
      }
    }

    function startStub(name: string, repo: string, labelled: boolean): void {
      run("docker", [
        "run",
        "-d",
        "--name",
        name,
        ...(labelled
          ? ["--label", "com.centurylinklabs.watchtower.enable=true"]
          : []),
        "--stop-timeout",
        String(APP_STOP_TIMEOUT_S),
        `${registryHost}/${repo}:latest`,
      ]);
    }

    function requireState(name: string): ContainerState {
      const state = containerState(name);
      if (state === null) {
        throw new Error(`Guard failed: docker container inspect ${name}`);
      }
      return state;
    }

    // v1 of each stub, running from `:latest`.
    const v1Id = buildAndPush("wt-smoke/app", "latest", "v1");
    buildAndPush("wt-smoke/unlabeled", "latest", "u1");
    buildAndPush("wt-smoke/static", "latest", "s1");
    startStub(APP_CONTAINER, "wt-smoke/app", true);
    startStub(UNLABELED_CONTAINER, "wt-smoke/unlabeled", false);
    startStub(STATIC_CONTAINER, "wt-smoke/static", true);
    const appBefore = requireState(APP_CONTAINER);
    const unlabeledBefore = requireState(UNLABELED_CONTAINER);
    const staticBefore = requireState(STATIC_CONTAINER);
    if (appBefore.imageId !== v1Id || readMarker(APP_CONTAINER) !== "v1") {
      throw new Error(`Guard failed: ${APP_CONTAINER} isn't running v1`);
    }

    // Move `:latest` to a new image for the app and the unlabeled stub (not
    // the static one).
    const v2Id = buildAndPush("wt-smoke/app", "v2", "v2");
    await retagInRegistry("wt-smoke/app", "v2");
    buildAndPush("wt-smoke/unlabeled", "u2", "u2");
    await retagInRegistry("wt-smoke/unlabeled", "u2");
    // So that Watchtower has to pull v2 itself.
    run("docker", ["image", "rm", "-f", v2Id]);

    // Guards before running Watchtower
    const currentLatestId = run("docker", [
      "image",
      "inspect",
      "--format",
      "{{.Id}}",
      `${registryHost}/wt-smoke/app:latest`,
    ]);
    if (currentLatestId !== v1Id) {
      throw new Error(
        `Guard failed: local :latest image id changed from ${v1Id} to ${currentLatestId}`
      );
    }
    if (tryRun("docker", ["image", "inspect", v2Id]) !== null) {
      throw new Error(`Guard failed: v2 image ${v2Id} still exists locally`);
    }

    const watchtowerArgs = [
      "run",
      "--rm",
      "--name",
      WATCHTOWER_CONTAINER,
      // Watchtower checks the registry at 127.0.0.1:<port> itself.
      "--network",
      "host",
      "-v",
      "/var/run/docker.sock:/var/run/docker.sock",
      // The same settings as the `watchtower` service in docker-compose.yaml.
      "-e",
      "WATCHTOWER_POLL_INTERVAL=75",
      "-e",
      "WATCHTOWER_LABEL_ENABLE=true",
      "-e",
      "WATCHTOWER_CLEANUP=true",
      imageRef,
      "--run-once",
      // The local registry speaks plain HTTP; without the flag Watchtower's HEAD
      // digest check uses HTTPS, fails, and falls back to a full pull, so the
      // digest path production uses against GHCR wouldn't be exercised. The flag
      // only switches the scheme to HTTP and skips TLS verification; production
      // doesn't set it.
      "--registry-tls-skip",
      "--log-format",
      "json",
      // Only ever consider the stubs, even on a machine with real labelled
      // containers. Watchtower applies the label filter on top of this list.
      APP_CONTAINER,
      UNLABELED_CONTAINER,
      STATIC_CONTAINER,
    ];

    const res = spawnSync("docker", watchtowerArgs, {
      encoding: "utf8",
      timeout: WATCHTOWER_RUN_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });

    let output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
    if (res.error) {
      const containerLogs =
        tryRun("docker", ["logs", WATCHTOWER_CONTAINER]) ?? "";
      if (containerLogs) {
        output += `\n--- container logs ---\n${containerLogs}`;
      }
      throw new Error(
        `Watchtower run failed: ${res.error.message}\n--- output ---\n${output}`
      );
    }

    const problems: string[] = [];

    if (res.status !== 0) {
      problems.push(
        `Watchtower exited with code ${String(res.status)} (expected 0)`
      );
    }

    const logEntries = parseJsonLogs(output);
    const logProblems = findLogProblems(logEntries, {
      version,
      container: APP_CONTAINER,
      stopTimeoutS: APP_STOP_TIMEOUT_S,
    });
    problems.push(...logProblems);

    // The labelled stub whose tag moved: recreated from v2, old image deleted.
    const appAfter = containerState(APP_CONTAINER);
    if (appAfter === null) {
      problems.push(`docker container inspect ${APP_CONTAINER} failed`);
    } else {
      if (!appAfter.running) {
        problems.push(`Container ${APP_CONTAINER} is not running`);
      }
      if (appAfter.imageId === v1Id) {
        problems.push(
          `Container ${APP_CONTAINER} is still running old image ${v1Id}`
        );
      }
    }
    const marker = readMarker(APP_CONTAINER);
    if (marker !== "v2") {
      problems.push(
        `Expected /marker in ${APP_CONTAINER} to be "v2", got ${JSON.stringify(
          marker
        )}`
      );
    }
    if (tryRun("docker", ["image", "inspect", v1Id]) !== null) {
      problems.push(
        `Old image ${v1Id} was not cleaned up (WATCHTOWER_CLEANUP failed)`
      );
    }

    // The other two must be untouched: same container, same image, running.
    for (const [name, before, why] of [
      [UNLABELED_CONTAINER, unlabeledBefore, "it isn't labelled"],
      [STATIC_CONTAINER, staticBefore, "its image didn't change"],
    ] as const) {
      const after = containerState(name);
      if (
        after === null ||
        after.id !== before.id ||
        after.imageId !== before.imageId ||
        !after.running
      ) {
        problems.push(
          `Container ${name} was changed, but ${why}: before ${JSON.stringify(
            before
          )}, after ${JSON.stringify(after)}`
        );
      }
    }

    if (problems.length > 0) {
      throw new Error(
        `Watchtower smoke test failed with ${
          problems.length
        } problem(s):\n${problems
          .map((p) => `- ${p}`)
          .join("\n")}\n--- Watchtower output ---\n${output}`
      );
    }

    console.log("morcus-watchtower smoke test passed.");
  } finally {
    cleanUp();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
