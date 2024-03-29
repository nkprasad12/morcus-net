import { checkPresent } from "@/common/assert";

const DEFAULT_ENV_VARS = new Map<string, string>([
  ["LATIN_INFLECTION_DB", "build/dbs/lat_infl.db"],
  ["LS_PATH", "ls_raw.xml"],
  ["LS_PROCESSED_PATH", "build/dbs/ls.db"],
  ["RAW_LATIN_WORDS", "lat_raw.txt"],
  ["SH_PROCESSED_PATH", "build/dbs/sh.db"],
  ["SH_RAW_PATH", "sh_raw.txt"],
  ["DB_SOURCE", "unspecified"],
]);

export function envVar(name: string, unsafe: "unsafe"): string | undefined;
export function envVar(name: string): string;
export function envVar(name: string, unsafe?: "unsafe"): string | undefined {
  const candidate = process.env[name] || DEFAULT_ENV_VARS.get(name);
  if (unsafe === "unsafe") {
    return candidate;
  }
  return checkPresent(candidate, `Environment variable ${name} not set!`);
}
