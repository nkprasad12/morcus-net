export function assert(condition: boolean, message: string = "") {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEqual(expected: any, actual: any) {
  if (expected !== actual) {
    throw new Error(`Expected ${expected}, but got ${actual}.`);
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
