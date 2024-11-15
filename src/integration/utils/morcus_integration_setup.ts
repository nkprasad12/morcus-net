/* istanbul ignore file */

import { setEnv } from "@/integration/utils/set_test_env";
import { checkPresent } from "@/common/assert";
import { spawnSync, type SpawnSyncReturns } from "child_process";
import { prodBuildSteps } from "@/scripts/prod_build_steps";
import { startMorcusServer } from "@/start_server";
import { randomUUID } from "crypto";
import fs from "fs";

type Closer = () => Promise<void>;

const CONTAINER_BASE = "morcus-integration-test";

function errorWithOutAndErr(
  message: string,
  process: SpawnSyncReturns<Buffer>
): Error {
  const stdout = process.stdout.toString();
  const stderr = process.stderr.toString();
  const lines = ["***", message, "***", "OUT:", stdout, "ERR:", stderr];
  return new Error(lines.join("\n"));
}

/** Starts up the Morcus server from a Docker image. */
export function startMorcusFromDocker(): Promise<Closer> {
  const imageTag = checkPresent(process.env.IMAGE_TAG);
  const imageName = `ghcr.io/nkprasad12/morcus:${imageTag}`;
  const containerName = CONTAINER_BASE + randomUUID();
  const container = `docker run -dp 127.0.0.1:1337:5757 --name ${containerName} ${imageName}`;
  const close: Closer = async () => {
    try {
      spawnSync("docker", ["stop", containerName]);
      spawnSync("docker", ["rm", containerName]);
    } catch {}
  };
  const startContainer = spawnSync(container, { shell: true });
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const callback = () => {
      if (startContainer.status !== 0) {
        reject(
          errorWithOutAndErr("Failed to start container.", startContainer)
        );
        return;
      }
      const logs = spawnSync("docker", ["logs", containerName]);
      if (logs.status !== 0) {
        close();
        reject(
          errorWithOutAndErr("Starting morcus from docker image failed.", logs)
        );
        return;
      }
      const stdout = logs.stdout.toString();
      console.log(stdout);
      if (stdout.includes(":5757")) {
        resolve(close);
        return;
      }
      if (performance.now() - start > 2000) {
        close();
        reject(errorWithOutAndErr("Timed out starting morcus server.", logs));
        return;
      }
      setTimeout(callback, 250);
    };
    callback();
  });
}

export async function setupMorcus(
  reuseDev: boolean,
  port: string,
  testDir: string
): Promise<Closer> {
  fs.mkdirSync(testDir, { recursive: true });
  setEnv(reuseDev, port, testDir);
  if (!reuseDev) {
    expect(await prodBuildSteps()).toBe(true);
  }
  const morcusServer = startMorcusServer();
  return () =>
    morcusServer.then((s) => {
      fs.rmSync(testDir, { recursive: true });
      return new Promise((resolve) => {
        s.close(() => resolve());
      });
    });
}

export function setupMorcusBackendWithCleanup(
  fromDocker: boolean,
  reuseDev: boolean,
  port: string,
  testTmpDir: string
) {
  let morcusCloser: Closer | undefined = undefined;
  beforeAll(async () => {
    if (fromDocker) {
      morcusCloser = await startMorcusFromDocker();
      return;
    }
    morcusCloser = await setupMorcus(reuseDev, port, testTmpDir);
  }, 180000);

  afterAll(async () => {
    if (morcusCloser !== undefined) {
      await morcusCloser();
    }
  }, 10000);
}
