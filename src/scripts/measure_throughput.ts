/* istanbul ignore file */

/**
 * Latency and throughput tester for morcus.net server endpoints.
 *
 * With `--url`, measures that one URL. Without it, measures the built-in
 * UI V2 suite below (full pages, their `?format=partial` swaps, and JSON
 * endpoints), one row per endpoint, to see where server time goes (e.g. to
 * inform artifact re-tuning, GRADUATION.md §6). Run it by hand; nothing in
 * CI depends on it. Production latency is in the `ApiCalls` telemetry.
 *
 * Usage:
 *   npm run tsnp src/scripts/measure_throughput.ts -- [options]
 *   bun ./src/scripts/measure_throughput.ts [options]
 *
 * Options:
 *   --url         a single target URL (default: the built-in suite)
 *   --base        server origin for the suite (default http://localhost:5757)
 *   --filter      only suite endpoints whose name contains this text
 *   --concurrency concurrent workers per endpoint (default 1: pure latency)
 *   --duration    seconds per endpoint (default 3)
 *   --method      e.g. GET or POST (with --url)
 *
 * Each endpoint's first request is reported separately as `cold`: right after
 * a server start it includes first-touch costs (opening databases, warming
 * caches), and it is excluded from the percentiles. Anything other than a 2xx
 * counts as an error; redirects are not followed, so a moved route can't be
 * measured by accident.
 */

import { argv } from "process";

let stop = false;

process.on("SIGINT", () => {
  stop = true;
});

interface Endpoint {
  name: string;
  path: string;
}

/** Representative UI V2 requests. Keep in sync with routes that move. */
const V2_SUITE: Endpoint[] = [
  { name: "dict landing", path: "/dicts" },
  { name: "dict L&S page", path: "/dicts?q=habeo&dict=ls" },
  { name: "dict L&S partial", path: "/dicts?q=habeo&dict=ls&format=partial" },
  { name: "dict all page", path: "/dicts?q=habeo" },
  { name: "dict all partial", path: "/dicts?q=habeo&format=partial" },
  {
    name: "dict S&H partial",
    path: "/dicts?q=influence&dict=sh&format=partial",
  },
  { name: "dict entry by id", path: "/dicts/id/n20077" },
  { name: "completions", path: "/api/completions?prefix=ca" },
  { name: "completions suffix", path: "/api/completions?q=-abo" },
  { name: "corpus lemmata", path: "/api/corpus/lemmata/c" },
  { name: "library", path: "/library" },
  { name: "reader DBG page", path: "/work/caesar/de_bello_gallico/1.1" },
  {
    name: "reader DBG partial",
    path: "/work/caesar/de_bello_gallico/1.1?format=partial",
  },
  { name: "reader DRN page", path: "/work/lucretius/de_rerum_natura/1" },
  { name: "translation", path: "/work/sallust/catalina1/1/translation" },
  {
    name: "corpus page",
    path: `/corpus?q=${encodeURIComponent("@lemma:do oscula @case:dat")}`,
  },
  {
    name: "corpus partial",
    path: `/corpus?q=${encodeURIComponent(
      "@lemma:do oscula @case:dat"
    )}&format=partial`,
  },
];

interface Args {
  targets: Array<{ name: string; url: string }>;
  concurrency: number;
  duration: number;
  method: string;
}

interface Result {
  name: string;
  requests: number;
  errors: number;
  coldMs: number;
  /** Time until response headers arrive. */
  ttfbMs: number[];
  /** Time until the whole body has been read. */
  totalMs: number[];
  bytes: number;
}

function getHeaders(): Headers {
  const headers = new Headers();
  // What browsers send, so on-the-fly compression costs what it does live.
  headers.set("accept-encoding", "gzip, deflate, br");
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
  const base = (out.base ?? "http://localhost:5757").replace(/\/$/, "");
  const targets =
    out.url !== undefined
      ? [{ name: out.url, url: out.url }]
      : V2_SUITE.filter(
          (e) => out.filter === undefined || e.name.includes(out.filter)
        ).map((e) => ({ name: e.name, url: base + e.path }));
  if (targets.length === 0) {
    throw new Error(`No suite endpoint matches --filter ${out.filter}`);
  }
  return {
    targets,
    method: out.method ?? "GET",
    concurrency: Number(out.concurrency ?? "1"),
    duration: Number(out.duration ?? "3"),
  };
}

/** Times one request; a network error counts as a failed request. */
async function timedRequest(
  url: string,
  method: string,
  headers: Headers
): Promise<{ ok: boolean; ttfbMs: number; totalMs: number; bytes: number }> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { method, headers, redirect: "manual" });
    const ttfbMs = performance.now() - t0;
    const body = await res.arrayBuffer();
    const totalMs = performance.now() - t0;
    return { ok: res.ok, ttfbMs, totalMs, bytes: body.byteLength };
  } catch {
    const ms = performance.now() - t0;
    return { ok: false, ttfbMs: ms, totalMs: ms, bytes: 0 };
  }
}

async function measure(
  target: Args["targets"][number],
  args: Args,
  headers: Headers
): Promise<Result> {
  const cold = await timedRequest(target.url, args.method, headers);
  const result: Result = {
    name: target.name,
    requests: 1,
    errors: cold.ok ? 0 : 1,
    coldMs: cold.totalMs,
    ttfbMs: [],
    totalMs: [],
    bytes: cold.bytes,
  };
  const endTime = performance.now() + args.duration * 1000;
  const worker = async () => {
    while (!stop && performance.now() < endTime) {
      const r = await timedRequest(target.url, args.method, headers);
      result.requests++;
      if (!r.ok) {
        result.errors++;
        continue;
      }
      result.ttfbMs.push(r.ttfbMs);
      result.totalMs.push(r.totalMs);
    }
  };
  await Promise.all(Array.from({ length: args.concurrency }, worker));
  return result;
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function printTable(results: Result[], args: Args) {
  const ms = (v: number) => (Number.isNaN(v) ? "-" : v.toFixed(1));
  const rows = results.map((r) => {
    const mean =
      r.totalMs.reduce((s, v) => s + v, 0) / (r.totalMs.length || NaN);
    return [
      r.name,
      String(r.requests),
      r.errors === 0 ? "0" : `\x1b[31m${r.errors}\x1b[0m`,
      ((r.requests - 1) / args.duration).toFixed(1),
      ms(r.coldMs),
      ms(percentile(r.totalMs, 50)),
      ms(percentile(r.totalMs, 90)),
      ms(percentile(r.totalMs, 99)),
      ms(mean),
      ms(percentile(r.ttfbMs, 50)),
      (r.bytes / 1024).toFixed(1),
    ];
  });
  const header = [
    "endpoint",
    "reqs",
    "err",
    "req/s",
    "cold",
    "p50",
    "p90",
    "p99",
    "mean",
    "ttfb p50",
    "KiB",
  ];
  // eslint-disable-next-line no-control-regex
  const width = (s: string) => s.replace(/\x1b\[\d+m/g, "").length;
  const widths = header.map((h, i) =>
    Math.max(width(h), ...rows.map((row) => width(row[i])))
  );
  const line = (cells: string[]) =>
    cells
      .map((c, i) =>
        i === 0
          ? c + " ".repeat(widths[i] - width(c))
          : " ".repeat(widths[i] - width(c)) + c
      )
      .join("  ");
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  rows.forEach((row) => console.log(line(row)));
  console.log(
    "\nTimes in ms. p50/p90/p99/mean: whole response, excluding the cold " +
      "first request. KiB: decoded body size."
  );
}

void (async () => {
  const args = parseArgs();
  const headers = getHeaders();
  console.log(
    `Measuring ${args.targets.length} endpoint(s): ${args.concurrency} ` +
      `worker(s) for ${args.duration}s each.\n`
  );
  const results: Result[] = [];
  for (const target of args.targets) {
    if (stop) break;
    results.push(await measure(target, args, headers));
  }
  printTable(results, args);
})();
