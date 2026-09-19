/**
 * Test registry for detecting illegal DOM writes targeting detached elements.
 *
 * In test mode (NODE_ENV === "test"), assertConnected appends violation records
 * here. The global Jest setup fixture verifies this registry in afterEach() and
 * fails any test that targeted a detached element without explicit allowance.
 */

export const detachedDomWrites: string[] = [];

export function recordDetachedDomWrite(msg: string): void {
  const stack = new Error().stack?.split("\n").slice(2).join("\n") ?? "";
  detachedDomWrites.push(`${msg}\n${stack}`);
}

export function clearDetachedDomWrites(): void {
  detachedDomWrites.length = 0;
}
