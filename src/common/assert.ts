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
