export function timed<T>(func: () => T, tag?: string): T {
  const start = performance.now();
  const result = func();
  const runtime = (performance.now() - start).toFixed(2);
  console.debug(`${tag || "Runtime"}: ${runtime} ms`);
  return result;
}
