/* istanbul ignore file */

import { envVar } from "@/common/assert";
import { StepConfig } from "@/scripts/script_utils";
import { readFile, writeFile } from "fs/promises";

const TEMPLATE = "templates/pwa.webmanifest";
const PWA_FILE = "public/pwa.webmanifest";
const DEV_NAME = "morcus-net-dev";
const LOCAL_NAME = "morcus-net-local";

export async function writeWebManifest() {
  const appName = envVar("APPNAME", "unsafe") || "";
  const template = JSON.parse((await readFile(TEMPLATE)).toString());
  const variant =
    appName === DEV_NAME ? "Dev" : appName === LOCAL_NAME ? "Local" : "Prod";
  const prefix = variant === "Dev" ? "[D] " : variant === "Local" ? "[L] " : "";
  console.log(`Using prefix: "${prefix}"`);
  template.name = prefix + template.name;
  template.short_name = prefix + template.short_name;
  await writeFile(PWA_FILE, JSON.stringify(template, undefined, 2));
}

export function writePwaManifestStep(priority?: number): StepConfig {
  return { ...WRITE_PWA_MANIFEST, priority };
}

const WRITE_PWA_MANIFEST: StepConfig = {
  operation: writeWebManifest,
  label: "Writing PWA Manifest",
};
