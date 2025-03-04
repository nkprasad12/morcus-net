declare const COMMIT_HASH: string;

export function tryOr<T>(f: () => T, fallback: T): T {
  try {
    return f();
  } catch (e) {
    return fallback;
  }
}

export function getCommitHash(): string | undefined {
  return tryOr(() => COMMIT_HASH.trim(), undefined);
}
