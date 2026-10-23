import type { PrunePassResult } from "@/devops/pruner/pruner";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_SIGINT = 130;
export const EXIT_SIGTERM = 143;

export const MIN_RETENTION_DAYS = 7;
export const MIN_MAX_MB = 50;
export const WARN_MAX_MB = 500;

/**
 * Parses a whole-number setting. Blank means `fallback`. Anything else that
 * isn't a plain non-negative integer (`100d`, `1e2`, `0x64`, `-5`) or is
 * below `min` throws.
 */
export function parseIntSetting(
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number
): number {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") {
    return fallback;
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${name} must be a whole number; got '${raw}'.`);
  }
  const n = Number(trimmed);
  if (n < min) {
    throw new Error(`${name} must be at least ${min}; got ${n}.`);
  }
  return n;
}

/**
 * Tracks a stop request (SIGTERM / SIGINT) and lets the daemon's sleep
 * between passes be cut short by it.
 */
export class StopController {
  private requestedExitCode: number | null = null;
  private readonly wakers = new Set<() => void>();

  get exitCode(): number | null {
    return this.requestedExitCode;
  }

  readonly shouldStop = (): boolean => this.requestedExitCode !== null;

  request(signal: "SIGTERM" | "SIGINT"): void {
    if (this.requestedExitCode === null) {
      this.requestedExitCode =
        signal === "SIGTERM" ? EXIT_SIGTERM : EXIT_SIGINT;
    }
    for (const wake of this.wakers) {
      wake();
    }
    this.wakers.clear();
  }

  /** Sleeps for `ms`, returning early if a stop is requested. */
  sleep(ms: number): Promise<void> {
    if (this.shouldStop()) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        this.wakers.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      this.wakers.add(wake);
    });
  }
}

export interface PruneLoopDeps {
  readonly runPass: () => Promise<PrunePassResult>;
  readonly markHealthy: () => Promise<void>;
  readonly markUnhealthy: () => Promise<void>;
  /** Milliseconds to sleep between daemon passes. */
  readonly nextSleepMs: () => number;
  readonly log: (msg: string) => void;
}

function describePass(result: PrunePassResult): string {
  return `pruned ${result.prunedWeeks.length} week(s), ${
    result.errors.length
  } error(s)${result.stoppedEarly ? " (stopped early on signal)" : ""}`;
}

/**
 * Runs one pass (`runOnce`) or the daemon loop, and returns the process exit
 * code:
 * - `--once`: `0` if the pass had no errors, `1` if it did or threw, or the
 *   signal code if it was interrupted.
 * - Daemon: runs until stopped, then returns `143` (SIGTERM) / `130` (SIGINT)
 *   so `restart: on-failure` brings the container back after a clean host
 *   reboot or docker restart. The health file is written only after a fully
 *   successful pass, and removed after a pass with errors.
 */
export async function runPruneLoop(
  runOnce: boolean,
  stop: StopController,
  deps: PruneLoopDeps
): Promise<number> {
  if (runOnce) {
    try {
      const result = await deps.runPass();
      deps.log(`Completed single pass: ${describePass(result)}.`);
      if (stop.exitCode !== null) {
        return stop.exitCode;
      }
      return result.errors.length > 0 ? EXIT_ERROR : EXIT_OK;
    } catch (err) {
      deps.log(`Single pass failed: ${String(err)}`);
      return stop.exitCode ?? EXIT_ERROR;
    }
  }

  while (!stop.shouldStop()) {
    try {
      const result = await deps.runPass();
      deps.log(`Pass complete: ${describePass(result)}.`);
      if (result.errors.length > 0) {
        await deps.markUnhealthy();
      } else if (!result.stoppedEarly) {
        await deps.markHealthy();
      }
    } catch (err) {
      deps.log(`Pass failed: ${String(err)}`);
      await deps.markUnhealthy();
    }
    await stop.sleep(deps.nextSleepMs());
  }
  return stop.exitCode ?? EXIT_SIGTERM;
}
