/* istanbul ignore file */

import { assert } from "@/common/assert";
import { makeMorpheusDb } from "@/common/lexica/latin_words";
import {
  StepConfig,
  runCommand,
  runPipeline,
  shellStep,
} from "@/scripts/script_utils";
import { writeCommitId } from "@/scripts/write_source_version";
import { ArgumentParser } from "argparse";
import { ChildProcess, spawn } from "child_process";
import dotenv from "dotenv";

dotenv.config();

const WEB_SERVER = "web";
const WORKER = "worker";
const EDITOR = "editor";
const COMMANDS = [WEB_SERVER, WORKER, EDITOR];

const cleanupOperations: (() => any)[] = [];

registerCleanup();
const args = parseArguments();
if (args.command === WEB_SERVER) {
  setupAndStartWebServer(args).then((success) => assert(success));
} else if (args.command === WORKER) {
  awaitAll([startWorker(args, args.workerType)]);
} else if (args.command === EDITOR) {
  startLsEditor();
}

function parseArguments() {
  const parser = new ArgumentParser({
    description: "Helper scripts to start the Morcus Latin Tools",
  });
  parser.add_argument("command", {
    help: "The high level command to run.",
    choices: COMMANDS,
  });
  parser.add_argument("-no_bc", "--no_build_client", {
    help: "If set, the client bundle will not be built.",
    action: "store_true",
  });
  parser.add_argument("-b_ls", "--build_ls", {
    help: "If set, re-processes LS.",
    action: "store_true",
  });
  parser.add_argument("-b_sh", "--build_sh", {
    help: "If set, re-processes SH and saves to DB.",
    action: "store_true",
  });
  parser.add_argument("-b_li", "--build_latin_inflections", {
    help: "If set, re-processes Latin Inflections and saves to DB.",
    action: "store_true",
  });
  parser.add_argument("-b_ll", "--build_latin_library", {
    help: "If set, processing and stores the Latin library contents.",
    action: "store_true",
  });
  parser.add_argument("-to", "--transpile_only", {
    help: "If set, skips type checking for the client and server.",
    action: "store_true",
  });
  parser.add_argument("-r_db", "--real_database", {
    help: "If set, uses the real telemetry database.",
    action: "store_true",
  });
  parser.add_argument("-d", "--dev", {
    help: "If set, runs a dev server for local iteration.",
    action: "store_true",
  });
  parser.add_argument("-p", "--prod", {
    help: "If set, runs setup suitable for production.",
    action: "store_true",
  });
  parser.add_argument("--staging", {
    help: "If set, runs setup suitable for staging.",
    action: "store_true",
  });
  parser.add_argument("--bun", {
    help: "If set, start the server using bun.",
    action: "store_true",
  });
  parser.add_argument("-k", "--keep", {
    help: "If set, keeps the worker on disconnect.",
    action: "store_true",
  });
  parser.add_argument("--gpu", {
    help: "If set, allows GPU acceleration.",
    action: "store_true",
  });
  parser.add_argument("-wt", "--workerType", {
    help: "The worker type to start.",
    choices: ["mac", "ls"],
  });
  return parser.parse_args();
}

function registerCleanup() {
  const cleanup = () => {
    while (cleanupOperations.length > 0) {
      cleanupOperations.pop()!();
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", cleanup);
  process.on("uncaughtException", cleanup);
}

function startWorker(args: any, workerType: string): Promise<void> {
  const childEnv = { ...process.env };

  let socketAddress = `http://localhost:${childEnv.PORT}`;
  if (args.prod === true) {
    socketAddress = `https://www.morcus.net`;
    childEnv.NODE_ENV = "production";
  }
  if (args.staging === true) {
    socketAddress = `https://dev.morcus.net`;
    childEnv.NODE_ENV = "production";
  }
  childEnv.SOCKET_ADDRESS = socketAddress;
  let workerFile = "";
  if (workerType === "mac") {
    workerFile = "src/web/workers/macronizer_processor.ts";
  }
  if (workerType === "ls") {
    workerFile = "src/web/workers/ls_worker.ts";
    if (args.ls_subset) {
      childEnv.LS_PATH = "testdata/ls/subset.xml";
    }
  }
  if (args.gpu === true) {
    childEnv.ALLOW_WORKERS_GPU = "true";
  }
  if (args.keep === true || args.prod === true) {
    childEnv.KEEP_WORKERS_ON_DISCONNECT = "true";
  }

  const child = spawnChild(["npm", "run", "ts-node", workerFile], childEnv);

  cleanupOperations.push(() => {
    console.log(`[run script] Cleaning up ${workerType}`);
    child.kill();
  });

  return processComplete(child);
}

function processComplete(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    child.on("close", resolve);
  });
}

async function awaitAll(workers: Promise<void>[]) {
  for (const worker of workers) {
    await worker;
  }
}

function spawnChild(command: string[], env?: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command[0], command.slice(1), {
    env: env,
    stdio: "inherit",
  });
  return child;
}

async function setupAndStartWebServer(args: any) {
  const setupSteps: StepConfig[] = [];

  // We use the hot dev server, so we don't need to pre-build;
  if (args.no_build_client === false && args.dev !== true) {
    writeCommitId();
    const buildCommand: string[] = ["npm", "run", "build-client"];
    const extraArgs: string[] = [];
    if (args.prod || args.staging) {
      extraArgs.push("--env", "production");
    }
    if (args.transpile_only) {
      extraArgs.push("--env", "transpileOnly");
    }
    if (extraArgs.length > 0) {
      buildCommand.push("--");
    }
    buildCommand.push(...extraArgs);
    setupSteps.push({
      operation: () => shellStep(buildCommand.join(" ")),
      label: "Building bundle",
      priority: 1,
    });
  }
  if (args.build_latin_inflections === true) {
    setupSteps.push({
      operation: makeMorpheusDb,
      label: "Building Latin inflection DB",
      priority: 1,
    });
  }
  if (args.build_sh === true) {
    const command = ["npm", "run", "ts-node", "src/scripts/process_sh.ts"];
    setupSteps.push({
      operation: () => shellStep(command.join(" ")),
      label: "Processing SH",
      priority: 2,
    });
  }
  if (args.build_ls === true) {
    const childEnv = { ...process.env };
    let baseCommand = ["npm", "run", "tsnp"];
    if (args.bun === true) {
      baseCommand = ["bun", "run"];
      childEnv.BUN = "1";
    }
    const command = baseCommand.concat(["src/scripts/process_ls.ts"]);
    setupSteps.push({
      operation: () => shellStep(command.join(" "), childEnv),
      label: "Processing LS",
      priority: 2,
    });
  }
  if (args.build_latin_library === true) {
    const command = ["npm", "run", "ts-node", "src/scripts/process_lat_lib.ts"];
    setupSteps.push({
      operation: () => shellStep(command.join(" ")),
      label: "Building Latin library",
      priority: 2,
    });
  }

  const setupSuccess = await runPipeline(setupSteps, { parallel: true });
  if (!setupSuccess) {
    return false;
  }
  startWebServer(args);
  return true;
}

function startWebServer(args: any) {
  const serverEnv = { ...process.env };
  if (args.prod === true) {
    serverEnv.NODE_ENV = "production";
  } else if (args.dev === true) {
    serverEnv.NODE_ENV = "dev";
  }
  if (args.real_database === false) {
    serverEnv.CONSOLE_TELEMETRY = "yes";
  }
  let baseCommand: string[] = ["npm", "run", "ts-node"];
  if (args.bun === true) {
    baseCommand = ["bun", "run"];
    serverEnv.BUN = "1";
  } else if (args.transpile_only === true) {
    baseCommand.push("--", "--transpile-only");
  }
  serverEnv.MAIN = "start";
  baseCommand.push("src/start_server.ts");
  runCommand(baseCommand.join(" "), serverEnv);
}

async function startLsEditor() {
  const editorRoot = "src/common/lewis_and_short/editor";
  const steps: StepConfig[] = [
    {
      operation: () =>
        shellStep("npx webpack --config webpack.editor.config.js"),
      label: "Building bundle",
    },
  ];
  assert(await runPipeline(steps));
  runCommand(`npm run ts-node ${editorRoot}/ls_interactive.ts`);
}
