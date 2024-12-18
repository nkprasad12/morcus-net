/* istanbul ignore file */

import { checkPresent } from "@/common/assert";
import { spawnSync, type SpawnSyncReturns } from "child_process";
import { randomUUID } from "crypto";

type Closer = () => void;

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
export function startMorcusFromDocker(): Promise<() => void> {
  const imageTag = checkPresent(process.env.IMAGE_TAG);
  const imageName = `ghcr.io/nkprasad12/morcus:${imageTag}`;
  console.log("Using image %s", imageName);
  const containerName = CONTAINER_BASE + randomUUID();
  const container = `docker run -dp 127.0.0.1:1337:5757 --name ${containerName} ${imageName}`;
  console.log("Starting container: `%s`", container);
  const close: Closer = () => {
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
      if (performance.now() - start > 5000) {
        close();
        reject(errorWithOutAndErr("Timed out starting morcus server.", logs));
        return;
      }
      setTimeout(callback, 250);
    };
    callback();
  });
}
