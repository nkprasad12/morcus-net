export function assert(
  condition: boolean,
  message: string | (() => string) = ""
) {
  if (!condition) {
    throw new Error(typeof message === "string" ? message : message());
  }
}

export function assertEqual(
  expected: unknown,
  actual: unknown,
  details?: string
) {
  const extra = details === undefined ? "" : `\n${details}`;
  if (expected !== actual) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(
        actual
      )}.${extra}`
    );
  }
}

export function assertArraysEqual<T>(expected: T[], actual: T[]) {
  assertEqual(expected.length, actual.length, "Lengths do not match.");
  for (let i = 0; i < expected.length; i++) {
    assertEqual(expected[i], actual[i], `at position ${i}`);
  }
}

export function assertType<T>(
  input: unknown,
  validator: (x: unknown) => x is T
): T {
  if (validator(input)) {
    return input;
  }
  throw new Error("Input did not match expected type.");
}

function appendMessage(base: string, message?: string): string {
  if (message === undefined) {
    return base;
  }
  return `${base} Message: ${message}`;
}

export function checkPresent<T>(
  input: T | undefined | null,
  message?: string
): T {
  if (input === undefined) {
    throw new Error(appendMessage("Input was undefined.", message));
  }
  if (input === null) {
    throw new Error(appendMessage("Input was null.", message));
  }
  return input;
}

export function checkSatisfies<T>(
  input: T,
  test: (t: T) => boolean,
  message?: string
): T {
  assert(test(input), message);
  return input;
}
