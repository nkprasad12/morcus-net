/* istanbul ignore file */

interface BenchamarkConfig {
  call: () => any;
  name: string;
}

interface BenchmarkData {
  name: string;
  results: number[];
}

async function benchmarkCall(
  call: () => any,
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

function printBenchmark(data: BenchmarkData) {
  const runtimes = data.results;
  const mean = runtimes.reduce((sum, x) => sum + x, 0) / runtimes.length;
  const max = Math.max(...runtimes);
  console.log(
    `${data.name}: Mean ${mean.toFixed(2)} ms, Max ${max.toFixed(2)} ms`
  );
}

export async function runBenchmarks(
  configs: BenchamarkConfig[],
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
