/**
 * Async concurrency and timing utilities.
 */

/**
 * Manages an in-flight AbortController, automatically aborting previous tasks
 * when a new one begins.
 */
export class LatestTask {
  private controller: AbortController | null = null;

  /**
   * Aborts any pending execution and returns a new AbortSignal for the next operation.
   */
  start(): AbortSignal {
    this.cancel();
    this.controller = new AbortController();
    return this.controller.signal;
  }

  /**
   * Aborts the current operation if one is pending.
   */
  cancel(): void {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
    }
  }

  /** Current AbortSignal, or null if no task is active. */
  get signal(): AbortSignal | null {
    return this.controller?.signal ?? null;
  }
}

// `never[]` is the constraint for "any function returning void". It cannot be
// `unknown[]`: parameters are contravariant, so `unknown` would have to be
// assignable to `string` for a `(prefix: string) => void` callback to match,
// and it is not. `never` is the bottom type, so it is assignable to anything.
export type DebouncedFunction<T extends (...args: never[]) => void> = ((
  ...args: Parameters<T>
) => void) & {
  cancel: () => void;
};

/**
 * Returns a debounced version of `fn` that delays execution until `waitMs` milliseconds
 * have passed since the last invocation.
 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  waitMs: number
): DebouncedFunction<T> {
  let timer: number | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };

  debounced.cancel = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}
