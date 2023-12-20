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

const DEFAULT_ENV_VARS = new Map<string, string>([
  ["LATIN_INFLECTION_DB", "lat_infl.db"],
  ["LS_PATH", "ls_raw.xml"],
  ["LS_PROCESSED_PATH", "ls.db"],
  ["RAW_LATIN_WORDS", "lat_raw.txt"],
  ["SH_PROCESSED_PATH", "sh.db"],
  ["SH_RAW_PATH", "sh_raw.txt"],
]);

export function envVar(name: string, unsafe: "unsafe"): string | undefined;
export function envVar(name: string): string;
export function envVar(name: string, unsafe?: "unsafe"): string | undefined {
  const candidate = process.env[name] || DEFAULT_ENV_VARS.get(name);
  if (unsafe === "unsafe") {
    return candidate;
  }
  return checkPresent(candidate, `Envirement variable ${name} not set!`);
}

export function checkSatisfies<T>(
  input: T,
  test: (t: T) => boolean,
  message?: string
): T {
  assert(test(input), message);
  return input;
}
