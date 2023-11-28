export function assert(condition: boolean, message: string = "") {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEqual(expected: any, actual: any, details?: string) {
  const extra = details === undefined ? "" : `\n${details}`;
  if (expected !== actual) {
    throw new Error(
      `Expected ${JSON.stringify(actual)}, but got ${JSON.stringify(
        expected
      )}.${extra}`
    );
  }
}

export function checkPresent<T>(
  input: T | undefined | null,
  message?: string
): T {
  if (input === undefined) {
    throw new Error(`Input was undefined. Message: "${message}"`);
  }
  if (input === null) {
    throw new Error(`Input was null. Message: "${message}"`);
  }
  return input;
}

export function envVar(name: string): string {
  return checkPresent(process.env[name], `Trying to read env var ${name}`);
}

export function checkSatisfies<T>(
  input: T,
  test: (t: T) => boolean,
  message?: string
): T {
  assert(test(input), message);
  return input;
}
