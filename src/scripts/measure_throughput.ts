/* istanbul ignore file */

/**
 * Simple throughput/latency tester for an HTTP API (TypeScript).
 *
 * Usage (Node 18+):
 *   bun ./src/scripts/measure_throughput.ts --url http://localhost:5757/api/foo --concurrency 2 --duration 10
 *
 * Options:
 *   --url         (required) target URL
 *   --concurrency number of concurrent workers (default 2)
 *   --duration    test duration in seconds (default 10)
 *   --method      e.g. GET or POST
 */

import { checkPresent } from "@/common/assert";
import { argv } from "process";

let stop = false;

process.on("SIGINT", () => {
  stop = true;
});

interface Args {
  url: string;
  concurrency: number;
  duration: number;
  method: string;
}

function getHeaders(): Headers {
  const headers = new Headers();
  headers.set("accept-encoding", "gzip");
  headers.set("content-type", "application/json");
  return headers;
}

function parseArgs(): Args {
  const out: Record<string, string | undefined> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    out[key] = argv[++i];
  }
  const url = checkPresent(out.url, "Missing --url");
  const method = out.method ?? "GET";
  const concurrency = Number(
    out.concurrency === undefined ? "2" : out.concurrency
  );
  const duration = Number(out.duration === undefined ? "10" : out.duration);
  return { url, method, concurrency, duration };
}

let totalRequests = 0;
let successCount = 0;
let errorCount = 0;
const latencies: number[] = []; // ms

async function worker(endTime: number, args: Args, headers: Headers) {
  while (!stop && performance.now() < endTime) {
    const t0 = process.hrtime.bigint();
    try {
      const res = await fetch(args.url, { method: args.method, headers });
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      latencies.push(ms);
      totalRequests++;
      if (res.ok) successCount++;
      else errorCount++;
      try {
        await res.text();
      } catch {
        /* ignore */
      }
    } catch (err) {
      const t1 = process.hrtime.bigint();
      const ms = Number(t1 - t0) / 1e6;
      latencies.push(ms);
      totalRequests++;
      errorCount++;
    }
  }
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

(async () => {
  const args = parseArgs();
  const headers = getHeaders();
  const endTime = performance.now() + args.duration * 1000;

  console.log(
    `Running ${args.concurrency} workers for ${args.duration}s -> ${args.url}`
  );
  const workers: Promise<void>[] = [];
  for (let i = 0; i < args.concurrency; i++) {
    workers.push(worker(endTime, args, headers));
  }
  await Promise.all(workers);

  const sorted = latencies.slice().sort((a, b) => a - b);
  const total = totalRequests;
  const rps = total / args.duration;

  const mean = sorted.reduce((s, v) => s + v, 0) / (sorted.length || 1);
  console.log("---- RESULTS ----");
  console.log(`Ran ${args.concurrency} workers for ${args.duration} seconds.`);
  console.log(
    `${totalRequests} requests made, ${successCount} successful (${errorCount} failed).`
  );
  console.log(`Requests / second: ${rps.toFixed(2)}`);
  console.log(`Mean latency (ms): ${mean.toFixed(3)}`);
  console.log(`p50 ms: ${percentile(sorted, 50).toFixed(3)}`);
  console.log(`p90 ms: ${percentile(sorted, 90).toFixed(3)}`);
  console.log(`p99 ms: ${percentile(sorted, 99).toFixed(3)}`);
})();
