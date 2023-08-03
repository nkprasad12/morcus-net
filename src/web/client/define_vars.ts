declare const COMMIT_HASH: string;
declare const BUILD_DATE: string;
declare const DEFAULT_EXPERIMENTAL_MODE: boolean;

export function tryOr<T>(f: () => T, fallback: T): T {
  try {
    return f();
  } catch (e) {
    return fallback;
  }
}

export function getCommitHash(): string {
  return tryOr(() => COMMIT_HASH.trim(), "undefined");
}

export function getBuildDate(): string {
  return tryOr(() => BUILD_DATE.trim(), "undefined");
}

export function defaultExperimentalMode(): boolean {
  return tryOr(() => DEFAULT_EXPERIMENTAL_MODE, false);
}
