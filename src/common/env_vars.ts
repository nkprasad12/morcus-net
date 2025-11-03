import { checkPresent } from "@/common/assert";

const DEFAULT_ENV_VARS = new Map<string, string>([
  ["LS_PATH", "ls_raw.xml"],
  ["RA_PATH", "riddle-arnold.tsv"],
  ["LS_PROCESSED_PATH", "build/dbs/ls.db"],
  ["SH_PROCESSED_PATH", "build/dbs/sh.db"],
  ["RA_PROCESSED_PATH", "build/dbs/ra.db"],
  ["SH_RAW_PATH", "sh_raw.txt"],
  ["GAFFIOT_RAW_PATH", "gaffiot.js"],
  ["GAFFIOT_PROCESSED_PATH", "build/dbs/gaf.db"],
  ["GEORGES_RAW_PATH", "georges_raw.xml"],
  ["GEORGES_PROCESSED_PATH", "build/dbs/georges.db"],
  ["POZO_RAW_PATH", "pozo.txt"],
  ["POZO_PROCESSED_PATH", "build/dbs/pozo.db"],
  ["GESNER_RAW_PATH", "gesner.json"],
  ["GESNER_PROCESSED_PATH", "build/dbs/gesner.db"],
  ["DB_SOURCE", "unspecified"],
  ["OFFLINE_DATA_DIR", "build/offlineData"],
  ["PWA_SHORT_NAME_SUFFIX", ""],
  ["MORCEUS_DATA_ROOT", "morceus-data/"],
  ["HYPOTACTIC_ROOT", "hypotactic/"],
  ["PHI_JSON_ROOT", "phi-public-domain-json/"],
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
