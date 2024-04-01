/* istanbul ignore file */

import { setEnv } from "@/integration/utils/set_test_env";
import { checkPresent } from "@/common/assert";
import { spawnSync } from "child_process";
import { prodBuildSteps } from "@/scripts/prod_build_steps";
import { startMorcusServer } from "@/start_server";
import fs from "fs";

type Closer = () => Promise<void>;

const CONTAINER_NAME = "server-integration-test-morcus-container";

/** Starts up the Morcus server from a Docker image. */
export function startMorcusFromDocker(): Promise<Closer> {
  const imageTag = checkPresent(process.env.IMAGE_TAG);
  const imageName = `ghcr.io/nkprasad12/morcus:${imageTag}`;
  const container = `docker run -dp 127.0.0.1:1337:5757 --name ${CONTAINER_NAME} ${imageName}`;
  const close: Closer = async () => {
    try {
      spawnSync("docker", ["stop", CONTAINER_NAME]);
      spawnSync("docker", ["rm", CONTAINER_NAME]);
    } catch {}
  };
  spawnSync(container, { shell: true, stdio: "inherit" });
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const callback = () => {
      const logs = spawnSync("docker", ["logs", CONTAINER_NAME]);
      if (logs.status !== 0) {
        close();
        reject(Error("Starting morcus from docker image failed."));
        return;
      }
      const stdout = logs.stdout.toString();
      if (stdout.includes(":5757")) {
        resolve(close);
        return;
      }
      if (performance.now() - start > 2000) {
        close();
        reject(Error("Timed out starting morcus server."));
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
