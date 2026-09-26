/**
 * UI V2 Disposable cleanup primitive.
 *
 * Collects zero-argument cleanup callbacks (e.g. unbinds, event listener removals,
 * observer disconnects, or timer cancellations) and executes them on disposal.
 *
 * Teardown drains the bag in insertion order (FIFO) with per-callback error
 * isolation so that one failing unbind does not prevent remaining cleanups from
 * executing. The bag is safe to call dispose() on multiple times (no-op when empty),
 * and remains reusable after disposal (e.g. for re-attaching elements).
 */
/**
 * Handle returned when registering a cleanup callback with a DisposableBag.
 * Calling it cancels the registration so the cleanup will not execute on disposal.
 */
export type Unregister = () => void;

/**
 * Run-cleanup callback or teardown function (e.g. unbind, listener removal, timer cancellation).
 * Calling it executes the teardown immediately.
 */
export type CleanupFn = () => void;

export class DisposableBag {
  private disposables: CleanupFn[] = [];

  /**
   * Registers a cleanup callback.
   * Returns an unregister handle that removes the callback from the bag
   * so it will not run when dispose() is called.
   */
  add(fn: CleanupFn): Unregister {
    this.disposables.push(fn);
    let unregistered = false;
    return () => {
      if (unregistered) return;
      unregistered = true;
      const idx = this.disposables.indexOf(fn);
      if (idx !== -1) {
        this.disposables.splice(idx, 1);
      }
    };
  }

  /**
   * Executes and clears all registered cleanup callbacks in FIFO order.
   * Drains the internal list before executing so that any re-entrant add()
   * during teardown survives into the next disposal cycle.
   */
  dispose(): void {
    const toRun = this.disposables;
    this.disposables = [];

    for (const fn of toRun) {
      try {
        fn();
      } catch (err) {
        console.error("Error during disposal:", err);
      }
    }
  }
}

/**
 * Wraps an enhancer setup function with singleton activeCleanup lifecycle management.
 * Disposes any active previous instance on re-entrant setup calls and clears activeCleanup
 * when the returned unbind handle is invoked.
 */
export function createSingletonSetup<Args extends unknown[]>(
  setupFn: (...args: Args) => CleanupFn
): (...args: Args) => CleanupFn {
  let activeCleanup: CleanupFn | null = null;

  return (...args: Args): CleanupFn => {
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }

    const cleanup = setupFn(...args);
    let disposed = false;
    const unbind: CleanupFn = () => {
      if (disposed) return;
      disposed = true;
      try {
        cleanup();
      } finally {
        if (activeCleanup === unbind) {
          activeCleanup = null;
        }
      }
    };
    activeCleanup = unbind;
    return unbind;
  };
}
