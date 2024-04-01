/* istanbul ignore file */

export interface BenchmarkConfig {
  call: () => unknown;
  name: string;
}

interface BenchmarkData {
  name: string;
  results: number[];
}

async function benchmarkCall(
  call: () => unknown,
  iterations: number
): Promise<number[]> {
  const runtimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await call();
    runtimes.push(performance.now() - start);
  }
  return runtimes;
}

function standardDeviation(array: number[]) {
  const n = array.length;
  const mean = array.reduce((a, b) => a + b) / n;
  return Math.sqrt(
    array.map((x) => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n
  );
}

function printBenchmark(data: BenchmarkData) {
  const runtimes = data.results;
  const mean = (
    runtimes.reduce((sum, x) => sum + x, 0) / runtimes.length
  ).toFixed(2);
  const max = Math.max(...runtimes).toFixed(2);
  const stdev = standardDeviation(runtimes).toFixed(2);
  console.log(`${data.name}: Mean ${mean} ms, StDev ${stdev}, Max ${max} ms`);
}

export async function runBenchmarks(
  configs: BenchmarkConfig[],
  iterations: number,
  cold?: boolean
) {
  if (!cold) {
    await configs[0].call();
  }
  const results: BenchmarkData[] = [];
  for (const config of configs) {
    results.push({
      name: config.name,
      results: await benchmarkCall(config.call, iterations),
    });
  }
  console.log("\n\nResults\n=======");
  for (const result of results) {
    printBenchmark(result);
  }
}
