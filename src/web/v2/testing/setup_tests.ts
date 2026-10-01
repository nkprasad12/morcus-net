import * as util from "util";
import { TextDecoder, TextEncoder } from "util";
import {
  detachedDomWrites,
  clearDetachedDomWrites,
} from "@/web/v2/core/dom_invariants.client";
import { installLayoutShims } from "@/web/v2/testing/layout_shims";

if (typeof globalThis.TextEncoder === "undefined") {
  Object.assign(globalThis, { TextEncoder, TextDecoder });
}

installLayoutShims();

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

interface UnhandledConsoleEntry {
  type: "error" | "warn";
  args: unknown[];
}

let unhandledLogs: UnhandledConsoleEntry[] = [];
let isConsoleAllowed = false;

/**
 * Opts out the current test from failing on unhandled console.error / console.warn.
 */
export function allowConsoleForTest(): void {
  isConsoleAllowed = true;
}

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function recordUnhandledConsole(type: "error" | "warn", args: unknown[]): void {
  const testPath = expect.getState?.().testPath;
  if (testPath && testPath.includes("/src/web/v2/")) {
    if (!isConsoleAllowed) {
      unhandledLogs.push({ type, args });
    }
  } else {
    if (type === "error") {
      originalConsoleError.apply(console, args);
    } else {
      originalConsoleWarn.apply(console, args);
    }
  }
}

console.error = function (...args: unknown[]): void {
  recordUnhandledConsole("error", args);
};

console.warn = function (...args: unknown[]): void {
  recordUnhandledConsole("warn", args);
};

/**
 * Drains unhandled console error/warn logs and throws if any occurred in V2 tests.
 */
export function verifyNoUnhandledConsole(): void {
  const logs = [...unhandledLogs];
  unhandledLogs = [];
  const allowed = isConsoleAllowed;
  isConsoleAllowed = false;

  const testPath = expect.getState?.().testPath;
  if (
    !allowed &&
    testPath &&
    testPath.includes("/src/web/v2/") &&
    logs.length > 0
  ) {
    const formatted = logs
      .map(
        (log) =>
          `[console.${log.type}]: ${log.args
            .map((arg) =>
              typeof arg === "string" ? arg : util.inspect(arg, { depth: 2 })
            )
            .join(" ")}`
      )
      .join("\n");
    throw new Error(
      `[UI V2] Test logged to console without an active spy:\n\n${formatted}\n\nAssert expected console output with jest.spyOn(console, '${logs[0].type}').mockImplementation(...) instead of printing it.`
    );
  }
}

beforeEach(() => {
  clearDetachedDomWrites();
  isDetachedWriteAllowed = false;
  unhandledLogs = [];
  isConsoleAllowed = false;
});

afterEach(() => {
  try {
    verifyNoDetachedDomWrites();
  } finally {
    verifyNoUnhandledConsole();
  }
});
