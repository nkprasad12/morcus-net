/* istanbul ignore file */

// This can only be run by Bun, for now.

import { Worker, parentPort, workerData } from "node:worker_threads";

import { envVar } from "@/common/env_vars";
import { SqlDict } from "@/common/dictionaries/dict_storage";
import { GenerateLs } from "@/common/lewis_and_short/ls_generate";
import { writeFileSync, existsSync } from "fs";
import { spawnSync } from "node:child_process";

declare const $PRODUCER: any;

interface Bounds {
  start: number;
  end?: number;
}

async function writeFileAndWaitUntilExists(path: string, contents: string) {
  writeFileSync(path, contents, { flag: "w" });
  while (!existsSync(path)) {
    await new Promise<void>((r) => setTimeout(r, 50));
  }
}

function startWorker<WorkerData, $O>(
  workerData: WorkerData,
  workerFile: string
): Promise<$O[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerFile, {
      workerData,
    });
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0)
        reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

async function runMain<$O>(
  consumer: (outputs: $O[]) => any,
  threads: number,
  rows: number,
  workerFile: string
) {
  const partials: Promise<$O[]>[] = [];
  const chunkSize = Math.round(rows / threads);
  for (let i = 1; i <= threads; i++) {
    const start = (i - 1) * chunkSize;
    const end = i === threads ? undefined : i * chunkSize;
    partials.push(startWorker({ start, end }, workerFile));
  }
  const results = await Promise.all(partials);
  return consumer(results.flatMap((x) => x));
}

const runWorker = (producer: (data: Bounds) => any[] = $PRODUCER) => {
  const data: Bounds = workerData;
  console.log(data);
  parentPort?.postMessage(producer(data));
};

export async function multithreadedComputation<$O>(
  producer: (data: Bounds) => $O[],
  consumer: (input: $O[]) => any,
  options: { threads: number; rows: number }
) {
  const workerFile = `./worker.tmp.ts`;
  spawnSync(`touch`, [workerFile]);
  // This should work, but it doesn't.
  // What we need to do is write the file
  const workerParts = [
    `import { parentPort, workerData } from "worker_threads"`,
    `import { envVar } from "@/common/assert"`,
    `import { GenerateLs } from "@/common/lewis_and_short/ls_generate"`,
    `const $PRODUCER = ${producer.toString()}`,
    `const $RUN = ${runWorker.toString()}`,
    `$RUN()`,
  ];
  await writeFileAndWaitUntilExists(workerFile, workerParts.join(";\n"));
  try {
    await runMain(consumer, options.threads, options.rows, workerFile);
  } catch (err) {
    console.log(err);
  }
  // We should delete this, but apparently we can only
  // read files that already exists before the process
  // was created.
  // rmSync(workerFile);
}

multithreadedComputation(
  (bounds) =>
    GenerateLs.processPerseusXml(envVar("LS_PATH"), bounds.start, bounds.end),
  (results) => SqlDict.save(results, envVar("LS_PROCESSED_PATH")),
  { threads: 2, rows: 51635 }
);
