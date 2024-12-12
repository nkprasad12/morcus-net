import { checkPresent } from "@/common/assert";

const DEFAULT_ENV_VARS = new Map<string, string>([
  ["LS_PATH", "ls_raw.xml"],
  ["LS_PROCESSED_PATH", "build/dbs/ls.db"],
  ["SH_PROCESSED_PATH", "build/dbs/sh.db"],
  ["SH_RAW_PATH", "sh_raw.txt"],
  ["GAFFIOT_RAW_PATH", "gaffiot.js"],
  ["DB_SOURCE", "unspecified"],
  ["OFFLINE_DATA_DIR", "build/offlineData"],
  ["PWA_SHORT_NAME_SUFFIX", ""],
  ["MORCEUS_DATA_ROOT", "morceus-data/"],
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
