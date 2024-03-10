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
