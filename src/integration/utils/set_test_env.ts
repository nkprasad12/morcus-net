/* istanbul ignore file */

// Do NOT import anything else in this file, because we use this to make sure we set
// environment variables before the process.env values are imported and read by
// any other modules. Yes, this is hacky but it gets the job done.
export function setEnv(reuseDev: boolean, port: string, testDir: string) {
  process.env["PORT"] = port;
  process.env["CONSOLE_TELEMETRY"] = "yes";
  if (reuseDev === true) {
    return;
  }
  process.env["LS_PATH"] = `${testDir}/ls.xml`;
  process.env["LS_PROCESSED_PATH"] = `${testDir}/lsp.txt`;
  process.env["SH_RAW_PATH"] = `${testDir}/sh_raw.txt`;
  process.env["SH_PROCESSED_PATH"] = `${testDir}/shp.db`;
}
