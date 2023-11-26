/* istanbul ignore file */

import { assertEqual, checkPresent } from "@/common/assert";
import { DictsFusedApi, GetWork, ListLibraryWorks } from "@/web/api_routes";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import { ChildProcess, spawn } from "child_process";
import fs from "fs";
import { LatinDict } from "@/common/dictionaries/latin_dicts";

// @ts-ignore
global.location = {
  origin: "http://localhost:3745",
};

const TEST_TMP_DIR = "tmp_server_integration_test";

const LS_PATH =
  "lexica/master/CTS_XML_TEI/perseus/pdllex/lat/ls/lat.ls.perseus-eng2.xml";
const SH_PATH = "smithandhall/v1edits/sh_F2_latest.txt";
const LAT_WORDS_PATH =
  "morcus-raw-data/main/morpheus_out_aug1_suff_removed.txt";

const BUILD_CLIENT = "npm run build-client -- --env production";
const PROCESS_LS = "npm run ts-node src/scripts/process_ls.ts -- --verify";
const PROCESS_SH = "npm run ts-node src/scripts/process_sh.ts -- --verify";
const MAKE_LAT_DB = "npm run ts-node src/scripts/latin_inflections.ts";
const MAKE_LAT_LIB = "npm run ts-node src/scripts/process_lat_lib.ts";
const START_SERVER =
  "node --max-old-space-size=460 -- node_modules/.bin/ts-node -P tsconfig.json -r tsconfig-paths/register --transpile-only src/start_server.ts";
const PORT = "3745";

const processes: ChildProcess[] = [];

function download(name: string, dest: string): string {
  return `curl --compressed https://raw.githubusercontent.com/nkprasad12/${name} -o ${dest}`;
}

function childEnv() {
  const childEnv = { ...process.env };
  childEnv["LS_PATH"] = `${TEST_TMP_DIR}/ls.xml`;
  childEnv["LS_PROCESSED_PATH"] = `${TEST_TMP_DIR}/lsp.txt`;
  childEnv["SH_RAW_PATH"] = `${TEST_TMP_DIR}/sh_raw.txt`;
  childEnv["SH_PROCESSED_PATH"] = `${TEST_TMP_DIR}/shp.db`;
  childEnv["PORT"] = PORT;
  childEnv["CONSOLE_TELEMETRY"] = "yes";
  childEnv["RAW_LATIN_WORDS"] = `${TEST_TMP_DIR}/lat_raw.txt`;
  childEnv["LATIN_INFLECTION_DB"] = `${TEST_TMP_DIR}/latin_inflect.db`;
  return childEnv;
}

namespace DownloadCommand {
  export function forLs(): string {
    return download(LS_PATH, checkPresent(childEnv().LS_PATH));
  }

  export function forSh(): string {
    return download(SH_PATH, checkPresent(childEnv().SH_RAW_PATH));
  }

  export function forLatRaw(): string {
    return download(LAT_WORDS_PATH, checkPresent(childEnv().RAW_LATIN_WORDS));
  }
}

function completionPromise(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => {
    child.on("close", () => {
      resolve(child.exitCode);
    });
  });
}

function spawnChild(
  stringCommand: string,
  env?: NodeJS.ProcessEnv,
  onStdOut?: (s: string) => any,
  cwd?: string
): ChildProcess {
  const command = stringCommand.split(" ");
  const child = spawn(command[0], command.slice(1), { env: env, cwd: cwd });
  child.stdout.on("data", (data) => {
    const message: string = data.toString().replace(/\n$/, "");
    console.log(message);
    if (onStdOut !== undefined) {
      onStdOut(message);
    }
  });
  child.stderr.on("data", (data) => {
    const message: string = data.toString();
    console.log(message.replace(/\n$/, ""));
  });
  processes.push(child);
  return child;
}

async function runCommand(
  command: string,
  options?: { onStdOut?: (s: string) => any; cwd?: string }
) {
  const result = await completionPromise(
    spawnChild(command, childEnv(), options?.onStdOut, options?.cwd)
  );
  return result;
}

export async function setUpEnvironment() {
  const buildClient = runCommand(BUILD_CLIENT);
  const downloadLs = runCommand(DownloadCommand.forLs());
  const downloadSh = runCommand(DownloadCommand.forSh());
  const downloadLatWords = runCommand(DownloadCommand.forLatRaw());

  assertEqual(await downloadLs, 0, "Failed to download raw LS file");
  assertEqual(await downloadSh, 0, "Failed to download raw SH file");
  assertEqual(await downloadLatWords, 0, "Failed to download Latin word dump");

  const makeLatDb = runCommand(MAKE_LAT_DB);
  assertEqual(await makeLatDb, 0, "Failed to make the Latin Inflections DB.");

  const makeLabLib = runCommand(MAKE_LAT_LIB);
  const processLs = runCommand(PROCESS_LS);
  const processSh = runCommand(PROCESS_SH);

  assertEqual(await makeLabLib, 0, "Failed to write processed Latin library");
  assertEqual(await buildClient, 0, "Failed to build the client");
  assertEqual(await processLs, 0, "Failed to process or verify LS");
  assertEqual(await processSh, 0, "Failed to process or verify SH");
}

export function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    let completed = false;
    const startTime = performance.now();
    const onStdOut = (line: string) => {
      if (line.includes(PORT)) {
        completed = true;
        resolve();
      }
    };
    runCommand(START_SERVER, { onStdOut }).catch((error) => {
      completed = true;
      reject(error);
    });

    function checkTimeout() {
      if (completed) {
        return;
      }
      if (performance.now() - startTime > 5000) {
        reject("Start server timed out");
      }
      setTimeout(checkTimeout, 50);
    }

    checkTimeout();
  });
}

describe("morcus.net backend", () => {
  beforeAll(async () => {
    fs.mkdirSync(TEST_TMP_DIR, { recursive: true });
    await setUpEnvironment();
    await startServer();
  }, 120000);

  afterAll(async () => {
    fs.rmSync(TEST_TMP_DIR, { recursive: true });
    console.log(`Cleaning up ${processes.length} processes.`);
    for (const child of processes) {
      try {
        if (child.exitCode !== null) {
          console.log(`pid ${child.pid} already done`);
          continue;
        }
        const processDone = completionPromise(child);
        child.kill("SIGINT");
        await processDone;
        console.log(`pid ${child.pid} killed.`);
      } catch {}
    }
  }, 10000);

  test("returns LS results in uninflected mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "canaba",
      dicts: [LatinDict.LewisAndShort.key],
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("cannăba")).toBe(true);
  });

  test("returns LS results in inflected mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "undarum",
      dicts: [LatinDict.LewisAndShort.key],
      mode: 1,
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("billow")).toBe(true);
  });

  test("returns LS results in id mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "n1153",
      dicts: [LatinDict.LewisAndShort.key],
      mode: 2,
    });

    const articles = result.data[LatinDict.LewisAndShort.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("ἀηδών")).toBe(true);
  });

  test("returns SH results in id mode", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "n2708",
      dicts: [LatinDict.SmithAndHall.key],
      mode: 2,
    });

    const articles = result.data[LatinDict.SmithAndHall.key];
    expect(articles).toHaveLength(1);
    expect(articles[0].entry.toString().includes("caerŭlĕus")).toBe(true);
  });

  test("returns SH results", async () => {
    const result = await callApiFull(DictsFusedApi, {
      query: "influence",
      dicts: [LatinDict.SmithAndHall.key],
    });

    const articles = result.data[LatinDict.SmithAndHall.key];
    expect(articles).toHaveLength(2);
    expect(articles[0].entry.toString().includes("Power exerted")).toBe(true);
    expect(articles[1].entry.toString().includes("impello")).toBe(true);
  });

  test("returns expected library result list", async () => {
    const result = await callApiFull(ListLibraryWorks, {});

    const works = result.data;
    expect(
      works.filter((work) => work.id === "phi0448.phi001.perseus-lat2")
    ).toHaveLength(1);
  });

  test("returns DBG on request", async () => {
    const result = await callApiFull(GetWork, "phi0448.phi001.perseus-lat2");
    expect(result.data.info.title).toBe("De bello Gallico");
  });
});
