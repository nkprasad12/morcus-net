/* istanbul ignore file */

// This can only be run by Bun, for now.

import { Worker, parentPort, workerData } from "node:worker_threads";

import { envVar } from "@/common/env_vars";
import { SqliteDict } from "@/common/dictionaries/sqlite_backing";
import { GenerateLs } from "@/common/lewis_and_short/ls_generate";

declare const $PRODUCER: any;

interface Bounds {
  start: number;
  end?: number;
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
  consumer: (outputs: $O[]) => unknown,
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

const runWorker = (producer: (data: Bounds) => unknown[] = $PRODUCER) => {
  const data: Bounds = workerData;
  parentPort?.postMessage(producer(data));
};

export async function multithreadedComputation<$O>(
  producer: (data: Bounds) => $O[],
  consumer: (input: $O[]) => unknown,
  options: { threads: number; rows: number }
) {
  const workerLogic = `import { parentPort, workerData } from "worker_threads"
    import { envVar } from "@/common/env_vars"
    import { GenerateLs } from "@/common/lewis_and_short/ls_generate"
    const $PRODUCER = ${producer.toString()}
    const $RUN = ${runWorker.toString()}
    $RUN()`;
  const blob = new Blob([workerLogic], { type: "text/javascript" });
  const workerScript = URL.createObjectURL(blob);
  try {
    await runMain(consumer, options.threads, options.rows, workerScript);
  } catch (err) {
    console.log(err);
  }
}

multithreadedComputation(
  (bounds) =>
    GenerateLs.processPerseusXml(envVar("LS_PATH"), bounds.start, bounds.end),
  (results) => SqliteDict.save(results, envVar("LS_PROCESSED_PATH")),
  { threads: 4, rows: 51635 }
);
