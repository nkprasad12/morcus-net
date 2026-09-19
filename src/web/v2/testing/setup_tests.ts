import {
  detachedDomWrites,
  clearDetachedDomWrites,
} from "@/web/v2/core/dom_invariants.client";

let isDetachedWriteAllowed = false;

/**
 * Opts out the current test from failing on detached DOM writes.
 * Used exclusively by tests asserting that detached writes are properly caught.
 */
export function allowDetachedDomWritesForTest(): void {
  isDetachedWriteAllowed = true;
}

/**
 * Drains the detached-write registry and throws if any unallowed writes occurred.
 * Invoked automatically in afterEach() across all test suites.
 */
export function verifyNoDetachedDomWrites(): void {
  const writes = [...detachedDomWrites];
  const allowed = isDetachedWriteAllowed;
  clearDetachedDomWrites();
  isDetachedWriteAllowed = false;

  if (!allowed && writes.length > 0) {
    throw new Error(
      `[UI V2] Detected ${writes.length} illegal DOM write(s) targeting detached element(s):\n\n` +
        writes.join("\n\n")
    );
  }
}

beforeEach(() => {
  clearDetachedDomWrites();
  isDetachedWriteAllowed = false;
});

afterEach(() => {
  verifyNoDetachedDomWrites();
});
